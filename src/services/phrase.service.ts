import crypto from "crypto";
import { REQUIRED_PHRASES_COUNT, SEED_PHRASES } from "../data/phrases.fr";
import { Phrase } from "../models/Phrase";
import { User } from "../models/User";
import type { CreatePhrasesInput, ListPhrasesQuery } from "../validators/phrase.validator";

const PAGE_SIZE = REQUIRED_PHRASES_COUNT;
const MAX_EXTRA_PHRASES = 35;

// A stable per-user ordering: the same participant keeps their phrase set,
// while different participants receive a different ordering and graded set.
function userPhraseOrder(userId: string, phraseId: string): string {
  return crypto.createHash("sha256").update(`${userId}:${phraseId}`).digest("hex");
}

export async function listPhrases(userId: string, { page }: ListPhrasesQuery) {
  const [all, user] = await Promise.all([
    Phrase.find({ isActive: true }).select("text order").lean(),
    User.findById(userId).select("language").lean(),
  ]);

  const ordered = [...all].sort((a, b) =>
    userPhraseOrder(userId, String(a._id)).localeCompare(userPhraseOrder(userId, String(b._id))),
  );
  const assigned = ordered.slice(0, REQUIRED_PHRASES_COUNT + MAX_EXTRA_PHRASES);
  const required = assigned.slice(0, REQUIRED_PHRASES_COUNT);
  const practice = assigned.slice(REQUIRED_PHRASES_COUNT);
  const isRequiredPage = page === 1;
  const slice = isRequiredPage ? required : practice.slice((page - 2) * PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const consumed = isRequiredPage ? 0 : (page - 1) * PAGE_SIZE;

  return {
    language: user?.language ?? null,
    page,
    required: isRequiredPage,
    requiredCount: required.length,
    hasMore: practice.length > consumed,
    phrases: slice.map((phrase) => ({ id: String(phrase._id), text: phrase.text })),
  };
}

export async function createPhrases({ phrases }: CreatePhrasesInput) {
  const last = await Phrase.findOne().sort({ order: -1 }).select("order").lean();
  const start = (last?.order ?? 0) + 1;
  const docs = phrases.map((phrase, index) => ({ ...phrase, order: start + index }));
  try {
    const inserted = await Phrase.insertMany(docs, { ordered: false });
    return { created: inserted.length, skipped: docs.length - inserted.length };
  } catch (error) {
    const result = error as { insertedDocs?: unknown[]; writeErrors?: unknown[] };
    if (result.writeErrors && result.insertedDocs) return { created: result.insertedDocs.length, skipped: result.writeErrors.length };
    throw error;
  }
}

export async function seedPhrasesIfEmpty(): Promise<void> {
  if ((await Phrase.estimatedDocumentCount()) > 0) return;
  await Phrase.insertMany(SEED_PHRASES.map((phrase, index) => ({ ...phrase, order: index + 1 })));
  console.log(`Seeded ${SEED_PHRASES.length} phrases.`);
}
