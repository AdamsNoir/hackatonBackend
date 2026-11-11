/* Cleans the original file name shown in the participant/admin tables. */
export const sanitizeFileName = (originalName: string): string => {
  const baseName = originalName.split(/[\\/]/).pop() ?? "audio";
  // eslint-disable-next-line no-control-regex
  const cleaned = baseName.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return cleaned.slice(-120) || "audio";
};
