import app from "./app";
import { connectDatabase, disconnectDatabase } from "./config/db";
import { env } from "./config/env";
import { seedPhrasesIfEmpty } from "./services/phrase.service";
import { retryPendingMigrations } from "./services/submission.service";

/* Entry point: connect to MongoDB, start listening, stop cleanly. */
async function startServer(): Promise<void> {
  await connectDatabase();
  await seedPhrasesIfEmpty();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 API running on http://localhost:${env.PORT}/api`);
  });

  // Retry audio files that are still on disk: once at startup, then every 10 minutes
  const sweep = () => void retryPendingMigrations().catch((error) => console.error("Migration sweep failed:", error));
  setTimeout(sweep, 10_000).unref();
  setInterval(sweep, 10 * 60 * 1000).unref();

  // Clean shutdown (Ctrl+C or the hosting platform stopping the app)
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // force exit after 10s
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));

startServer().catch((error) => {
  console.error("❌ Could not start the server:", error);
  process.exit(1);
});
