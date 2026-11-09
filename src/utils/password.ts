import bcrypt from "bcryptjs";
import { env } from "../config/env";

/* =====================================================================
   PASSWORD HELPERS (bcrypt)
   Passwords are NEVER stored: only their hash.
   ===================================================================== */
export const hashPassword = (plainPassword: string): Promise<string> =>
  bcrypt.hash(plainPassword, env.BCRYPT_ROUNDS);

export const verifyPassword = (plainPassword: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plainPassword, hash);

/* Used when the account does not exist: we still run a bcrypt comparison
   so the response time does not reveal whether an email is registered. */
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", env.BCRYPT_ROUNDS);
export const fakeVerifyPassword = (plainPassword: string): Promise<boolean> =>
  bcrypt.compare(plainPassword, DUMMY_HASH);
