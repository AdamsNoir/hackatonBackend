import crypto from "crypto";
import { REQUIRED_PHRASES_COUNT, SEED_PHRASES } from "../data/phrases.fr";
import { Phrase } from "../models/Phrase";
import { User } from "../models/User";
import type { CreatePhrasesInput, ListPhrasesQuery } from "../validators/phrase.validator";

/* A participant never sees the whole pool: the 5 graded phrases, then at most
   MAX_PRACTICE_PHRASES extra ones (enough to fill the 2-5 minutes). The extra
   ones start at a different place for each person, and the total size of the
   pool is never sent to the browser. */
const PAGE_SIZE = REQUIRED_PHRASES_COUNT;
const MAX_PRACTICE_PHRASES = 35;

const startOffsetFor = (userId: string, poolSize: number): number =>
  poolSize === 0 ? 0 : parseInt(crypto.createHash("sha1").update(userId).digest("hex").slice(0, 8), 16) % poolSize;

export async function listPhrases(userId: string, { page }: ListPhrasesQuery) {
  const [all, user] = await Promise.all([
    Phrase.find({ isActive: true }).sort({ order: 1 }).select("text order").lean(),
    User.findById(userId).select("language").lean(),
  ]);

  const required = all.slice(0, REQUIRED_PHRASES_COUNT);
  const pool = all.slice(REQUIRED_PHRASES_COUNT);
  const offset = startOffsetFor(userId, pool.length);
  const practice = [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, MAX_PRACTICE_PHRASES);

  const isRequiredPage = page === 1;
  const slice = isRequiredPage ? required : practice.slice((page - 2) * PAGE_SIZE, (page - 1) * PAGE_SIZE);
  // More pages exist while practice phrases remain after this page
  const consumed = isRequiredPage ? 0 : (page - 1) * PAGE_SIZE;
  const hasMore = practice.length > consumed;

  return {
    language: user?.language ?? null,
    page,
    required: isRequiredPage,
    requiredCount: REQUIRED_PHRASES_COUNT,
    hasMore,
    phrases: slice.map((phrase) => ({ id: String(phrase._id), text: phrase.text })),
  };
}

/* Admin: append phrases after the existing ones (duplicates are skipped). */
export async function createPhrases({ phrases }: CreatePhrasesInput) {
  const last = await Phrase.findOne().sort({ order: -1 }).select("order").lean();
  const start = (last?.order ?? 0) + 1;
  const docs = phrases.map((phrase, index) => ({ ...phrase, order: start + index }));
  try {
    const inserted = await Phrase.insertMany(docs, { ordered: false });
    return { created: inserted.length, skipped: docs.length - inserted.length };
  } catch (error) {
    const result = error as { insertedDocs?: unknown[]; writeErrors?: unknown[] };
    if (result.writeErrors && result.insertedDocs) {
      return { created: result.insertedDocs.length, skipped: result.writeErrors.length };
    }
    throw error;
  }
}

/* Fills the empty collection with the 200 built-in phrases (run at startup). */
export async function seedPhrasesIfEmpty(): Promise<void> {
  if ((await Phrase.estimatedDocumentCount()) > 0) return;
  await Phrase.insertMany(SEED_PHRASES.map((phrase, index) => ({ ...phrase, order: index + 1 })));
  console.log(`Seeded ${SEED_PHRASES.length} phrases.`);
}
