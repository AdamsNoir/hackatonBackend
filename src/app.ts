import "./config/zod";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { allowedOrigins, env } from "./config/env";
import { SECURITY } from "./config/security";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { globalLimiter } from "./middlewares/rateLimit.middleware";
import { sanitizeRequest } from "./middlewares/sanitize.middleware";
import routes from "./routes";

/* =====================================================================
   EXPRESS APP
   Order matters: security first, then parsing, then routes, errors last.
   ===================================================================== */
const app = express();

app.set("trust proxy", env.TRUST_PROXY); // real visitor IP behind a proxy
app.disable("x-powered-by");

// ----- Security headers (HSTS, no sniffing, no framing, ...) -----
app.use(helmet());

// ----- CORS: only your frontend(s) may call the API -----
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ----- Logs -----
if (env.NODE_ENV !== "test") app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// ----- Rate limit, body parsing (small limit), NoSQL-injection filter -----
app.use(globalLimiter);
app.use(express.json({ limit: SECURITY.jsonBodyLimit }));
app.use(sanitizeRequest);

// ----- Routes -----
app.use("/api", routes);

// These two must stay LAST
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
