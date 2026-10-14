export type MotionMode = "system" | "on";

const KEY = "framejury-motion";
export const MOTION_EVENT = "framejury:motion";

export function getMotion(): MotionMode {
  return document.documentElement.dataset.motion === "on" ? "on" : "system";
}

export function setMotion(mode: MotionMode) {
  if (mode === "on") document.documentElement.dataset.motion = "on";
  else delete document.documentElement.dataset.motion;
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  window.dispatchEvent(new Event(MOTION_EVENT));
}

export function systemWantsReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return getMotion() !== "on" && systemWantsReducedMotion();
}

export const MOTION_BOOT_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="on")document.documentElement.dataset.motion="on"}catch(e){}`;
