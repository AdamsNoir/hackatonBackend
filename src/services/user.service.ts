import { toUserDTO } from "../mappers/user.mapper";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { normalizePhone } from "../utils/phone";
import type { UpdateProfileInput } from "../validators/user.validator";

/* Updates the profile of the logged-in user (name, phone, language). */
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const changes: Record<string, string> = {};
  if (input.fullName) changes.fullName = input.fullName;
  if (input.phone) changes.phone = normalizePhone(input.phone);
  if (input.language) changes.language = input.language;

  // A duplicate phone number is caught by the unique index (-> 409)
  const user = await User.findByIdAndUpdate(userId, { $set: changes }, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound("Utilisateur introuvable.");
  return toUserDTO(user);
}
