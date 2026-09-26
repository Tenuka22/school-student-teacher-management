"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { IconAlertCircle, IconQrcode } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import QrScanner from "qr-scanner";
// `?url` is a Vite-specific import suffix returning the asset's URL as the
// default export; the file itself has no ESM exports at all, which is what the
// `import/default` rule is (mis)reading as a missing one. The directive has to
// sit on the line immediately above the import, so the explanation comes first.
// oxlint-disable-next-line import/default
import QrScannerWorkerPath from "qr-scanner/qr-scanner-worker.min.js?url";
import { useEffect, useRef, useState } from "react";

QrScanner.WORKER_PATH = QrScannerWorkerPath;

/**
 * The label a QR sticker on a cupboard or a shelf actually carries, decoded.
 *
 * The QR encodes a full URL (`{origin}/inventory/{itemId}`) rather than a bare
 * id, so a phone's own camera app — no scanner in this app at all — can still
 * open the item on a browser and show the same page. This dialog exists for
 * the in-app path: it saves the extra tap of "open the link the camera app
 * offered" by decoding the same URL and navigating there directly, over the
 * device camera rather than the system one.
 */
const ITEM_URL_PATTERN = /\/inventory\/(?<itemId>[^/?#]+)/u;

const extractItemId = (decoded: string): string | null => {
  const match = ITEM_URL_PATTERN.exec(decoded);
  const itemId = match?.groups?.itemId;
  return itemId ? decodeURIComponent(itemId) : null;
};

export const QrScanDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !videoRef.current) {
      return;
    }

    setError(null);
    const video = videoRef.current;

    const scanner = new QrScanner(
      video,
      (result) => {
        const itemId = extractItemId(result.data);
        if (!itemId) {
          setError(
            "That QR code isn't one of this store's item labels — scan the code printed on the shelf or cupboard."
          );
          return;
        }

        scanner.stop();
        onOpenChange(false);
        void navigate({ to: "/inventory/$itemId", params: { itemId } });
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: "environment",
      }
    );

    scannerRef.current = scanner;

    const startScanning = async () => {
      try {
        await scanner.start();
      } catch {
        setError(
          "Could not open the camera — check the browser has permission to use it."
        );
      }
    };
    void startScanning();

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [open, navigate, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <IconQrcode className="size-5" />
          Scan an item&rsquo;s QR code
        </DialogTitle>
        <DialogDescription>
          Point the camera at the label on the shelf or cupboard. It opens the
          item automatically once it&rsquo;s read.
        </DialogDescription>

        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 border p-3 text-sm">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="bg-muted overflow-hidden rounded-md">
          {/*
            `muted` and `playsInline` are load-bearing, not stylistic: iOS Safari
            refuses to autoplay a camera stream without both, and a video with
            no audio track that fails to autoplay is a black box with nothing
            on screen to explain why.
          */}
          <video
            ref={videoRef}
            muted
            playsInline
            className="aspect-square w-full object-cover"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
