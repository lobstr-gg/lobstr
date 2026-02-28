"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scaleIn } from "@/lib/motion";
import { ZoomIn, ZoomOut, Check, X } from "lucide-react";

interface ImageCropModalProps {
  file: File;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const OUTPUT_SIZE = 256;

export default function ImageCropModal({ file, onConfirm, onCancel }: ImageCropModalProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new window.Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Clamp offset so image can't be dragged out of the viewport
  const clampOffset = useCallback(
    (ox: number, oy: number, s: number) => {
      if (!containerRef.current || imgSize.w === 0) return { x: ox, y: oy };
      const box = containerRef.current.getBoundingClientRect();
      const viewSize = box.width; // square container
      const aspect = imgSize.w / imgSize.h;
      let dispW: number, dispH: number;
      if (aspect >= 1) {
        dispH = viewSize * s;
        dispW = dispH * aspect;
      } else {
        dispW = viewSize * s;
        dispH = dispW / aspect;
      }
      const maxX = Math.max(0, (dispW - viewSize) / 2);
      const maxY = Math.max(0, (dispH - viewSize) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      };
    },
    [imgSize],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset(clampOffset(offsetStart.current.x + dx, offsetStart.current.y + dy, scale));
  };

  const handlePointerUp = () => setDragging(false);

  const handleScaleChange = (newScale: number) => {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    setScale(s);
    setOffset(clampOffset(offset.x, offset.y, s));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    handleScaleChange(scale + delta);
  };

  const handleConfirm = () => {
    if (!imgSrc || imgSize.w === 0 || !containerRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d")!;

    const img = new window.Image();
    img.onload = () => {
      const viewSize = containerRef.current!.getBoundingClientRect().width;
      const aspect = imgSize.w / imgSize.h;
      let dispW: number, dispH: number;
      if (aspect >= 1) {
        dispH = viewSize * scale;
        dispW = dispH * aspect;
      } else {
        dispW = viewSize * scale;
        dispH = dispW / aspect;
      }

      // Where the image top-left is relative to the viewport
      const imgLeft = (viewSize - dispW) / 2 + offset.x;
      const imgTop = (viewSize - dispH) / 2 + offset.y;

      // Map viewport origin to source pixels
      const srcX = (-imgLeft / dispW) * imgSize.w;
      const srcY = (-imgTop / dispH) * imgSize.h;
      const srcW = (viewSize / dispW) * imgSize.w;
      const srcH = (viewSize / dispH) * imgSize.h;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const cropped = new File([blob], file.name.replace(/\.\w+$/, ".webp"), {
              type: "image/webp",
            });
            onConfirm(cropped);
          }
        },
        "image/webp",
        0.9,
      );
    };
    img.src = imgSrc;
  };

  if (!imgSrc) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-surface-0/70 backdrop-blur-sm" onClick={onCancel} />

        <motion.div
          className="relative w-full max-w-sm card p-4 sm:p-5 bg-surface-1 border border-border"
          variants={scaleIn}
          initial="hidden"
          animate="show"
          exit="hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Adjust Profile Image</h3>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Crop viewport */}
          <div
            ref={containerRef}
            className="relative w-full aspect-square rounded-full overflow-hidden bg-surface-0 border border-border cursor-grab active:cursor-grabbing mx-auto"
            style={{ maxWidth: 240 }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
          >
            <img
              src={imgSrc}
              alt="Crop preview"
              draggable={false}
              className="absolute select-none"
              style={{
                width: imgSize.w >= imgSize.h ? "auto" : "100%",
                height: imgSize.w >= imgSize.h ? "100%" : "auto",
                minWidth: "100%",
                minHeight: "100%",
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: "center center",
              }}
            />
          </div>

          {/* Scale slider */}
          <div className="flex items-center gap-3 mt-4 px-2">
            <ZoomOut className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.01}
              value={scale}
              onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
              className="flex-1 accent-lob-green h-1.5"
            />
            <ZoomIn className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          </div>
          <p className="text-[10px] text-text-tertiary text-center mt-1">
            Drag to reposition. Scroll or use slider to zoom.
          </p>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={onCancel}
              className="btn-secondary flex-1 text-xs"
            >
              Cancel
            </button>
            <motion.button
              onClick={handleConfirm}
              className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5"
              whileTap={{ scale: 0.97 }}
            >
              <Check className="w-3.5 h-3.5" />
              Apply
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
