/**
 * A printable sheet of QR labels for a chosen set of items — one label per
 * physical unit, laid out edge-to-edge on A4 with no page margin at all, so
 * the sheet can be cut straight through with no blank paper between codes,
 * along the outer edge, or around a caption. Each label is the QR code
 * alone, its own item name and SKU sitting in a true empty square at its
 * centre, and a hairline cut guide around it.
 *
 * "True empty" is the operative word: the centre is not a white shape
 * painted over finished QR modules (a mask, which still spends those
 * modules' error-correction budget on data the mask then hides) — it is a
 * region the renderer never draws a module into in the first place. This
 * route builds the QR's own module matrix by hand (`QRCode.create`, not
 * `QRCode.toDataURL`/`toString`) precisely so it can skip that square while
 * laying rects down, the same way a real "quiet hole" QR generator does.
 * `errorCorrectionLevel: "H"` is what makes a hole survivable at all — it
 * tolerates roughly 30% of the code's modules going missing before the
 * decoder can no longer reconstruct the payload.
 *
 * The QR payload is built on the same URL `QrScanDialog` already knows how
 * to read (`{origin}/inventory/{itemId}`, decoded by `ITEM_URL_PATTERN` in
 * `qr-scan-dialog.tsx`) — a label this route prints and a code the app's own
 * scanner reads are the same artifact, generated once so they cannot drift
 * into two formats. `origin` travels from the browser rather than being
 * read from server config, because this package has no window and no
 * `BETTER_AUTH_URL` of its own; the caller already knows what page it is on.
 *
 * A bulk-counted item — one product row standing in for many physical
 * units, per the store's own "counted in bulk" convention — still needs one
 * sticker per physical unit, not one for the product. `copies` on each
 * requested item is how many labels to print for it, and every label beyond
 * the first carries a `?u=N` suffix on its own QR payload *and* its own unit
 * number on the second inlaid line, so two labels for the same item are
 * never identical codes — each is independently scannable, and "unit 7" is
 * readable at a glance as well as encoded in the scan. `u` is informational
 * only: this store keeps no row per physical unit, so the number exists for
 * a human to read off a label or a scan, not looked up server-side.
 */
import {
  inventoryItem,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, inArray, isNull } from "drizzle-orm";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import QRCode from "qrcode";
import * as v from "valibot";

import { inventoryOverseerProcedure } from "../../index";
import { buildPdfExport } from "../../lib/export";

/** A4 in `pt`. No page margin: the grid runs to every edge, so a straight cut down any gridline separates two whole labels rather than leaving a paper border. */
const PAGE_WIDTH_PT = 595.28;
const PAGE_HEIGHT_PT = 841.89;
/** Each label's own square side, sized to tile the page in a clean grid with nothing left over. */
const LABELS_PER_ROW = 3;
const LABELS_PER_COLUMN = 4;
const LABEL_SIZE_PT = Math.floor(
  Math.min(PAGE_WIDTH_PT / LABELS_PER_ROW, PAGE_HEIGHT_PT / LABELS_PER_COLUMN)
);
/** One requested sheet cannot ask for more labels than a school actually owns of anything. */
const MAX_COPIES_PER_ITEM = 500;
/** The render canvas's own side, in SVG user units — large enough that hand-drawn modules and the inlaid text both stay crisp when scaled down to `LABEL_SIZE_PT`. */
const CANVAS_SIZE = 600;
/** Modules of white border around the code, matching the quiet zone the QR spec itself requires for a scanner to find the finder squares reliably. */
const QUIET_ZONE_MODULES = 4;
/**
 * The fraction of the code's own module grid left as a true hole, snapped to
 * an odd module count so it sits perfectly centred on the middle module.
 * Comfortably under the ~30% ceiling `errorCorrectionLevel: "H"` tolerates.
 */
