"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { ComposeAction } from "@/lib/compose";
import { getLocalDateString } from "@/lib/startup-date";
import { prepareNavigationMotion } from "@/lib/navigation-motion";
import { getWarmupRoutes } from "@/lib/app-warmup";
import { prefetchFullRoute } from "@/lib/full-prefetch";
import { getVisualViewportBottomOffset } from "@/lib/visual-viewport";

import { useWarmAppData } from "./app-data-cache";
import { ExperimentalAddSheet } from "./experimental-add-sheet";
import { ExperimentalBottomNav } from "./experimental-bottom-nav";

const APP_PATHNAMES = [
  "/",
  "/progress",
  "/recipes",
  "/summary",
  "/planner",
  "/library",
  "/goals",
  "/weight",
  "/stats",
];

function isAppPathname(pathname: string) {
  return APP_PATHNAMES.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")),
  );
}

function pathnameToActiveTab(
  pathname: string,
): "log" | "progress" | "recipes" | "summary" {
  if (pathname.startsWith("/progress")) return "progress";
  if (
    pathname.startsWith("/recipes") ||
    pathname.startsWith("/planner") ||
    pathname.startsWith("/library")
  ) return "recipes";
  if (pathname.startsWith("/summary")) return "summary";
  return "log";
}

function useVisualViewportBottomOffset() {
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    function updateBottomOffset() {
      setBottomOffset((current) => {
        const next = getVisualViewportBottomOffset({
          layoutViewportHeight: window.innerHeight,
          visualViewport: window.visualViewport,
        });

        return current === next ? current : next;
      });
    }

    let animationFrame: number | null = null;
    let settleTimer: number | null = null;
    let finalTimer: number | null = null;

    function clearScheduledUpdates() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }

      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }

      if (finalTimer !== null) {
        window.clearTimeout(finalTimer);
        finalTimer = null;
      }
    }

    function scheduleBottomOffsetUpdate() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateBottomOffset();
      });

      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        updateBottomOffset();
      }, 180);

      if (finalTimer !== null) {
        window.clearTimeout(finalTimer);
      }
      finalTimer = window.setTimeout(() => {
        finalTimer = null;
        updateBottomOffset();
      }, 700);
    }

    updateBottomOffset();

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", scheduleBottomOffsetUpdate);
    visualViewport?.addEventListener("scroll", scheduleBottomOffsetUpdate);
    window.addEventListener("resize", scheduleBottomOffsetUpdate);
    window.addEventListener("orientationchange", scheduleBottomOffsetUpdate);
    window.addEventListener("focusin", scheduleBottomOffsetUpdate, true);
    window.addEventListener("focusout", scheduleBottomOffsetUpdate, true);
    window.addEventListener("pageshow", scheduleBottomOffsetUpdate);
    document.addEventListener("visibilitychange", scheduleBottomOffsetUpdate);

    return () => {
      clearScheduledUpdates();
      visualViewport?.removeEventListener("resize", scheduleBottomOffsetUpdate);
      visualViewport?.removeEventListener("scroll", scheduleBottomOffsetUpdate);
      window.removeEventListener("resize", scheduleBottomOffsetUpdate);
      window.removeEventListener("orientationchange", scheduleBottomOffsetUpdate);
      window.removeEventListener("focusin", scheduleBottomOffsetUpdate, true);
      window.removeEventListener("focusout", scheduleBottomOffsetUpdate, true);
      window.removeEventListener("pageshow", scheduleBottomOffsetUpdate);
      document.removeEventListener("visibilitychange", scheduleBottomOffsetUpdate);
    };
  }, []);

  return bottomOffset;
}

export function ExperimentalLayoutNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const bottomOffset = useVisualViewportBottomOffset();
  const selectedDate = searchParams.get("date") ?? getLocalDateString();
  const warmupEnabled = isAppPathname(pathname);
  useWarmAppData(selectedDate, warmupEnabled);

  useEffect(() => {
    if (!warmupEnabled) {
      return;
    }

    for (const href of getWarmupRoutes(selectedDate)) {
      prefetchFullRoute(router, href);
    }
  }, [router, selectedDate, warmupEnabled]);

  if (!warmupEnabled) {
    return null;
  }

  const activeTab = pathnameToActiveTab(pathname);

  function handleAddSelection(action: ComposeAction) {
    setAddSheetOpen(false);

    if (pathname === "/") {
      // On the log page: delegate to the dashboard shell via custom event
      window.dispatchEvent(new CustomEvent("macro-tracker-add", { detail: action }));
      return;
    }

    // On other pages: navigate to the log page with the compose action
    const href = `/?date=${selectedDate}&compose=${action}`;
    prepareNavigationMotion(href, "screen-backward");
    startNavigation(() => {
      router.push(href);
    });
  }

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 z-30 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        style={{ bottom: bottomOffset }}
      >
        <div className="mx-auto w-full max-w-3xl">
          <ExperimentalBottomNav
            activeTab={activeTab}
            selectedDate={selectedDate}
            onAdd={() => setAddSheetOpen(true)}
          />
        </div>
      </div>

      <ExperimentalAddSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onSelect={handleAddSelection}
      />
    </>
  );
}
