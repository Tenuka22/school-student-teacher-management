"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { Slider } from "@school-student-teacher-management/ui/components/slider";
import { IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { useCallback, useReducer } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";

/* oxlint-disable react-doctor/only-export-components -- readFileAsDataUrl is a
   pure async helper the picker calls before this dialog ever mounts; it has no
   state to preserve and belongs beside the dialog it feeds, not in a second file. */

/**
 * The square crop step between "a file was picked" and "a photo is uploaded" —
 * a whole square canvas is the one 1:1 shape a small `size-16` register thumbnail
 * and a full item-dialog preview can share with no letterboxing either way, and
 * the register never had a reliable way to get one: a photo taken on a phone is
 * whatever aspect ratio the sensor produced, and one uploaded from a desktop is
 * whatever the school scanned. Server-side crop (`files.upload.ts`'s
 * `fit: "cover"`) is the guarantee that is never skipped; this dialog is what
 * lets the person doing the cropping choose the square themselves instead of
 * whatever the server's centre-crop would have picked.
 *
 * `react-easy-crop` rather than a hand-rolled canvas dragger: cropping an image
 * with the pointer — pan, pinch-zoom, touch and mouse both — is a solved problem
 * with real edge cases (device pixel ratio, the image's own orientation, a crop
 * box that must never leave the image), and this is the library the shadcn
 * community's own image-cropper recipe is built on.
 */

/**
 * A file, as the data URL `react-easy-crop` and an `<img>` both want. `FileReader`
 * rather than `URL.createObjectURL`, because the object-URL form has to be
 * revoked exactly once or it leaks, and the dialog that owns it can be closed by
 * a cancel, a crop, or the item dialog itself unmounting mid-pick — three exits
 * that would each need to remember the same `URL.revokeObjectURL` call. A data
 * URL needs no matching cleanup at all.
 */
export const readFileAsDataUrl = (file: File): Promise<string> => {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const reader = new FileReader();
  reader.addEventListener("load", () => resolve(reader.result as string), {
    once: true,
  });
  reader.addEventListener(
    "error",
    () => reject(reader.error ?? new Error("Could not read that file")),
    { once: true }
  );
  reader.readAsDataURL(file);
  return promise;
};

/**
 * The pixels `onCropComplete` reports, drawn onto a fresh square canvas and
 * handed back as a WebP blob — the same format the server re-encodes to, so a
 * slow connection never uploads a raw multi-megabyte camera original only to
 * have the server throw most of its bytes away a moment later.
 *
 * `OUTPUT_SIZE` matches `MAX_DIMENSION` in `files.upload.ts`: cropping to a
 * square this size client-side and letting the server's own `fit: "cover"`
 * resize be a no-op on an image that is already exactly square and exactly
 * this large, rather than uploading at the crop's native resolution and making
 * the server do work this step already did.
 */
const OUTPUT_SIZE = 1024;
const OUTPUT_QUALITY = 0.86;

const loadImage = (src: string): Promise<HTMLImageElement> => {
  const { promise, resolve, reject } =
    Promise.withResolvers<HTMLImageElement>();
  const image = new Image();
  image.addEventListener("load", () => resolve(image), { once: true });
  image.addEventListener(
    "error",
    () => reject(new Error("Could not load that image")),
    { once: true }
  );
  image.src = src;
  return promise;
};

/**
 * The crop, rendered. `area` is the source-pixel rectangle `react-easy-crop`
 * reports from `onCropComplete` — already in the original image's own pixel
 * space, not the on-screen crop box's, which is what makes a single
 * `drawImage` call enough: no separate accounting for zoom or pan.
 */
const cropToSquareBlob = async (
  imageSrc: string,
  area: Area
): Promise<Blob> => {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("This browser cannot crop an image");
  }

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );

  const { promise, resolve, reject } = Promise.withResolvers<Blob>();
  canvas.toBlob(
    (blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("This browser could not export the cropped image"));
      }
    },
    "image/webp",
    OUTPUT_QUALITY
  );
  return await promise;
};

export interface PhotoCropDialogProps {
  /** `null` closes the dialog and clears every piece of crop state with it. */
  imageSrc: string | null;
  onCancel: () => void;
  /** The square crop, as a File ready for `uploadPhoto` — named and typed so the
   * upload route's own filename-derived extension logic never sees anything else. */
  onCropped: (file: File) => void;
}

