"use client";

import { useSyncExternalStore } from "react";
import {
  MOTION_EVENT,
  getMotion,
  setMotion,
  type MotionMode,
} from "@/lib/motion";

function subscribe(callback: () => void) {
  window.addEventListener(MOTION_EVENT, callback);
  return () => window.removeEventListener(MOTION_EVENT, callback);
}

export function MotionSwitch() {
  const mode = useSyncExternalStore<MotionMode>(
    subscribe,
    getMotion,
    () => "system",
  );
  const on = mode === "on";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setMotion(on ? "system" : "on")}
      title={
        on
          ? "Animations are always on. Click to follow your system setting."
          : "Following your system setting. Click to always show animations."
      }
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted hover:text-ink print:hidden"
    >
      <span
        aria-hidden="true"
        className={`relative h-4 w-7 rounded-full border transition-colors ${
          on ? "border-accent bg-accent" : "border-control bg-transparent"
        }`}
      >
        <span
          className={`absolute top-0.5 size-2.5 rounded-full transition-all ${
            on ? "left-3.5 bg-accent-ink" : "left-0.5 bg-control"
          }`}
        />
      </span>
      <span>
        Motion<span className="sr-only">: </span>
        <span className="hidden sm:inline"> {on ? "always on" : "system"}</span>
      </span>
    </button>
  );
}
