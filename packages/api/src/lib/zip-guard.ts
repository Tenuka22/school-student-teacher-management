/**
 * Decompression-bomb guard for `.xlsx` uploads (forensic audit F-26).
 *
 * An `.xlsx` is a zip. The import caps the *compressed* upload (about 4 MB)
 * and the number of rows — but the row cap is applied after `exceljs` has
 * inflated every part into memory, and a 4 MB zip can declare gigabytes. This
 * reads the zip's central directory (a small index at the end of the file,
 * read without inflating anything) and refuses the archive when the declared
 * uncompressed total or the entry count is beyond anything a staff import
 * needs. ZIP64 archives are refused outright: no workbook this school
 * imports is over 4 GB, and ZIP64's 64-bit sizes are where a bomb would hide.
 */

const EOCD_SIGNATURE = 0x06_05_4b_50;
const CENTRAL_ENTRY_SIGNATURE = 0x02_01_4b_50;
/** End-of-central-directory record without its trailing comment. */
const EOCD_MIN_LENGTH = 22;
/** The zip comment is at most 65,535 bytes, so the record is within this. */
const EOCD_SEARCH_WINDOW = EOCD_MIN_LENGTH + 0xff_ff;
const CENTRAL_ENTRY_FIXED_LENGTH = 46;
const ZIP64_MARKER = 0xff_ff_ff_ff;

export interface ZipLimits {
  maxUncompressedBytes: number;
  maxEntries: number;
}

/** Generous for a staff or attendance workbook; tiny for a bomb. */
export const XLSX_LIMITS: ZipLimits = {
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxEntries: 1000,
};

const findEndOfCentralDirectory = (view: DataView): number => {
  const lowest = Math.max(0, view.byteLength - EOCD_SEARCH_WINDOW);
  for (
    let offset = view.byteLength - EOCD_MIN_LENGTH;
    offset >= lowest;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
};

/**
 * Returns why the archive is refused, or null when it is within limits.
 * Never inflates anything.
 */
export const zipProblem = (
  bytes: Uint8Array,
  limits: ZipLimits = XLSX_LIMITS
): string | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < EOCD_MIN_LENGTH) {
    return "That file is not an Excel workbook";
  }
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) {
    return "That file is not an Excel workbook";
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (
    entryCount === 0xff_ff ||
    directorySize === ZIP64_MARKER ||
    directoryOffset === ZIP64_MARKER
  ) {
    return "That workbook uses a format this import does not accept (ZIP64)";
  }
  if (entryCount > limits.maxEntries) {
    return "That workbook has too many parts to import";
  }
  if (directoryOffset + directorySize > eocd) {
    return "That workbook is damaged";
  }

  let offset = directoryOffset;
  let total = 0;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (
      offset + CENTRAL_ENTRY_FIXED_LENGTH > eocd ||
      view.getUint32(offset, true) !== CENTRAL_ENTRY_SIGNATURE
    ) {
      return "That workbook is damaged";
    }
    const uncompressed = view.getUint32(offset + 24, true);
    if (uncompressed === ZIP64_MARKER) {
      return "That workbook uses a format this import does not accept (ZIP64)";
    }
    total += uncompressed;
    if (total > limits.maxUncompressedBytes) {
      return "That workbook expands to more data than an import accepts";
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset +=
      CENTRAL_ENTRY_FIXED_LENGTH + nameLength + extraLength + commentLength;
  }
  return null;
};
