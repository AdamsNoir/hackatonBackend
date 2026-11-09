/* =====================================================================
   SECURITY & CONTEST SETTINGS
   Every number that controls security or contest rules is here.
   ===================================================================== */
export const SECURITY = {
  // ----- Login protection -----
  maxFailedLogins: 5, // wrong passwords before the account is locked...
  lockMinutes: 15, // ...for this many minutes

  // ----- JWT (login token) -----
  jwtIssuer: "cmtvc-api",
  jwtAudience: "cmtvc-web",

  // ----- Request size -----
  jsonBodyLimit: "10kb",

  // ----- Rate limits (requests per window, per visitor) -----
  rateLimit: {
    global: { windowMs: 15 * 60 * 1000, limit: 300 }, // whole API
    login: { windowMs: 15 * 60 * 1000, limit: 10 }, // only FAILED logins count
    register: { windowMs: 60 * 60 * 1000, limit: 10 },
    upload: { windowMs: 60 * 60 * 1000, limit: 20 },
  },
} as const;

export const CONTEST_RULES = {
  maxSubmissionsPerUser: 5,
} as const;
