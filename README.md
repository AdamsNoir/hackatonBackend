# CMTVC Backend (Node + Express + TypeScript + MongoDB)

Complete API for the Cameroonian Mother Tongue Vocabulary Contest:
accounts, secure login, voice upload, jury evaluation, leaderboard.

## Run it
```bash
npm install
cp .env.example .env      # edit MONGODB_URI and JWT_SECRET (see the file)
npm run dev               # http://localhost:5000/api
```
Create the jury (admin) account:
```bash
ADMIN_EMAIL=jury@example.com ADMIN_PASSWORD='Str0ngPassw0rd' ADMIN_NAME='Jury' ADMIN_PHONE=677000000 npm run create-admin
```
Production: `npm run build && npm start` (admin: `npm run create-admin:prod`).

## Folder structure
```
src/
├── server.ts / app.ts      start-up / express setup (security order matters)
├── config/                 env, db, security numbers, audio rules, zod (French messages)
├── models/                 User, Submission (MongoDB schemas)
├── validators/             zod schemas: what the frontend may send
├── routes/                 URL -> middlewares -> controller
├── controllers/            read request, call service, send response
├── services/               business logic (auth, lockout, upload checks, leaderboard)
├── mappers/                MongoDB document -> JSON for the frontend
├── middlewares/            auth, validate, sanitize, rate limit, quota, upload, errors
├── utils/                  ApiError, jwt, password, phone, audio helpers
└── scripts/                createAdmin.ts
```

## Endpoints
| Method | URL                               | Access        | What |
|--------|-----------------------------------|---------------|------|
| POST   | /api/auth/register                | public        | `{fullName, phone, email, password, language?}` -> `{token, user}` |
| POST   | /api/auth/login                   | public        | `{identifier, password}` (identifier = email **or** phone) -> `{token, user}` |
| GET    | /api/auth/me                      | logged in     | current user |
| POST   | /api/auth/change-password         | logged in     | `{currentPassword, newPassword}` -> new `{token, user}`; other devices logged out |
| POST   | /api/auth/logout                  | logged in     | logs out of ALL devices (revokes tokens) |
| PATCH  | /api/users/me                     | logged in     | update `fullName`, `phone`, `language` |
| POST   | /api/submissions                  | logged in     | upload voice (multipart: `audio`, `durationSeconds`) |
| GET    | /api/submissions/mine             | logged in     | "Mes soumissions" table |
| GET    | /api/submissions/:id/audio        | owner / admin | stream the audio (supports seeking) |
| GET    | /api/leaderboard?limit=100        | logged in     | ranking table |
| GET    | /api/submissions?status=&page=&limit= | admin     | all submissions + participant, paginated |
| PATCH  | /api/submissions/:id/evaluate     | admin         | `{status:"evaluated", score:0-100}` or `{status:"rejected"}` |
| GET    | /api/submissions/stats            | admin         | counts by status |
| GET    | /api/health                       | public        | health check |

Errors are always `{ "message": "..." }` (plus `errors: {field: [...]}` for validation),
which is what the frontend `apiClient` already displays.

Browser note: an `<audio src>` tag cannot send the Authorization header. To play
`/submissions/:id/audio` in the frontend, `fetch` it with the token, then use
`URL.createObjectURL(await response.blob())`.

## Security built in
- **Passwords:** bcrypt (cost 12), 8-72 chars with a letter and a digit. Never returned by the API.
- **Login:** same message for unknown user / wrong password, constant-time check,
  account locked 15 min after 5 wrong passwords, only failed logins count toward the IP rate limit.
- **Tokens (JWT):** HS256 only, issuer + audience checked, 1 day expiry (change `JWT_EXPIRES_IN`).
  Every request re-checks the user exists, is active, and `tokenVersion` matches, so
  logout / password change revokes old tokens instantly.
- **Roles:** `participant` and `admin`. The role can never be set through the API
  (register and profile ignore it); admins are created with the script.
- **Injection:** zod rejects non-string input, a sanitizer strips `$`/`.` keys, and
  Mongoose `sanitizeFilter` is on.
- **Rate limiting:** global 300 / 15 min, login 10 failed / 15 min, register 10 / hour,
  upload 20 / hour per user (numbers in `config/security.ts`).
- **Headers & CORS:** helmet (HSTS, CSP, no sniffing/framing), only `CLIENT_ORIGIN` may call the API,
  10 KB JSON limit, no `x-powered-by`.
- **Uploads:** extension + type whitelist, 15 MB, random file names (the user's name is never
  used on disk), real audio parsing (a renamed .txt is refused), real duration check, max 5
  submissions per user (checked before writing anything), rejected files deleted.
  Files are not in a public folder: only the owner or an admin can stream them,
  and other users get a 404 (no confirmation the file exists).
- **Errors:** no stack traces or internal details in production.

## Before going live
1. Use HTTPS (the hosting platform or nginx) and set `NODE_ENV=production`, `TRUST_PROXY=1` behind one proxy.
2. Use a long random `JWT_SECRET` and a MongoDB user with a password (or Atlas). Never commit `.env`.
3. Set `CLIENT_ORIGIN` to your real frontend address.
4. Back up the `uploads/` folder, or move files to S3-style storage when you scale.
5. Not included (next steps): password reset by email/SMS, email/phone verification, refresh tokens.
