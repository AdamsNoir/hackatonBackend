import "dotenv/config";
import fs from "fs";
import path from "path";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { exportFileName, writeExport, type ExportKind } from "../services/export.service";

/* =====================================================================
   EXPORT RECORDINGS FROM THE COMMAND LINE (for big exports)
   Usage:
     npm run export-data -- freestyle                 -> ./exports/freestyle-voice-data-DATE.zip
     npm run export-data -- contest --out ./my-folder
     npm run export-data -- contest --personal        (adds name, email, phone)
   Needs the same .env as the server (MONGODB_URI, CLOUDINARY_*).
   ===================================================================== */
async function main() {
  const args = process.argv.slice(2);
  const kind = args.find((a) => a === "freestyle" || a === "contest") as ExportKind | undefined;
  if (!kind) throw new Error('Choose what to export: "freestyle" or "contest".');
  const outIndex = args.indexOf("--out");
  const outDir = path.resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : "exports");
  const includePersonal = args.includes("--personal");

  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, exportFileName(kind));

  await connectDatabase();
  try {
    const out = fs.createWriteStream(target);
    const summary = await writeExport(kind, out, {
      includePersonal,
      onProgress: (done, total, file) => console.log(`[${done}/${total}] ${file}`),
    });
    console.log(`\n✅ ${target}\n   ${summary.ok}/${summary.total} audio files exported${summary.failed ? `, ${summary.failed} FAILED (see Notes / manifest.csv)` : ""}.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : error);
  process.exit(1);
});
