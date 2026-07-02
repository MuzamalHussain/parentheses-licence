const asyncHandler = require("express-async-handler");
const SupportTicket = require("../models/SupportTicket");
const License = require("../models/License");
const { AppError } = require("../utils/errorHandler");
const { getPagination, paginationMeta } = require("../utils/pagination");
const performanceConfig = require("../config/performance");

// GET /api/v1/support/tickets — customer's own tickets
exports.getMyTickets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, {
    maxLimit: performanceConfig.pagination.customerMaxLimit,
  });

  const filter = { userId: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .select("-messages") // list view doesn't need full thread
      .sort({ lastMessageAt: -1 })
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

// GET /api/v1/support/tickets/:id
exports.getMyTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user._id })
    .populate("messages.senderId", "name role")
    .populate("licenseId", "licenseKey");
  if (!ticket) throw new AppError("Ticket not found.", 404);
  res.json({ success: true, data: ticket });
});

// POST /api/v1/support/tickets
exports.createTicket = asyncHandler(async (req, res) => {
  const { subject, message, licenseId } = req.body;

  if (licenseId) {
    const license = await License.exists({ _id: licenseId, userId: req.user._id });
    if (!license) throw new AppError("License not found on your account.", 404);
  }

  const ticket = await SupportTicket.create({
    userId: req.user._id,
    subject,
    licenseId: licenseId || null,
    messages: [{ senderId: req.user._id, senderRole: "customer", body: message }],
    lastMessageAt: new Date(),
  });

  res.status(201).json({ success: true, message: "Ticket created. Our team will respond soon.", data: ticket });
});

// POST /api/v1/support/tickets/:id/reply
exports.replyToTicket = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) throw new AppError("Message cannot be empty.", 422);

  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user._id });
  if (!ticket) throw new AppError("Ticket not found.", 404);
  if (ticket.status === "closed") throw new AppError("This ticket is closed. Please open a new one.", 400);

  ticket.messages.push({ senderId: req.user._id, senderRole: "customer", body: message.trim() });
  ticket.lastMessageAt = new Date();
  // Customer reply on a "pending" (awaiting customer) ticket reopens it to "open" (awaiting admin)
  if (ticket.status === "pending") ticket.status = "open";
  await ticket.save();

  res.json({ success: true, message: "Reply sent.", data: ticket });
});
