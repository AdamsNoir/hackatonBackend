import mongoose from "mongoose";
import { env } from "./env";

/* Connects to MongoDB. Called once from server.ts. */
export async function connectDatabase(): Promise<void> {
  // SECURITY: stops NoSQL injection like { email: { $gt: "" } } in queries
  mongoose.set("sanitizeFilter", true);
  await mongoose.connect(env.MONGODB_URI);
  console.log("✅ MongoDB connected");
}

export const disconnectDatabase = () => mongoose.disconnect();
