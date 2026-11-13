import archiver from "archiver";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import type { Writable } from "stream";
import cloudinary, { cloudinaryConfigured } from "../config/cloudinary";
import { FreestyleRecording } from "../models/FreestyleRecording";
import { Phrase } from "../models/Phrase";
import { Submission } from "../models/Submission";
import { User } from "../models/User";
import { pickRequiredPhrases } from "./phrase.service";

/* =====================================================================
   EXPORT SERVICE  (admin "harvest")
   Builds ONE zip per kind of recording:

     freestyle-voice-data-2026-11-13.zip
       voice_data_freestyle.xlsx   one tab per participant (same layout as
                                   the "voice data collection sheet")
       manifest.csv                one line per audio file (for scripts / ML)
       audio/P01/P01_001.webm      the recordings, one folder per participant

   kind "freestyle": 1 audio file = 1 phrase (normal tone, then mad tone).
   kind "contest"  : 1 audio file = the participant's 5 graded phrases.
                     Those 5 rows all point to the same audio file.

   Participant codes (P01, P02...) follow the account creation order, so a
   person keeps the same code in every export and in both kinds.
   ===================================================================== */
export type ExportKind = "freestyle" | "contest";

export interface ExportOptions {
  includePersonal: boolean; // add name / email / phone (otherwise the export is anonymous)
  onProgress?: (done: number, total: number, fileName: string) => void;
}

export interface Person {
  code: string;
  fullName: string;
  email: string;
  phone: string;
  language: string;
}

export type AudioSource =
  | { type: "cloudinary"; publicId: string; format: string }
  | { type: "local"; filePath: string }
  | { type: "none" };

export interface PhraseRef {
  id: string;
  text: string;
  category: string;
}

export interface AudioEntry {
  person: Person;
  fileName: string; // P01_001.webm
  zipPath: string; // audio/P01/P01_001.webm
  source: AudioSource;
  phrases: PhraseRef[]; // freestyle: 1 phrase. contest: the graded phrases of this voice
  tone: string;
  durationSeconds: number;
  madToneStartSeconds: number | null; // freestyle only
  status: string | null; // contest only: pending / evaluated / rejected
  score: number | null; // contest only
  phraseSource: "saved" | "reconstructed" | null; // contest only
  recordingId: string;
  createdAt: Date;
  error?: string; // set when the audio could not be fetched
}

export interface ExportData {
  kind: ExportKind;
  entries: AudioEntry[];
}

/* ---------------------------------------------------------------------
   1. READ THE DATABASE
   --------------------------------------------------------------------- */
const cleanExt = (value?: string | null): string => {
  const ext = (value ?? "").replace(/^\./, "").toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : "";
};

async function loadPeople(): Promise<(userId: string) => Person> {
  const users = await User.find().sort({ createdAt: 1, _id: 1 }).select("fullName email phone language role").lean();
  const counters = { P: 0, A: 0, X: 0 };
  const people = new Map<string, Person>();
  const make = (prefix: "P" | "A" | "X", user?: { fullName: string; email: string; phone: string; language?: string | null }): Person => {
    counters[prefix] += 1;
    return {
      code: `${prefix}${String(counters[prefix]).padStart(2, "0")}`,
      fullName: user?.fullName ?? "(compte supprimé)",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      language: user?.language ?? "",
    };
  };
  for (const user of users) people.set(String(user._id), make(user.role === "admin" ? "A" : "P", user));
  // P = participant, A = admin account, X = account deleted after recording
  return (userId) => {
    let person = people.get(userId);
    if (!person) {
      person = make("X");
      people.set(userId, person);
    }
    return person;
  };
}