const HOLE_RATIO = 0.32;
/** Longer than this and a name stops being legible at the hole's own size; truncated with an ellipsis instead of shrunk into a blur. */
const MAX_NAME_CHARS = 20;
const MAX_SKU_CHARS = 18;
/** This app's brand green (`--primary` in `globals.css`) and the same hue at reduced opacity, so a label reads as this school's rather than a generic default. */
const BRAND_INK = "#013405";
const BRAND_INK_MUTED_OPACITY = 0.62;
/** Rough width of one bold-Helvetica character as a fraction of its own font size — enough to size text by estimate without a real font metrics table. */
const BOLD_CHAR_WIDTH_FACTOR = 0.62;
const REGULAR_CHAR_WIDTH_FACTOR = 0.56;
/** Below this, text stops being legible even printed — the floor `fitFontSize` will not shrink past. */
const MIN_FONT_SIZE = 9;

/** `&`, `<` and `>` are the three characters SVG's own XML parser cannot see literally inside a `<text>` node. */
const escapeSvgText = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const truncate = (value: string, maxChars: number): string =>
  value.length > maxChars ? `${value.slice(0, maxChars - 1)}\u2026` : value;

/**
 * A font size that keeps `text` inside `maxWidth`, estimated rather than
 * measured (this route never renders a real font to measure against) by
 * treating every character as `widthFactor` times the font size wide —
 * close enough for Helvetica-family text, and always conservative enough
 * that the true rendered width comes in at or under the estimate. Caps at
 * `baseFontSize` so short text is never stretched larger than the label's
 * own design calls for, and floors at `MIN_FONT_SIZE` so a name that is
 * simply too long shrinks as far as it can before `truncate` above is what
 * actually saves it from overflowing.
 */
const fitFontSize = (
  text: string,
  baseFontSize: number,
  maxWidth: number,
  widthFactor: number
): number => {
  if (text.length === 0) {
    return baseFontSize;
  }
  const widthFitted = maxWidth / (text.length * widthFactor);
  return Math.max(MIN_FONT_SIZE, Math.min(baseFontSize, widthFitted));
};

/**
 * One label. The QR's own module matrix is walked module-by-module: a dark
 * module outside the centre hole becomes one `<rect>`, a dark module inside
 * it is skipped outright, and nothing is ever drawn there to begin with —
 * the doc comment at the top of this file explains why that is not the same
 * thing as painting over a finished code. The item's name and SKU are then
 * set directly into that same empty square, in this school's own brand
 * green, sized to the hole's own pixel dimensions rather than a fixed
 * constant, since the hole's size depends on the QR's own module count and
 * that count depends on how long `url` is.
 */
