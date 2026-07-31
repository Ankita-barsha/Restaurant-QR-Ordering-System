/**
 * Modal dialog.
 *
 * Used for create and edit forms instead of expanding them inline, so the
 * list underneath keeps its position and long forms do not push content
 * around as they open.
 *
 * Uses shared useDialog hook (#19) for focus trapping, restoration and escape key handling.
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
 */

import { type ReactNode } from "react";
import { useDialog } from "../hooks/useDialog";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned to the bottom, outside the scrolling body. */
  footer?: ReactNode;
}

const Modal = ({ open, title, description, onClose, children, footer }: ModalProps) => {
  const { dialogRef } = useDialog({ open, onClose });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian/80 p-0 backdrop-blur-sm sm:items-center sm:p-4 animate-fade"
      // Clicking the backdrop closes; clicks inside the panel must not bubble
      // up and close it accidentally.
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92svh] w-full max-w-lg flex-col overscroll-contain rounded-t-2xl border border-smoke bg-charcoal text-ivory shadow-xl sm:rounded-2xl animate-rise"
      >
        <header className="flex items-start justify-between gap-4 border-b border-smoke px-4 py-3.5 sm:px-5 sm:py-4">
          <div>
            <h2 className="text-lg font-bold text-ivory">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-ivory-dim">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-ivory-dim transition hover:bg-graphite hover:text-slate"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2 border-t border-smoke px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

export default Modal;