async function collectFreestyle(): Promise<ExportData> {
  const [personOf, recordings] = await Promise.all([
    loadPeople(),
    FreestyleRecording.find().sort({ createdAt: 1 }).populate("phrase", "text category").lean(),
  ]);

  const counters = new Map<string, number>();
  const entries: AudioEntry[] = [];
  for (const rec of recordings) {
    const person = personOf(String(rec.user));
    const n = (counters.get(person.code) ?? 0) + 1;
    counters.set(person.code, n);

    const phrase = rec.phrase as unknown as { _id?: unknown; text?: string; category?: string } | null;
    const fileName = `${person.code}_${String(n).padStart(3, "0")}.${cleanExt(rec.cloudinaryFormat) || "webm"}`;
    const hasMad = rec.angryStartSeconds !== null && rec.angryStartSeconds !== undefined;
    entries.push({
      person,
      fileName,
      zipPath: `audio/${person.code}/${fileName}`,
      source: { type: "cloudinary", publicId: rec.cloudinaryPublicId, format: rec.cloudinaryFormat },
      phrases: [{ id: String(phrase?._id ?? ""), text: phrase?.text ?? "(phrase supprimée)", category: phrase?.category ?? "general" }],
      tone: hasMad ? "Neutral + Angry" : "Neutral",
      durationSeconds: rec.durationSeconds,
      madToneStartSeconds: hasMad ? (rec.angryStartSeconds as number) : null,
      status: null,
      score: null,
      phraseSource: null,
      recordingId: String(rec._id),
      createdAt: rec.createdAt,
    });
  }
  return { kind: "freestyle", entries };
}

async function collectContest(): Promise<ExportData> {
  const [personOf, submissions, pool] = await Promise.all([
    loadPeople(),
    Submission.find().sort({ createdAt: 1 }).lean(),
    Phrase.find({ isActive: true }).select("text category").lean(),
  ]);

  const counters = new Map<string, number>();
  const entries: AudioEntry[] = [];
  for (const sub of submissions) {
    const person = personOf(String(sub.user));
    const n = (counters.get(person.code) ?? 0) + 1;
    counters.set(person.code, n);

    // Saved at upload time = exact. Older submissions: rebuilt from the participant's current set.
    const saved = sub.phrases?.length
      ? sub.phrases.map((p) => ({ id: String(p.phrase), text: p.text, category: p.category ?? "general" }))
      : null;
    const phrases =
      saved ??
      pickRequiredPhrases(pool, String(sub.user)).map((p) => ({ id: String(p._id), text: p.text, category: p.category ?? "general" }));

    const ext = cleanExt(sub.cloudinaryFormat) || cleanExt(path.extname(sub.storedFileName ?? "")) || cleanExt(path.extname(sub.fileName)) || "webm";
    const fileName = `${person.code}_S${n}.${ext}`;
    const source: AudioSource =
      sub.cloudinaryPublicId && sub.cloudinaryFormat
        ? { type: "cloudinary", publicId: sub.cloudinaryPublicId, format: sub.cloudinaryFormat }
        : sub.storedFileName
          ? { type: "local", filePath: path.resolve(process.cwd(), "uploads", "audio", path.basename(sub.storedFileName)) }
          : { type: "none" };

    entries.push({
      person,
      fileName,
      zipPath: `audio/${person.code}/${fileName}`,
      source,
      phrases,
      tone: "Neutral",
      durationSeconds: sub.durationSeconds,
      madToneStartSeconds: null,
      status: sub.status,
      score: sub.score ?? null,
      phraseSource: saved ? "saved" : "reconstructed",
      recordingId: String(sub._id),
      createdAt: sub.createdAt,
    });
  }
  return { kind: "contest", entries };
}

export const collectExportData = (kind: ExportKind): Promise<ExportData> =>
  kind === "freestyle" ? collectFreestyle() : collectContest();

/* ---------------------------------------------------------------------
   2. FETCH ONE AUDIO FILE (whole file in memory: max ~15 MB at a time)
   --------------------------------------------------------------------- */