const buildLabelSvg = (url: string, name: string, sku: string): string => {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const { size, data } = qr.modules;
  const moduleSize = CANVAS_SIZE / (size + QUIET_ZONE_MODULES * 2);

  let holeModules = Math.round(size * HOLE_RATIO);
  if (holeModules % 2 === 0) {
    holeModules += 1;
  }
  const holeStart = Math.floor((size - holeModules) / 2);
  const holeEnd = holeStart + holeModules;
  const isInHole = (row: number, col: number) =>
    row >= holeStart && row < holeEnd && col >= holeStart && col < holeEnd;

  let modules = "";
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!data[row * size + col] || isInHole(row, col)) {
        continue;
      }
      const x = (col + QUIET_ZONE_MODULES) * moduleSize;
      const y = (row + QUIET_ZONE_MODULES) * moduleSize;
      modules += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}"/>`;
    }
  }

  const holeOrigin = (holeStart + QUIET_ZONE_MODULES) * moduleSize;
  const holeSizePx = holeModules * moduleSize;
  const center = holeOrigin + holeSizePx / 2;
  /** Both lines have to fit inside the hole with room either side, hence `* 0.86`. */
  const maxTextWidth = holeSizePx * 0.86;
  const truncatedName = truncate(name, MAX_NAME_CHARS);
  const truncatedSku = truncate(sku, MAX_SKU_CHARS);
  const nameFontSize = fitFontSize(
    truncatedName,
    holeSizePx * 0.155,
    maxTextWidth,
    BOLD_CHAR_WIDTH_FACTOR
  );
  const skuFontSize = fitFontSize(
    truncatedSku,
    holeSizePx * 0.115,
    maxTextWidth,
    REGULAR_CHAR_WIDTH_FACTOR
  );
  const nameLine = escapeSvgText(truncatedName);
  const skuLine = escapeSvgText(truncatedSku);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">
    <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="#ffffff" />
    <g fill="#000000">${modules}</g>
    <text x="${center}" y="${center - nameFontSize * 0.35}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="${nameFontSize}" fill="${BRAND_INK}">${nameLine}</text>
    <text x="${center}" y="${center + skuFontSize * 1.35}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${skuFontSize}" fill="${BRAND_INK}" fill-opacity="${BRAND_INK_MUTED_OPACITY}">${skuLine}</text>
  </svg>`;
};

const buildLabelCell = (svg: string) => ({
  svg,
  width: LABEL_SIZE_PT,
  height: LABEL_SIZE_PT,
  alignment: "center" as const,
});

/** Rows of `LABELS_PER_ROW`, the last one padded with blank cells so the grid stays rectangular. */
const chunkIntoRows = <T>(items: T[], size: number): (T | null)[][] => {
  const rows: (T | null)[][] = [];
  for (let index = 0; index < items.length; index += size) {
    const row = items.slice(index, index + size);
    while (row.length < size) {
      row.push(null as never);
    }
    rows.push(row);
  }
  return rows;
};

export const exportQrSheet = inventoryOverseerProcedure
  .input(
    v.object({
      items: v.pipe(
        v.array(
          v.object({
            itemId: inventoryItemIdSchema,
            copies: v.pipe(
              v.number(),
              v.integer(),
              v.minValue(1),
              v.maxValue(MAX_COPIES_PER_ITEM)
            ),
          })
        ),
        v.minLength(1)
      ),
      origin: v.pipe(v.string(), v.minLength(1)),
    })
  )
  .handler(async ({ input, context }) => {
    const itemIds = input.items.map((entry) => entry.itemId);
    const rows = await context.db
      .select({
        id: inventoryItem.id,
        name: inventoryItem.name,
        sku: inventoryItem.sku,
      })
      .from(inventoryItem)
      .where(
        and(inArray(inventoryItem.id, itemIds), isNull(inventoryItem.deletedAt))
      );
    const rowById = new Map(rows.map((row) => [row.id, row]));

    const labelJobs = input.items.flatMap((entry) => {
      const row = rowById.get(entry.itemId);
      if (!row) {
        return [];
      }
      return Array.from({ length: entry.copies }, (_, index) => ({
        name: row.name,
        sku: entry.copies > 1 ? `${row.sku} #${index + 1}` : row.sku,
        url:
          entry.copies > 1
            ? `${input.origin}/inventory/${row.id}?u=${index + 1}`
            : `${input.origin}/inventory/${row.id}`,
      }));
    });

    const labels = labelJobs.map((job) =>
      buildLabelSvg(job.url, job.name, job.sku)
    );

    const tableRows = chunkIntoRows(labels, LABELS_PER_ROW).map((row) =>
      row.map((svg) => (svg ? buildLabelCell(svg) : { text: "" }))
    );

    const docDefinition: TDocumentDefinitions = {
      pageSize: "A4",
      pageMargins: [0, 0, 0, 0],
      content: [
        {
          table: {
            widths: Array.from({ length: LABELS_PER_ROW }, () => LABEL_SIZE_PT),
            heights: LABEL_SIZE_PT,
            body: tableRows,
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => "#cccccc",
            vLineColor: () => "#cccccc",
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
        },
      ],
    };

    return buildPdfExport(`qr-labels-${Date.now()}.pdf`, docDefinition);
  });
