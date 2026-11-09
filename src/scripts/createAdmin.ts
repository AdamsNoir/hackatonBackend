import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { User } from "../models/User";
import { hashPassword } from "../utils/password";
import { normalizePhone } from "../utils/phone";
import { passwordSchema } from "../validators/auth.validator";

/* =====================================================================
   CREATE ADMIN (jury account)
   Usage:
     ADMIN_EMAIL=jury@example.com ADMIN_PASSWORD='Str0ngPassw0rd' \
     ADMIN_NAME='Jury Principal' ADMIN_PHONE=677000000 npm run create-admin
   If the email already exists, that user is promoted to admin.
   ===================================================================== */
async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required.");
  }
  passwordSchema.parse(password); // same password rules as users

  await connectDatabase();

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = "admin";
    existing.tokenVersion += 1;
    await existing.save();
  } else {
    await User.create({
      fullName: process.env.ADMIN_NAME ?? "Administrateur Jury",
      email,
      phone: normalizePhone(process.env.ADMIN_PHONE ?? "600000000"),
      passwordHash: await hashPassword(password),
      role: "admin",
    });
    console.log(`✅ Admin ${email} created.`);
  }
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error("❌", error.message ?? error);
  await disconnectDatabase();
  process.exit(1);
});
