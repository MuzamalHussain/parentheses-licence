const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { AppError } = require("../utils/errorHandler");
const { ROLES } = require("../utils/constants");
const { getPagination, paginationMeta } = require("../utils/pagination");

// GET /api/v1/admin/users
exports.getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("name email role companyName emailVerified twoFactorEnabled isActive createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: users.map((u) => ({ ...u, id: u._id })),
    pagination: paginationMeta({ page, limit, total }),
  });
});

// GET /api/v1/admin/users/:id
exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found.", 404);
  res.json({ success: true, data: user.toSafeJSON() });
});

// PATCH /api/v1/admin/users/:id/role
exports.updateRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!Object.values(ROLES).includes(role)) throw new AppError("Invalid role.", 422);
  if (req.params.id === req.user._id.toString()) throw new AppError("Cannot change your own role.", 403);

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) throw new AppError("User not found.", 404);
  res.json({ success: true, message: "Role updated.", data: user.toSafeJSON() });
});

// PATCH /api/v1/admin/users/:id/toggle-active
exports.toggleActive = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) throw new AppError("Cannot deactivate yourself.", 403);
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found.", 404);
  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, message: `User ${user.isActive ? "activated" : "deactivated"}.`, data: user.toSafeJSON() });
});
