/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
/**
 * F-25 / F-26 regression: bounded QR label sheets and decompression-bomb
 * protection on Excel imports.
 */
import { deflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";

import { readExcelRows } from "../src/lib/excel-import";
import { zipProblem } from "../src/lib/zip-guard";
import {
  HARNESS_TIMEOUT_MS,
  clientFor,
  createHarness,
  outcome,
  signInSeat,
} from "./support/harness";
import type { Harness } from "./support/harness";

/** A minimal, valid zip with deflated entries — enough to be a real archive. */
const buildZip = (entries: { name: string; data: Uint8Array }[]) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name);
    const compressed = deflateRawSync(data);
    const crc = Bun.hash.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02_01_4b_50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, compressed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06_05_4b_50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, eocd]));
};

describe("zip guard (F-26)", () => {
  test("a real workbook passes and still imports", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Staff");
    sheet.addRow(["name", "nic"]);
    sheet.addRow(["Priya", "199012345678"]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    expect(zipProblem(bytes)).toBeNull();
    const parsed = await readExcelRows(Buffer.from(bytes).toString("base64"));
    expect(parsed.rows).toHaveLength(1);
  });

  test("a 60 MB-of-zeros bomb is refused before it is inflated", async () => {
    const bomb = buildZip([
      {
        name: "xl/worksheets/sheet1.xml",
        data: new Uint8Array(60 * 1024 * 1024),
      },
    ]);
    // The upload itself is small enough to pass the 4 MB size cap.
    expect(bomb.byteLength).toBeLessThan(1024 * 1024);
    expect(zipProblem(bomb)).toMatch(/expands to more data/u);
    await expect(
      readExcelRows(Buffer.from(bomb).toString("base64"))
    ).rejects.toThrow(/expands to more data/u);
  });

  test("an archive with thousands of parts is refused", () => {
    const parts = Array.from({ length: 1001 }, (_, index) => ({
      name: `p${index}`,
      data: new Uint8Array(1),
    }));
    expect(zipProblem(buildZip(parts))).toMatch(/too many parts/u);
  });

  test("something that is not a zip is refused", () => {
    expect(zipProblem(new TextEncoder().encode("name,nic\nPriya,1"))).toMatch(
      /not an Excel workbook/u
    );
  });
});

const items = (count: number, copies: number) =>
  Array.from({ length: count }, () => ({
    itemId: crypto.randomUUID(),
    copies,
  }));

describe("QR label sheet bounds (F-25)", () => {
  let harness: Harness;
  let inventoryAdmin: Awaited<ReturnType<typeof clientFor>>;

  beforeAll(async () => {
    harness = await createHarness();
    inventoryAdmin = await clientFor(
      harness,
      await signInSeat(harness, "inventory-admin")
    );
  }, HARNESS_TIMEOUT_MS);

  afterAll(async () => {
    await harness?.close();
  }, HARNESS_TIMEOUT_MS);

  test("more than 500 items on one sheet is refused", async () => {
    expect(
      await outcome(
        inventoryAdmin.inventory.items.exportQrSheet({
          items: items(501, 1),
          origin: "http://localhost:3001",
        } as never)
      )
    ).toBe("BAD_REQUEST");
  });

  test("more than 2,000 labels in total is refused", async () => {
    expect(
      await outcome(
        inventoryAdmin.inventory.items.exportQrSheet({
          items: items(5, 500),
          origin: "http://localhost:3001",
        } as never)
      )
    ).toBe("BAD_REQUEST");
  });

  test("an origin that is not a URL is refused", async () => {
    expect(
      await outcome(
        inventoryAdmin.inventory.items.exportQrSheet({
          items: items(1, 1),
          origin: "not a url",
        } as never)
      )
    ).toBe("BAD_REQUEST");
  });
});
