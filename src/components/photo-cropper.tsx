"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_CROP_ZOOM,
  MIN_CROP_ZOOM,
  resolveCoverTransform,
} from "@/lib/image-crop";

const PREVIEW_SIZE = 240;
const OUTPUT_SIZE = 512;

type Props = {
  file: File;
  onCancel: () => void;
  onApply: (file: File) => void;
  onError?: (message: string) => void;
};

type LoadedImage = {
  image: HTMLImageElement;
  objectUrl: string;
  width: number;
  height: number;
};

function loadImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        image,
        objectUrl,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read this image. Try another file."));
    };
    image.src = objectUrl;
  });
}

export function drawCropPreview(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  imageWidth: number,
  imageHeight: number,
  outputSize: number,
  zoom: number,
  panX: number,
  panY: number,
) {
  const transform = resolveCoverTransform(
    imageWidth,
    imageHeight,
    outputSize,
    zoom,
    panX,
    panY,
  );
  context.clearRect(0, 0, outputSize, outputSize);
  context.drawImage(
    image,
    transform.drawX,
    transform.drawY,
    transform.drawWidth,
    transform.drawHeight,
  );
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not finalize cropped image."));
          return;
        }
        resolve(blob);
      },
      type,
      0.9,
    );
  });
}

function buildCroppedFileName(original: string): string {
  const base = original.replace(/\.[^/.]+$/, "").trim() || "profile";
  return `${base}-cropped.webp`;
}

export function PhotoCropper({ file, onCancel, onApply, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setLoadedImage(null);

    void loadImageFile(file)
      .then((nextImage) => {
        if (cancelled) {
          URL.revokeObjectURL(nextImage.objectUrl);
          return;
        }
        setLoadedImage(nextImage);
      })
      .catch((loadError: unknown) => {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Could not load this image for cropping.";
        if (!cancelled) {
          setError(message);
          onError?.(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file, onError]);

  useEffect(() => {
    return () => {
      if (loadedImage?.objectUrl) {
        URL.revokeObjectURL(loadedImage.objectUrl);
      }
    };
  }, [loadedImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    drawCropPreview(
      context,
      loadedImage.image,
      loadedImage.width,
      loadedImage.height,
      PREVIEW_SIZE,
      zoom,
      panX,
      panY,
    );
  }, [loadedImage, panX, panY, zoom]);

  const applyCrop = useCallback(async () => {
    if (!loadedImage) {
      setError("Image is still loading. Please wait a moment.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = OUTPUT_SIZE;
      outputCanvas.height = OUTPUT_SIZE;
      const context = outputCanvas.getContext("2d");
      if (!context) {
        throw new Error("Could not prepare image crop.");
      }

      drawCropPreview(
        context,
        loadedImage.image,
        loadedImage.width,
        loadedImage.height,
        OUTPUT_SIZE,
        zoom,
        panX,
        panY,
      );

      const blob = await toBlob(outputCanvas, "image/webp");
      const croppedFile = new File([blob], buildCroppedFileName(file.name), {
        type: blob.type || "image/webp",
      });
      onApply(croppedFile);
    } catch (applyError) {
      const message =
        applyError instanceof Error
          ? applyError.message
          : "Could not crop image. Please try again.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }, [file.name, loadedImage, onApply, onError, panX, panY, zoom]);

  return (
    <section className="wgeu-cropper" aria-live="polite">
      <div className="wgeu-cropper-header">
        <h3>Adjust Profile Photo</h3>
        <p>Pan and zoom your image so your face is centered before upload.</p>
      </div>

      <div className="wgeu-cropper-preview-wrap">
        <canvas
          ref={canvasRef}
          className="wgeu-cropper-preview"
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
        />
      </div>

      <div className="wgeu-cropper-controls">
        <label className="wgeu-label">
          Zoom
          <input
            className="wgeu-slider"
            type="range"
            min={MIN_CROP_ZOOM}
            max={MAX_CROP_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number.parseFloat(event.target.value))}
            disabled={busy || !loadedImage}
          />
        </label>

        <label className="wgeu-label">
          Move Left / Right
          <input
            className="wgeu-slider"
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={panX}
            onChange={(event) => setPanX(Number.parseFloat(event.target.value))}
            disabled={busy || !loadedImage}
          />
        </label>

        <label className="wgeu-label">
          Move Up / Down
          <input
            className="wgeu-slider"
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={panY}
            onChange={(event) => setPanY(Number.parseFloat(event.target.value))}
            disabled={busy || !loadedImage}
          />
        </label>
      </div>

      <div className="wgeu-cropper-actions">
        <button
          className="wgeu-button wgeu-button-secondary"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className="wgeu-button wgeu-button-primary"
          type="button"
          onClick={() => void applyCrop()}
          disabled={busy || !loadedImage}
        >
          {busy ? "Processing..." : "Use This Crop"}
        </button>
      </div>

      {error ? <p className="wgeu-message wgeu-message-error">{error}</p> : null}
    </section>
  );
}

