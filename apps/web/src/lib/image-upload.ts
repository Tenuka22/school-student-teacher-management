import sharp from "sharp";

/**
 * Validation and normalisation for an uploaded item photo, separate from the
 * route so it can be tested without object storage.
 *
 * Nothing the client says about the file is trusted: not its name, not its
 * extension, not its declared MIME type. The bytes must decode as one of the
 * four raster formats below, and what is stored is never those bytes — it is
 * a freshly encoded WebP, so a polyglot or a payload riding in metadata does
 * not survive.
 */

/** 8 MiB — a phone photo, not a scan. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Multipart framing around the file (boundary, part headers, the filename).
 * A request whose declared length exceeds the file limit plus this is refused
 * before a byte of it is parsed.
 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES;

/** What the browser may claim. A first filter only — the decoder decides. */
export const ALLOWED_DECLARED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/**
 * What the bytes must actually be, as `sharp` identifies them. `sharp` also
 * decodes SVG, TIFF, HEIF and others; an SVG declared as `image/png` used to
 * be accepted (and rasterised). Only these four are.
 */
const ALLOWED_DECODED_FORMATS = new Set(["png", "jpeg", "webp", "gif"]);

/**
 * Decompression-bomb bound. `sharp`'s default (about 268 megapixels) lets a
 * few-kilobyte PNG expand to a gigabyte of pixels. 50 MP covers any phone
 * camera this school will photograph equipment with.
 */
const MAX_INPUT_PIXELS = 50_000_000;

/** Stored square, in pixels. */
const MAX_DIMENSION = 1024;

/** libwebp's "no visible loss on a photo" point. */
const WEBP_QUALITY = 82;

export type ImageUploadResult =
  | { ok: true; webp: Buffer }
  | { ok: false; status: 400 | 413; message: string };

/** `Content-Length` check, before the body is read at all. */
export const checkDeclaredLength = (
  header: string | null
): ImageUploadResult | null => {
  const length = header === null ? Number.NaN : Number(header);
  if (!Number.isFinite(length)) {
    return {
      ok: false,
      status: 400,
      message: "The upload must declare its size",
    };
  }
  if (length > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      status: 413,
      message: "That image is larger than 8 MB",
    };
  }
  return null;
};

export const normaliseUploadedImage = async (
  bytes: Uint8Array,
  declaredType: string
): Promise<ImageUploadResult> => {
  if (!ALLOWED_DECLARED_TYPES.has(declaredType)) {
    return {
      ok: false,
      status: 400,
      message:
        "Only PNG, JPEG, WEBP or GIF images are accepted for an item photo",
    };
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      message: "That image is larger than 8 MB",
    };
  }

  try {
    // The header is read on its own, without the pixel limit: `metadata()`
    // decodes no pixels, but sharp applies `limitInputPixels` to it too, and
    // throws — which is what made an oversized photo look unreadable.
    const { format, width, height } = await sharp(bytes, {
      limitInputPixels: false,
      failOn: "error",
    }).metadata();
    if (!(format && ALLOWED_DECODED_FORMATS.has(format))) {
      return {
        ok: false,
        status: 400,
        message: "That file is not a PNG, JPEG, WEBP or GIF image",
      };
    }
    // Read from the header, before any pixel is decoded. `limitInputPixels`
    // above is the backstop, but its refusal is an exception indistinguishable
    // from a corrupt file, which told a person with a genuine (huge) photo
    // that it was not an image at all.
    if ((width ?? 0) * (height ?? 0) > MAX_INPUT_PIXELS) {
      return {
        ok: false,
        status: 400,
        message: `That image is over ${MAX_INPUT_PIXELS / 1_000_000} megapixels; resize it before uploading`,
      };
    }
    // Decoding keeps the limit as a backstop to the header check above.
    const webp = await sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    })
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "cover" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return { ok: true, webp };
  } catch {
    // Not an image at all, or truncated.
    return {
      ok: false,
      status: 400,
      message: "That file could not be read as an image",
    };
  }
};
