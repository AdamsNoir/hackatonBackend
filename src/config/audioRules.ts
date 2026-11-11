/* Keep these limits identical to the frontend recording rules. */
export const AUDIO_RULES = {
  maxFileSizeMb: 15,
  minDurationSeconds: 2 * 60,
  maxDurationSeconds: 5 * 60,
  durationToleranceSeconds: 0,
} as const;

export const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
};
