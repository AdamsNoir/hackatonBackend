import type { UserDocument, UserRole } from "../models/User";

/* =====================================================================
   USER MAPPER
   What the frontend receives about a user.
   SECURITY: the password hash and security counters are never sent.
   ===================================================================== */
export interface UserDTO {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  language?: string;
  role: UserRole;
}

export const toUserDTO = (user: UserDocument): UserDTO => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  avatarUrl: user.avatarUrl ?? undefined,
  language: user.language ?? undefined,
  role: user.role as UserRole,
});