async function fetchCloudinary(source: { publicId: string; format: string }): Promise<Buffer> {
  const url = cloudinary.utils.private_download_url(source.publicId, source.format, {
    resource_type: "video",
    type: "private",
    expires_at: Math.floor(Date.now() / 1000) + 600,
  });
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Cloudinary ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function readAudio(source: AudioSource): Promise<Buffer> {
  if (source.type === "none") throw new Error("aucun fichier audio enregistré");
  if (source.type === "local") {
    try {
      return await fs.promises.readFile(source.filePath);
    } catch {
      throw new Error("fichier local introuvable (disque effacé depuis l'envoi ?)");
    }
  }
  if (!cloudinaryConfigured) throw new Error("Cloudinary n'est pas configuré");
  try {
    return await fetchCloudinary(source);
  } catch {
    return fetchCloudinary(source); // one retry for a network hiccup
  }
}

/* ---------------------------------------------------------------------
   3. THE EXCEL WORKBOOK (same look as "voice data collection sheet")
   --------------------------------------------------------------------- */
const FONT = "Arial";
const NAVY = "FF1F3864";
const YELLOW = "FFFFF2CC"; // cells to fill by hand (annotators)
const BLUE = "FFDDEBF7"; // graded phrases
const GRID = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const BORDER = { top: GRID, left: GRID, bottom: GRID, right: GRID };
const TONES = ["Neutral", "Friendly", "Serious", "Urgent / warning", "Question", "Other", "Neutral + Angry"];
const FIRST_ROW = 6; // first phrase row of every participant tab (as in the template)

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const stamp = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

interface SheetRow {
  category: string;
  phrase: string;
  tone: string;
  done: "Yes" | "No";
  audioFile: string;
  notes: string;
  extras: (string | number | null)[];
}

const EXTRA_HEADERS: Record<ExportKind, string[]> = {
  freestyle: ["Duration (s)", "Mad tone starts (s)", "Recorded at", "Recording ID"],
  contest: ["Voice #", "Duration (s)", "Status", "Score /100", "Phrases source", "Submission ID"],
};

function rowsFor(kind: ExportKind, entry: AudioEntry, voiceNumber: number): SheetRow[] {
  const done = entry.error ? "No" : "Yes";
  const failure = entry.error ? ` AUDIO MISSING: ${entry.error}.` : "";

  if (kind === "freestyle") {
    const phrase = entry.phrases[0];
    const mad = entry.madToneStartSeconds;
    return [
      {
        category: phrase.category,
        phrase: phrase.text,
        tone: entry.tone,
        done,
        audioFile: entry.fileName,
        notes:
          (mad === null ? "Normal tone only." : `Normal tone, then mad tone from ${mmss(mad)}.`) +
          ` Recorded ${stamp(entry.createdAt)}.${failure}`,
        extras: [entry.durationSeconds, mad, stamp(entry.createdAt), entry.recordingId],
      },
    ];
  }

  return entry.phrases.map((phrase, index) => ({
    category: "REQUIRED",
    phrase: phrase.text,
    tone: entry.tone,
    done,
    audioFile: entry.fileName,
    notes:
      `Voice ${voiceNumber} · phrase ${index + 1}/${entry.phrases.length} · ONE recording covers all ${entry.phrases.length} phrases: ` +
      `French read aloud first, then mother tongue.${failure}`,
    extras: [
      voiceNumber,
      entry.durationSeconds,
      entry.status,
      entry.score,
      entry.phraseSource === "saved" ? "saved at upload" : "reconstructed (older submission)",
      entry.recordingId,
    ],
  }));
}

function addInstructions(wb: ExcelJS.Workbook, kind: ExportKind, includePersonal: boolean) {
  const ws = wb.addWorksheet("Instructions");
  ws.getColumn(1).width = 14;
  [2, 3, 4, 5, 6, 7, 8].forEach((c) => (ws.getColumn(c).width = c === 3 ? 48 : 16));

  const common = [
    "1. One tab per participant (P01, P02…). Participant codes follow the account creation order and never change between exports.",
    "2. The audio files are in the zip, folder audio/<participant>/. The 'Audio file' column gives the file name; manifest.csv lists every file.",
    "3. Yellow cells are for annotators: transcription (mother tongue), place and remarks. They are empty on purpose.",
    "4. Done? = Yes when the audio file is in the zip. No = the file could not be downloaded (see Notes). Tone options are in the 'Lists' tab.",
  ];
  const specific =
    kind === "freestyle"
      ? [
          "5. FREESTYLE: one row = one phrase = one voice. The participant says the phrase in a normal tone, then (if marked) again in a mad tone, in the same recording; 'Mad tone starts (s)' says where the mad tone begins.",
          "6. A participant records each phrase only once, and may skip phrases they are not sure about, so a tab only holds the phrases actually recorded.",
        ]
      : [
          "5. CONTEST: one voice = ONE audio file covering the participant's 5 graded phrases (blue rows). The same audio file name is repeated on the 5 rows: that is the mapping phrase ↔ voice.",
          "6. Rule of the contest: the participant first reads each phrase aloud in French, then says it in their mother tongue, all in the same recording.",
          "7. 'Phrases source': 'saved at upload' = exact phrases shown to the participant. 'reconstructed' = older submission made before phrases were saved; rebuilt from the participant's current set, so it can differ if the phrase list changed.",
        ];
  const lines = [
    ...common.slice(0, 4),
    ...specific,
    includePersonal
      ? "• This export contains personal data (see the 'Participants' tab and manifest.csv). Keep it private."
      : "• This export is anonymous: participants are identified by their code only.",
  ];

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `Voice data export – ${kind === "freestyle" ? "Freestyle" : "Contest"} recordings`;
  ws.getCell("A1").font = { name: FONT, size: 14, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 7.5;
  lines.forEach((text, i) => {
    const r = 3 + i;
    ws.mergeCells(`A${r}:H${r}`);
    ws.getCell(`A${r}`).value = text;
    ws.getCell(`A${r}`).font = { name: FONT, size: 11 };
    ws.getCell(`A${r}`).alignment = { vertical: "top", wrapText: true };
    ws.getRow(r).height = text.length > 190 ? 47 : 31.5;
  });
  const legend = 3 + lines.length + 1;
  ws.getCell(`A${legend}`).value = "Legend";
  ws.getCell(`A${legend}`).font = { name: FONT, size: 11, bold: true };
  ws.getCell(`A${legend + 1}`).fill = fill(YELLOW);
  ws.getCell(`B${legend + 1}`).value = "to be filled by annotators";
  ws.getCell(`A${legend + 2}`).fill = fill(BLUE);
  ws.getCell(`B${legend + 2}`).value = "graded contest phrase";
  [legend + 1, legend + 2].forEach((r) => {
    ws.getCell(`A${r}`).border = BORDER;
    ws.getCell(`B${r}`).font = { name: FONT, size: 11 };
  });
}

const buildRows = (kind: ExportKind, entries: AudioEntry[]): SheetRow[] =>
  entries.flatMap((entry, index) => rowsFor(kind, entry, index + 1));
const lastRowOf = (rows: SheetRow[]) => Math.max(FIRST_ROW - 1 + rows.length, FIRST_ROW);

function addPersonSheet(wb: ExcelJS.Workbook, kind: ExportKind, person: Person, entries: AudioEntry[], rows: SheetRow[]) {
  const ws = wb.addWorksheet(person.code);
  const extraHeaders = EXTRA_HEADERS[kind];
  const last = lastRowOf(rows);

  // ----- column widths -----
  [15, 14, 52, 16, 12, 34, 18, 44].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  extraHeaders.forEach((_, i) => (ws.getColumn(9 + i).width = i === extraHeaders.length - 1 ? 26 : 16));

  // ----- title block -----
  ws.getCell("A1").value = "Participant recording sheet";
  ws.getCell("A1").font = { name: FONT, size: 14, bold: true, color: { argb: NAVY } };
  const label = (ref: string, text: string) => {
    ws.getCell(ref).value = text;
    ws.getCell(ref).font = { name: FONT, size: 11, bold: true };
  };
  const input = (ref: string, value: string) => {
    const cell = ws.getCell(ref);
    cell.value = value;
    cell.font = { name: FONT, size: 11 };
    cell.fill = fill(YELLOW);
    cell.border = BORDER;
  };
  label("A2", "Participant ID");
  input("B2", person.code);
  label("D2", "Date");
  input("E2", entries[0].createdAt.toISOString().slice(0, 10)); // first recording
  label("G2", "Progress");
  label("A3", "Mother tongue");
  input("B3", person.language);
  label("D3", "Place");
  input("E3", "");
  const doneCount = rows.filter((r) => r.done === "Yes").length;
  ws.getCell("G3").value = { formula: `COUNTIF(E${FIRST_ROW}:E${last},"Yes")&" / "&COUNTA(A${FIRST_ROW}:A${last})`, result: `${doneCount} / ${rows.length}` };
  ws.getCell("G3").font = { name: FONT, size: 11, bold: true, color: { argb: "FFC00000" } };

  // ----- header row -----
  const headers = ["#", "Category", "French phrase (read aloud)", "Tone", "Done?", "Transcription (mother tongue)", "Audio file", "Notes", ...extraHeaders];
  headers.forEach((text, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = text;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(NAVY);
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.getRow(5).height = 30;

  // ----- data rows -----
  rows.forEach((row, i) => {
    const r = FIRST_ROW + i;
    const graded = row.category === "REQUIRED";
    const values: (string | number | null)[] = [i + 1, row.category, row.phrase, row.tone, row.done, "", row.audioFile, row.notes, ...row.extras];
    values.forEach((value, c) => {
      const cell = ws.getCell(r, c + 1);
      cell.value = value === "" ? null : value;
      cell.font = { name: FONT, size: 11, bold: c === 2 && graded };
      cell.border = BORDER;
      cell.alignment = { horizontal: c === 0 || c === 3 || c === 4 ? "center" : "left", vertical: "middle", wrapText: true };
      if (graded && c <= 2) cell.fill = fill(BLUE);
      if (c === 5 || c === 7) cell.fill = fill(YELLOW); // annotators: transcription + notes
    });
    ws.getCell(r, 4).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$A$2:$A$${TONES.length + 1}`] };
    ws.getCell(r, 5).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$C$2:$C$3"] };
  });

  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 5 }];
}

interface Group {
  person: Person;
  entries: AudioEntry[];
  rows: SheetRow[];
}

function addPeopleSheet(wb: ExcelJS.Workbook, groups: Group[], includePersonal: boolean) {
  const ws = wb.addWorksheet("Participants", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Participant ID", "Mother tongue", "Audio files", "Phrase rows", ...(includePersonal ? ["Full name", "Email", "Phone"] : [])];
  headers.forEach((text, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = text;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(NAVY);
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  [16, 18, 12, 12, 30, 32, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  groups.forEach(({ person, entries, rows }, i) => {
    const r = i + 2;
    const last = lastRowOf(rows);
    const phraseRows = rows.length;
    const link = ws.getCell(r, 1);
    link.value = { text: person.code, hyperlink: `#'${person.code}'!A1` };
    link.font = { name: FONT, size: 11, color: { argb: "FF0563C1" }, underline: true };
    ws.getCell(r, 2).value = person.language || null;
    ws.getCell(r, 3).value = entries.length;
    ws.getCell(r, 4).value = { formula: `COUNTA('${person.code}'!A${FIRST_ROW}:A${last})`, result: phraseRows };
    if (includePersonal) {
      ws.getCell(r, 5).value = person.fullName;
      ws.getCell(r, 6).value = person.email;
      ws.getCell(r, 7).value = person.phone;
    }
    for (let c = 1; c <= headers.length; c += 1) {
      const cell = ws.getCell(r, c);
      cell.border = BORDER;
      if (c > 1) cell.font = { name: FONT, size: 11 };
    }
  });

  const totalRow = groups.length + 2;
  ws.getCell(totalRow, 1).value = "Total";
  ws.getCell(totalRow, 3).value = { formula: `SUM(C2:C${totalRow - 1})`, result: groups.reduce((sum, g) => sum + g.entries.length, 0) };
  ws.getCell(totalRow, 4).value = { formula: `SUM(D2:D${totalRow - 1})`, result: groups.reduce((sum, g) => sum + g.rows.length, 0) };
  for (let c = 1; c <= 4; c += 1) {
    ws.getCell(totalRow, c).font = { name: FONT, size: 11, bold: true };
    ws.getCell(totalRow, c).border = BORDER;
  }
}

function addLists(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Lists");
  ws.getColumn(1).width = 28;
  ws.getColumn(3).width = 14;
  ws.getCell("A1").value = "Tone options (edit freely)";
  ws.getCell("C1").value = "Done options";
  TONES.forEach((tone, i) => (ws.getCell(i + 2, 1).value = tone));
  ws.getCell("C2").value = "Yes";
  ws.getCell("C3").value = "No";
  ["A1", "C1"].forEach((ref) => (ws.getCell(ref).font = { name: FONT, size: 11, bold: true }));
  for (let r = 2; r <= TONES.length + 1; r += 1) ws.getCell(r, 1).font = { name: FONT, size: 11 };
  ws.getCell("C2").font = { name: FONT, size: 11 };
  ws.getCell("C3").font = { name: FONT, size: 11 };
}

const personRank = (code: string) => (code.startsWith("P") ? 0 : code.startsWith("A") ? 1 : 2);

export async function buildWorkbook(data: ExportData, options: Pick<ExportOptions, "includePersonal">): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Concours Langues Maternelles";
  wb.created = new Date();

  const byPerson = new Map<string, { person: Person; entries: AudioEntry[] }>();
  for (const entry of data.entries) {
    const group = byPerson.get(entry.person.code) ?? { person: entry.person, entries: [] };
    group.entries.push(entry);
    byPerson.set(entry.person.code, group);
  }
  const ordered = [...byPerson.values()].sort(
    (a, b) => personRank(a.person.code) - personRank(b.person.code) || a.person.code.localeCompare(b.person.code, "en", { numeric: true }),
  );

  const groups: Group[] = ordered.map(({ person, entries }) => ({ person, entries, rows: buildRows(data.kind, entries) }));
  addInstructions(wb, data.kind, options.includePersonal);
  addPeopleSheet(wb, groups, options.includePersonal);
  for (const group of groups) addPersonSheet(wb, data.kind, group.person, group.entries, group.rows);
  addLists(wb);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------------------------------------------------------------------
   4. MANIFEST (one line per audio file)
   --------------------------------------------------------------------- */
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function buildManifest(data: ExportData, options: Pick<ExportOptions, "includePersonal">): string {
  const header = [
    "participant_id", "mother_tongue", "audio_file", "audio_status", "phrase_ids", "phrases", "tone", "duration_seconds",
    "mad_tone_start_seconds", "status", "score", "phrases_source", "recording_id", "recorded_at",
    ...(options.includePersonal ? ["full_name", "email", "phone"] : []),
  ];
  const lines = data.entries.map((e) =>
    [
      e.person.code, e.person.language, e.zipPath, e.error ? `missing: ${e.error}` : "ok",
      e.phrases.map((p) => p.id).join(" | "), e.phrases.map((p) => p.text).join(" | "), e.tone, e.durationSeconds,
      e.madToneStartSeconds, e.status, e.score, e.phraseSource, e.recordingId, e.createdAt.toISOString(),
      ...(options.includePersonal ? [e.person.fullName, e.person.email, e.person.phone] : []),
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}

/* ---------------------------------------------------------------------
   5. THE ZIP
   --------------------------------------------------------------------- */
export interface ExportSummary {
  total: number;
  ok: number;
  failed: number;
}

/** Streams the zip into "out" (an HTTP response or a file). A file that cannot be fetched is
    reported in the sheet and the manifest; it never stops the export. */
export async function writeArchive(
  data: ExportData,
  out: Writable,
  options: ExportOptions,
  fetchAudio: (source: AudioSource) => Promise<Buffer> = readAudio,
): Promise<ExportSummary> {
  const archive = archiver("zip", { store: true }); // audio is already compressed
  let archiveError = null as Error | null;
  archive.on("error", (error) => (archiveError = error)); // permanent listener: never an unhandled 'error'

  const finished = new Promise<void>((resolve, reject) => {
    out.once("finish", resolve);
    out.once("error", reject);
    archive.once("error", reject);
  });
  finished.catch(() => undefined); // handled below with await; avoids an unhandled rejection if we throw first
  archive.pipe(out);

  /** Appends one file and waits until it is written: keeps memory flat when the client is slow. */
  const appendAndWait = (name: string, content: Buffer) =>
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        archive.off("entry", onEntry);
        archive.off("error", onFail);
        out.off("close", onClose);
      };
      const onEntry = () => (cleanup(), resolve());
      const onFail = (error: Error) => (cleanup(), reject(error));
      const onClose = () => onFail(new Error("Le téléchargement a été interrompu."));
      archive.once("entry", onEntry);
      archive.once("error", onFail);
      out.once("close", onClose);
      archive.append(content, { name });
    });

  let ok = 0;
  let failed = 0;
  for (const [index, entry] of data.entries.entries()) {
    if (out.destroyed) throw new Error("Le téléchargement a été interrompu.");
    let content: Buffer | null = null;
    try {
      content = await fetchAudio(entry.source);
    } catch (error) {
      entry.error = error instanceof Error ? error.message : "erreur inconnue";
    }
    if (content) {
      await appendAndWait(entry.zipPath, content);
      ok += 1;
    } else {
      failed += 1;
    }
    options.onProgress?.(index + 1, data.entries.length, entry.fileName);
  }

  // Built last, so failures are written in the sheet and the manifest
  archive.append(await buildWorkbook(data, options), { name: `voice_data_${data.kind}.xlsx` });
  archive.append(buildManifest(data, options), { name: "manifest.csv" });
  await archive.finalize();
  await finished;
  if (archiveError) throw archiveError;
  return { total: data.entries.length, ok, failed };
}

export async function writeExport(kind: ExportKind, out: Writable, options: ExportOptions): Promise<ExportSummary> {
  return writeArchive(await collectExportData(kind), out, options);
}

export const exportFileName = (kind: ExportKind, date = new Date()) => `${kind}-voice-data-${date.toISOString().slice(0, 10)}.zip`;
