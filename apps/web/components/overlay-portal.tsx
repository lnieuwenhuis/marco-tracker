"use client";

import { type RefObject, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}

export function useDismissableLayer<T extends HTMLElement>({
  active = true,
  layerRef,
  onDismiss,
  onKeyDown,
}: {
  active?: boolean;
  layerRef: RefObject<T | null>;
  onDismiss: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}) {
  useEffect(() => {
    if (!active) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
        return;
      }

      onKeyDown?.(event);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (layerRef.current?.contains(target)) {
        return;
      }

      onDismiss();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [active, layerRef, onDismiss, onKeyDown]);
}

export function useEscapeDismiss(active: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!active) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, onDismiss]);
}

export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}
