const asyncHandler = require("express-async-handler");
const SupportTicket = require("../models/SupportTicket");
const { writeAuditLog } = require("../utils/auditLog");
const { AppError } = require("../utils/errorHandler");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { getCached } = require("../utils/ttlCache");
const performanceConfig = require("../config/performance");

// GET /api/v1/admin/support/tickets
exports.getTickets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) filter.subject = { $regex: req.query.search, $options: "i" };

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .select("-messages")
      .populate("userId", "name email")
      .sort({ status: 1, lastMessageAt: -1 }) // open/pending tickets surface first
      .skip(skip).limit(limit)
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: tickets,
    pagination: paginationMeta({ page, limit, total }),
  });
});

// GET /api/v1/admin/support/tickets/stats
exports.getTicketStats = asyncHandler(async (req, res) => {
  const stats = await getCached("admin:support:stats:v1", performanceConfig.cache.statsTtlMs, async () => {
    const counts = await SupportTicket.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const result = { open: 0, pending: 0, closed: 0, total: 0 };
    counts.forEach(({ _id, count }) => {
      if (_id in result) result[_id] = count;
      result.total += count;
    });
    return result;
  });
  res.json({ success: true, data: stats });
});

// GET /api/v1/admin/support/tickets/:id
exports.getTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id)
    .populate("userId", "name email companyName")
    .populate("messages.senderId", "name role")
    .populate("licenseId", "licenseKey status");
  if (!ticket) throw new AppError("Ticket not found.", 404);
  res.json({ success: true, data: ticket });
});

// POST /api/v1/admin/support/tickets/:id/reply
exports.replyToTicket = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) throw new AppError("Message cannot be empty.", 422);

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new AppError("Ticket not found.", 404);

  ticket.messages.push({ senderId: req.user._id, senderRole: req.user.role, body: message.trim() });
  ticket.lastMessageAt = new Date();
  // Admin reply puts the ball back in the customer's court
  ticket.status = "pending";
  if (!ticket.assignedAgentId) ticket.assignedAgentId = req.user._id;
  await ticket.save();

  res.json({ success: true, message: "Reply sent.", data: ticket });
});

// PATCH /api/v1/admin/support/tickets/:id/status
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["open", "pending", "closed"].includes(status)) throw new AppError("Invalid status.", 422);

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new AppError("Ticket not found.", 404);

  ticket.status = status;
  ticket.closedAt = status === "closed" ? new Date() : null;
  await ticket.save();

  await writeAuditLog({
    actor: req.user, action: "support.status_changed",
    targetType: "SupportTicket", targetId: ticket._id,
    metadata: { status }, ip: req.ip,
  });

  res.json({ success: true, message: `Ticket marked as ${status}.`, data: ticket });
});
