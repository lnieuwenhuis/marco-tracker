"use client";

import type { ReactNode } from "react";

import { CloseButton } from "./close-button";
import {
  OverlayPortal,
  useBodyScrollLock,
  useEscapeDismiss,
} from "./overlay-portal";

type CompactModalProps = {
  ariaLabel: string;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

export function CompactModal({
  ariaLabel,
  title,
  onClose,
  children,
}: CompactModalProps) {
  useBodyScrollLock();
  useEscapeDismiss(true, onClose);

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="fixed inset-x-4 top-[8%] z-50 mx-auto max-h-[82vh] max-w-sm overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--color-ink)]">
            {title}
          </h2>
          <CloseButton
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
            iconSize={18}
          />
        </div>

        {children}
      </div>
    </OverlayPortal>
  );
}
