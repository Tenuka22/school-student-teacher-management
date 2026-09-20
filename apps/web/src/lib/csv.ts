/** Splits one CSV line into fields, respecting double-quoted fields with embedded commas/quotes. */
const splitCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
};

const escapeCsvField = (value: string): string =>
  /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** Parses CSV text (with a header row) into an array of column-keyed row objects. */
export const parseCsv = (text: string): Record<string, string>[] => {
  const lines = text
    .split(/\r\n|\n|\r/u)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (const [index, header] of headers.entries()) {
      row[header] = (values[index] ?? "").trim();
    }
    return row;
  });
};

/** Builds CSV text (with a header row) from an array of column-keyed row objects. */
export const toCsv = (
  columns: string[],
  rows: Record<string, string | null | undefined>[]
): string => {
  const headerLine = columns.map(escapeCsvField).join(",");
  const rowLines = rows.map((row) =>
    columns.map((column) => escapeCsvField(row[column] ?? "")).join(",")
  );
  return [headerLine, ...rowLines].join("\n");
};

/** Triggers a browser download for a plain-text CSV file. */
export const downloadCsv = (filename: string, csvText: string) => {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
