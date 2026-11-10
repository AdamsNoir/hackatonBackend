import "dotenv/config";
import { z } from "zod";

/* =====================================================================
   ENVIRONMENT VARIABLES
   Read from the ".env" file and checked at startup.
   If something is missing the server stops with a clear message.
   ===================================================================== */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must have at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("uploads"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const cloudinaryValues = [
  parsed.data.CLOUDINARY_CLOUD_NAME,
  parsed.data.CLOUDINARY_API_KEY,
  parsed.data.CLOUDINARY_API_SECRET,
];

if (cloudinaryValues.some(Boolean) && !cloudinaryValues.every(Boolean)) {
  console.error("❌ Configure all three Cloudinary variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
  process.exit(1);
}

export const env = parsed.data;

/* CLIENT_ORIGIN can contain several addresses separated by commas. */
export const allowedOrigins: string[] = env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim());
