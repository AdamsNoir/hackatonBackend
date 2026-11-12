import "dotenv/config";
import mongoose from "mongoose";
import cloudinary, { cloudinaryConfigured } from "../config/cloudinary";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { CONTEST_LANGUAGES } from "../config/languages";
import { Submission } from "../models/Submission";
import { User } from "../models/User";
import { getGradedPhraseTexts, seedPhrasesIfEmpty } from "../services/phrase.service";
import { hashPassword } from "../utils/password";

/* =====================================================================
   SEED THE DATABASE WITH TEST DATA
   Usage:
     npm run seed                              (fake audio references)
     npm run seed -- --audio=./sample.mp3      (also uploads a real test audio
                                                to Cloudinary so "Écouter" works)
     npm run seed -- --force                   (allow it when NODE_ENV=production)

   Creates: the 200 phrases, 1 admin, 18 participants (2 per contest language)
   and ~25 submissions: pending, validated (with scores) and rejected.
   Safe to run again: it first removes ONLY the previous seed data
   (accounts whose email ends with @seed.test).
   ===================================================================== */
const PASSWORD = "Seed1234"; // same password for every seeded account
const EMAIL_DOMAIN = "@seed.test";

const FIRST_NAMES = ["Abena", "Mbarga", "Hamadou", "Kamga", "Ngono", "Tchoua", "Biya", "Fotso", "Essomba", "Njoya", "Atangana", "Ndam", "Mvondo", "Tamba", "Nkeng", "Ayissi", "Manga", "Efoulou"];
const LAST_NAMES = ["Marie", "Paul", "Aïcha", "Jean", "Rose", "Samuel", "Estelle", "Brice", "Clarisse", "Eric", "Judith", "Martin", "Pauline", "Joseph", "Nadège", "Thierry", "Odile", "Hervé"];

// Tiny deterministic random generator: the same data every time you seed
let state = 20260101;
const random = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const between = (min: number, max: number) => Math.floor(min + random() * (max - min + 1));

// Planned submissions for each participant (index % 6)
const PLANS: Array<Array<"pending" | "evaluated" | "rejected">> = [
  [], // no submission yet
  ["pending"],
  ["evaluated"],
  ["rejected", "evaluated"], // second try after a rejection
  ["pending", "pending"],
  ["evaluated", "pending"],
];

async function uploadSampleAudio(file: string, publicId: string) {
  await cloudinary.uploader.upload(file, { resource_type: "video", type: "authenticated", public_id: publicId, overwrite: true });
}

async function main() {
  const force = process.argv.includes("--force");
  const audioFile = process.argv.find((arg) => arg.startsWith("--audio="))?.slice("--audio=".length);

  if (process.env.NODE_ENV === "production" && !force) {
    throw new Error("Refusing to seed with NODE_ENV=production. Add --force if you really want to.");
  }
  if (audioFile && !cloudinaryConfigured) throw new Error("--audio needs the three CLOUDINARY_* variables in your .env.");

  await connectDatabase();
  await seedPhrasesIfEmpty();

  // ----- 1. Remove the previous seed data (only @seed.test accounts) -----
  const old = await User.find({ email: new RegExp(`${EMAIL_DOMAIN.replace(".", "\\.")}$`) }).select("_id");
  if (old.length) {
    const ids = old.map((user) => user._id);
    await Submission.deleteMany({ user: mongoose.trusted({ $in: ids }) });
    await User.deleteMany({ _id: mongoose.trusted({ $in: ids }) });
    console.log(`🧹 Removed ${old.length} previous seed accounts.`);
  }

  // ----- 2. Accounts -----
  const passwordHash = await hashPassword(PASSWORD);
  await User.create({
    fullName: "Jury Test",
    email: `admin${EMAIL_DOMAIN}`,
    phone: "+237670000000",
    passwordHash,
    role: "admin",
  });

  const participants = [];
  for (let i = 0; i < CONTEST_LANGUAGES.length * 2; i++) {
    participants.push(
      await User.create({
        fullName: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`,
        email: `participant${i + 1}${EMAIL_DOMAIN}`,
        phone: `+2376700001${String(i).padStart(2, "0")}`,
        passwordHash,
        language: CONTEST_LANGUAGES[i % CONTEST_LANGUAGES.length],
        role: "participant",
      }),
    );
  }

  // ----- 3. Submissions -----
  const admin = await User.findOne({ email: `admin${EMAIL_DOMAIN}` }).select("_id");
  let count = 0;
  for (const [index, user] of participants.entries()) {
    const phrases = await getGradedPhraseTexts(user.id); // also saves the 5 phrases on the user
    for (const status of PLANS[index % PLANS.length]) {
      const durationSeconds = between(125, 295);
      const publicId = `mother-tongue-contest/voices/${user.id}/seed-${count + 1}`;
      if (audioFile) await uploadSampleAudio(audioFile, publicId);

      const createdAt = new Date(Date.now() - between(1, 9) * 24 * 3600 * 1000 - between(0, 20) * 3600 * 1000);
      await Submission.create({
        user: user._id,
        fileName: `enregistrement-${count + 1}.webm`,
        publicId,
        format: "webm",
        sizeBytes: durationSeconds * 16_000,
        durationSeconds,
        phrases,
        status,
        score: status === "evaluated" ? between(52, 98) : null,
        evaluatedAt: status === "pending" ? undefined : createdAt,
        evaluatedBy: status === "pending" ? undefined : admin?._id,
        createdAt,
        updatedAt: createdAt,
      });
      count += 1;
    }
  }

  console.log(`\n✅ Seed done: ${participants.length} participants, ${count} submissions, 200 phrases.`);
  console.log(`   Admin       : admin${EMAIL_DOMAIN}  /  ${PASSWORD}`);
  console.log(`   Participant : participant1${EMAIL_DOMAIN} ... participant${participants.length}${EMAIL_DOMAIN}  /  ${PASSWORD}`);
  console.log(audioFile ? "   Audio       : sample uploaded for every submission." : "   Audio       : fake references (the Écouter button will fail). Use --audio=./sample.mp3 to test playback.");
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error("❌", error.message ?? error);
  await disconnectDatabase();
  process.exit(1);
});
