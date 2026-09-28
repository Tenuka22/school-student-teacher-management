/** Every input in the app that picks a spreadsheet accepts this and nothing else. */
export const XLSX_ACCEPT =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Reads a picked file as bare base64, ready for `staff.imports.parseExcel`.
 *
 * `.xlsx` is a zip, so it cannot be read as text the way the CSV importers read
 * their files — `file.text()` would hand the server a mojibake string. The bytes
 * go up as base64, which is also how every export comes back down in
 * `downloadExportFile`.
 *
 * Base64 through oRPC's JSON body rather than a `multipart/form-data` route:
 * these sheets are a term's roster, tens of kilobytes before encoding, and the
 * app already round-trips whole workbooks the other way. A second upload route
 * would buy nothing but a second place to enforce size.
 */
export const readFileAsBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());

  // Encoded in slices. Spreading a whole file into `String.fromCharCode(...)` in
  // one call would push every byte onto a single call stack; 32 KiB at a time
  // stays well inside it while keeping the loop to a line.
  const SLICE = 0x80_00;
  let binary = "";
  for (let index = 0; index < bytes.length; index += SLICE) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + SLICE));
  }

  return btoa(binary);
};
