export interface ExportFile {
  filename: string;
  mimeType: string;
  base64: string;
}

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
  return new Blob([bytes], { type: mimeType });
};

/** Triggers a browser download for a base64-encoded file returned by an export procedure. */
export const downloadExportFile = (file: ExportFile) => {
  const blob = base64ToBlob(file.base64, file.mimeType);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
