/**
 * Image picker with preview and drag-and-drop.
 *
 * Shows the chosen photo BEFORE upload. Without a preview the only way to
 * discover you picked the wrong file is to save and look at the menu — which
 * means an unwanted image has already gone live.
 *
 * The client-side checks here mirror the server's, so an obviously wrong file
 * is rejected instantly instead of after a slow upload. They are convenience
 * only: the server re-verifies the file's magic bytes regardless.
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
 */

import { useEffect, useRef, useState, type DragEvent } from "react";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 2 * 1024 * 1024;

interface ImagePickerProps {
  /** Existing image URL when editing, so the current photo is visible. */
  currentUrl?: string | null;
  /** Called with the chosen file, or null when it is cleared. */
  onChange: (file: File | null) => void;
  label?: string;
}

const ImagePicker = ({ currentUrl, onChange, label = "Photo" }: ImagePickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const accept = (file: File | undefined) => {
    setError(null);

    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      setError("Choose a JPG, PNG, WebP or GIF image.");
      return;
    }

    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setError(`That image is ${mb}MB. The limit is 2MB.`);
      return;
    }

    if (preview) URL.revokeObjectURL(preview);

    setPreview(URL.createObjectURL(file));
    onChange(file);
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);

    setPreview(null);
    setError(null);
    onChange(null);

    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    accept(event.dataTransfer.files[0]);
  };

  const shown = preview ?? currentUrl ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ivory-dim">{label}</span>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative overflow-hidden rounded-xl border-2 border-dashed transition-all ${
          isDragging
            ? "border-gold bg-gold/15"
            : "border-smoke bg-graphite/60 hover:border-gold/50 hover:bg-graphite"
        }`}
      >
        {shown ? (
          <div className="relative">
            <img
              src={shown}
              alt="Selected"
              className="h-44 w-full object-cover"
            />

            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-obsidian/80 to-transparent p-2.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-gold px-3.5 py-1.5 text-xs font-bold text-obsidian shadow-md transition hover:bg-gold-light"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-lg bg-ember/90 px-3.5 py-1.5 text-xs font-bold text-ivory shadow-md transition hover:bg-ember"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-36 w-full flex-col items-center justify-center gap-2 p-4 text-ivory transition hover:text-gold"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-4.35-4.35a2 2 0 0 0-2.83 0L3 21" />
            </svg>
            <span className="text-sm font-semibold text-ivory">Drop a photo here, or click to choose</span>
            <span className="text-xs font-medium text-ivory-dim">JPG, PNG, WebP or GIF · up to 2MB</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={(event) => accept(event.target.files?.[0])}
        className="hidden"
      />

      {error && <p className="text-xs font-semibold text-ember">{error}</p>}
    </div>
  );
};

export default ImagePicker;