/**
 * The five pieces of state a crop in progress carries, held as one value
 * rather than five `useState`s. `reset` (fired on every cancel and every
 * successful crop) and `exportFailed` (pan/zoom position, an export error, and
 * clearing the busy flag, together) each touch several of these at once, and a
 * reducer is what keeps "together" true in the code rather than in a comment
 * promising five separate setters are always called in the same order.
 */
interface CropState {
  crop: Point;
  zoom: number;
  area: Area | null;
  isExporting: boolean;
  error: string | null;
}

const INITIAL_CROP_STATE: CropState = {
  crop: { x: 0, y: 0 },
  zoom: 1,
  area: null,
  isExporting: false,
  error: null,
};

type CropAction =
  | { type: "reset" }
  | { type: "crop-changed"; crop: Point }
  | { type: "zoom-changed"; zoom: number }
  | { type: "area-changed"; area: Area }
  | { type: "export-started" }
  | { type: "export-failed"; message: string };

const cropReducer = (state: CropState, action: CropAction): CropState => {
  switch (action.type) {
    case "reset": {
      return INITIAL_CROP_STATE;
    }
    case "crop-changed": {
      return { ...state, crop: action.crop };
    }
    case "zoom-changed": {
      return { ...state, zoom: action.zoom };
    }
    case "area-changed": {
      return { ...state, area: action.area };
    }
    case "export-started": {
      return { ...state, isExporting: true, error: null };
    }
    case "export-failed": {
      return { ...state, isExporting: false, error: action.message };
    }
    default: {
      return state;
    }
  }
};

/**
 * The dialog itself: the cropper, a zoom slider, and the two ways out.
 *
 * `imageSrc` is the dialog's whole subject — `open` is derived from it being
 * non-null rather than held as a second flag, for the reason every other
 * derived-open dialog in this feature is: a `null` source is exactly "nothing
 * to crop", so there is no way to reach a mounted cropper with nothing in it.
 */
export const PhotoCropDialog: React.FC<PhotoCropDialogProps> = ({
  imageSrc,
  onCancel,
  onCropped,
}) => {
  const [{ crop, zoom, area, isExporting, error }, dispatch] = useReducer(
    cropReducer,
    INITIAL_CROP_STATE
  );

  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      dispatch({ type: "area-changed", area: croppedAreaPixels });
    },
    []
  );

  const handleCancel = useCallback(() => {
    dispatch({ type: "reset" });
    onCancel();
  }, [onCancel]);

  const handleConfirm = useCallback(async () => {
    if (!(imageSrc && area)) {
      return;
    }

    dispatch({ type: "export-started" });

    try {
      const blob = await cropToSquareBlob(imageSrc, area);
      onCropped(new File([blob], "photo.webp", { type: "image/webp" }));
      dispatch({ type: "reset" });
    } catch {
      dispatch({
        type: "export-failed",
        message: "That photo could not be cropped. Try a different one.",
      });
    }
  }, [area, imageSrc, onCropped]);

  return (
    <Dialog
      open={imageSrc !== null}
      onOpenChange={(open) => {
        if (!open) {
          handleCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop the photo</DialogTitle>
          <DialogDescription>
            Drag to reposition, and use the slider to zoom. The square you leave
            in view is what gets saved — the register always shows a 1:1 photo.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted relative h-72 w-full overflow-hidden">
          {imageSrc ? (
            <Cropper
              aspect={1}
              crop={crop}
              cropShape="rect"
              image={imageSrc}
              onCropChange={(next) =>
                dispatch({ type: "crop-changed", crop: next })
              }
              onCropComplete={handleCropComplete}
              onZoomChange={(next) =>
                dispatch({ type: "zoom-changed", zoom: next })
              }
              showGrid
              zoom={zoom}
            />
          ) : null}
        </div>

        <div className="flex items-center gap-3 px-1">
          <IconZoomOut
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
          <Slider
            aria-label="Zoom"
            max={3}
            min={1}
            onValueChange={(next) => {
              const nextZoom = Array.isArray(next) ? next[0] : next;
              dispatch({ type: "zoom-changed", zoom: nextZoom ?? 1 });
            }}
            step={0.01}
            value={[zoom]}
          />
          <IconZoomIn
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
        </div>

        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={isExporting}
            onClick={handleCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={isExporting || !area}
            onClick={() => {
              void handleConfirm();
            }}
            type="button"
          >
            {isExporting ? "Cropping…" : "Use this photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
