const MAX_FILE_BYTES = 100 * 1024 * 1024;
const supported = ["pdf", "ppt", "pptx"];
export function validateUpload(file: File): void {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!extension || !supported.includes(extension)) throw new Error("Choose a PDF, PPT, or PPTX file.");
  if (file.size === 0) throw new Error("That file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Files must be 100 MB or smaller.");
}
