/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * F-05 regression: what the item-photo upload accepts and refuses. Nothing
 * the client declares is trusted; only bytes that decode as one of four raster
 * formats are stored, and they are stored re-encoded.
 */
import { describe, expect, test } from "bun:test";

import sharp from "sharp";

import {
  MAX_REQUEST_BYTES,
  MAX_UPLOAD_BYTES,
  checkDeclaredLength,
  normaliseUploadedImage,
} from "../src/lib/image-upload";

const png = (width = 32, height = 32) =>
  sharp({
    create: { width, height, channels: 3, background: "#3366cc" },
  })
    .png()
    .toBuffer();

const bytes = (text: string) => new TextEncoder().encode(text);

/**
 * The first bytes of a real Windows executable (DOS "MZ" header). Built from
 * byte values, not a string: `TextEncoder` is UTF-8, so a string such as
 * "MZ\u0090\u0000…" encodes U+0090 as `c2 90` and is not this header at all.
 */
const PE_HEADER = Uint8Array.of(
  0x4d,
  0x5a,
  0x90,
  0x00,
  0x03,
  0x00,
  0x00,
  0x00,
  0x04,
  0x00,
  0x00,
  0x00,
  0xff,
  0xff,
  0x00,
  0x00
);

/**
 * Each refusal names its guard, so a test asserts the guard it is about and
 * cannot pass because a different check happened to refuse first.
 */
const REFUSED_BY = {
  declaredType: /Only PNG, JPEG, WEBP or GIF images are accepted/u,
  decodedFormat: /not a PNG, JPEG, WEBP or GIF image/u,
  unreadable: /could not be read as an image/u,
  pixels: /over 50 megapixels/u,
  size: /larger than 8 MB/u,
};

const refusedBy = (status: number, guard: RegExp) => ({
  ok: false,
  status,
  message: expect.stringMatching(guard),
});

describe("accepted", () => {
  test("a real PNG is re-encoded to a square WebP", async () => {
    const result = await normaliseUploadedImage(
      new Uint8Array(await png(64, 32)),
      "image/png"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const meta = await sharp(result.webp).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(meta.height);
    }
  });
});

describe("refused", () => {
  test("HTML declared as a PNG", async () => {
    const result = await normaliseUploadedImage(
      bytes("<html><script>alert(document.cookie)</script></html>"),
      "image/png"
    );
    expect(result).toMatchObject(refusedBy(400, REFUSED_BY.unreadable));
  });

  test("an SVG with a script, declared as a PNG", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>`;
    const result = await normaliseUploadedImage(bytes(svg), "image/png");
    // The decoder reads SVG happily (the old route rasterised and stored it);
    // the decoded-format allow-list is what refuses it.
    expect(result).toMatchObject(refusedBy(400, REFUSED_BY.decodedFormat));
  });

  test("an SVG declared honestly", async () => {
    const result = await normaliseUploadedImage(
      bytes("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      "image/svg+xml"
    );
    expect(result).toMatchObject(refusedBy(400, REFUSED_BY.declaredType));
  });

  test("a real image declared with a non-image type", async () => {
    const result = await normaliseUploadedImage(
      new Uint8Array(await png()),
      "text/html"
    );
    expect(result).toMatchObject(refusedBy(400, REFUSED_BY.declaredType));
  });

  test("an executable declared as a JPEG", async () => {
    const result = await normaliseUploadedImage(PE_HEADER, "image/jpeg");
    expect(result).toMatchObject(refusedBy(400, REFUSED_BY.unreadable));
  });

  test("a file over 8 MB", async () => {
    const result = await normaliseUploadedImage(
      new Uint8Array(MAX_UPLOAD_BYTES + 1),
      "image/png"
    );
    expect(result).toMatchObject(refusedBy(413, REFUSED_BY.size));
  });

  test("a decompression bomb (tiny file, huge canvas)", async () => {
    // 10000 x 10000 = 100 MP of one colour compresses to a few kilobytes.
    const bomb = await sharp({
      create: {
        width: 10_000,
        height: 10_000,
        channels: 3,
        background: "#000",
      },
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.byteLength).toBeLessThan(MAX_UPLOAD_BYTES);
    const result = await normaliseUploadedImage(
      new Uint8Array(bomb),
      "image/png"
    );
    // Refused by the pixel bound read from the header — not reported as an
    // unreadable file, which is what a genuine oversized photo used to get.
    expect(result).toMatchObject(refusedBy(400, REFUSED_BY.pixels));
  });
});

describe("request length is checked before the body is read", () => {
  test("a missing Content-Length is refused", () => {
    expect(checkDeclaredLength(null)).toMatchObject({ ok: false, status: 400 });
  });

  test("an oversized Content-Length is refused", () => {
    expect(checkDeclaredLength(String(MAX_REQUEST_BYTES + 1))).toMatchObject({
      ok: false,
      status: 413,
    });
  });

  test("a normal Content-Length passes", () => {
    expect(checkDeclaredLength("123456")).toBeNull();
  });
});
