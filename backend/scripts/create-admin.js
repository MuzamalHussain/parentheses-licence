#!/usr/bin/env node
/**
 * Creates (or promotes) an admin user directly in the database — bypasses
 * the public registration + email verification flow, since the very first
 * admin account can't be created any other way (there's no admin yet to
 * grant the role).
 *
 * Usage:
 *   node scripts/create-admin.js admin@parentheses.test AdminPass123
 *
 * Or set ADMIN_EMAIL / ADMIN_PASSWORD env vars and run with no args.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../src/config/db");
const User = require("../src/models/User");

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL || "admin@parentheses.test";
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || "AdminPass123";

  await connectDB();

  let user = await User.findOne({ email });

  if (user) {
    user.passwordHash = await bcrypt.hash(password, 12);
    user.role = "admin";
    user.emailVerified = true;
    user.isActive = true;

    await user.save({ validateBeforeSave: false });

    console.log(`Existing user ${email} password reset and promoted to admin.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    user = await User.create({
      name: "Admin",
      email,
      passwordHash,
      role: "admin",
      emailVerified: true,
      isActive: true,
    });
    console.log(`Admin user created: ${email} / ${password}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create admin:", err);
  process.exit(1);
});
