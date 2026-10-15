"use client";

import { useSyncExternalStore } from "react";
import { MOTION_EVENT, prefersReducedMotion } from "@/lib/motion";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(callback: () => void) {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", callback);
  window.addEventListener(MOTION_EVENT, callback);
  return () => {
    query.removeEventListener("change", callback);
    window.removeEventListener(MOTION_EVENT, callback);
  };
}

function subscribeToVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotion,
    prefersReducedMotion,
    () => false,
  );
}

export function usePageHidden(): boolean {
  return useSyncExternalStore(
    subscribeToVisibility,
    () => document.visibilityState === "hidden",
    () => false,
  );
}
