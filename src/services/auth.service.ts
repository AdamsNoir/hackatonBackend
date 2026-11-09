import { SECURITY } from "../config/security";
import { toUserDTO } from "../mappers/user.mapper";
import { User } from "../models/User";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "../validators/auth.validator";
import { ApiError } from "../utils/ApiError";
import { signAccessToken } from "../utils/jwt";
import { fakeVerifyPassword, hashPassword, verifyPassword } from "../utils/password";
import { isCameroonPhone, normalizePhone } from "../utils/phone";

/* =====================================================================
   AUTH SERVICE
   Register, login (with lockout), change password, logout everywhere.
   Every function that logs someone in returns { token, user }
   which is exactly what the frontend expects.
   ===================================================================== */

const INVALID_CREDENTIALS = "Identifiants invalides."; // same message for unknown user / wrong password

export async function register(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);

  // Duplicate email/phone is caught by the unique indexes (-> 409 in the error handler)
  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    phone: normalizePhone(input.phone),
    passwordHash,
    language: input.language,
  });

  return { token: signAccessToken(user.id, user.role, user.tokenVersion), user: toUserDTO(user) };
}

export async function login({ identifier, password }: LoginInput) {
  // The identifier can be an email or a phone number
  const filter = identifier.includes("@")
    ? { email: identifier.toLowerCase() }
    : isCameroonPhone(identifier)
      ? { phone: normalizePhone(identifier) }
      : null;

  const user = filter ? await User.findOne(filter).select("+passwordHash") : null;

  if (!user) {
    await fakeVerifyPassword(password); // same response time as a real check
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  if (!user.isActive) throw ApiError.forbidden("Ce compte est désactivé.");

  // Locked after too many wrong passwords
  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
    throw ApiError.tooManyRequests(`Compte temporairement verrouillé. Réessayez dans ${minutes} minute(s).`);
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);

  if (!passwordOk) {
    const updated = await User.findByIdAndUpdate(user._id, { $inc: { failedLoginAttempts: 1 } }, { new: true });
    if (updated && updated.failedLoginAttempts >= SECURITY.maxFailedLogins) {
      await User.updateOne(
        { _id: user._id },
        { $set: { lockUntil: new Date(Date.now() + SECURITY.lockMinutes * 60000), failedLoginAttempts: 0 } },
      );
    }
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  // Success: reset the counters
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  return { token: signAccessToken(user.id, user.role, user.tokenVersion), user: toUserDTO(user) };
}

export async function getCurrentUser(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("Utilisateur introuvable.");
  return toUserDTO(user);
}

/* Changes the password and logs out every other device. */
export async function changePassword(userId: string, { currentPassword, newPassword }: ChangePasswordInput) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) throw ApiError.notFound("Utilisateur introuvable.");

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest("Le mot de passe actuel est incorrect.");
  }
  if (currentPassword === newPassword) {
    throw ApiError.badRequest("Le nouveau mot de passe doit être différent de l'ancien.");
  }

  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1; // all old tokens stop working
  await user.save();

  // Give back a fresh token so the current device stays logged in
  return { token: signAccessToken(user.id, user.role, user.tokenVersion), user: toUserDTO(user) };
}

/* Logs the user out of ALL devices (old tokens become invalid). */
export async function logoutEverywhere(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}
