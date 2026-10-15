"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

const DEFAULT_INTERVAL_MS = 22;

interface TypedProps {
  text: string;
  interval?: number;
}

export function Typed({ text, interval = DEFAULT_INTERVAL_MS }: TypedProps) {
  const [count, setCount] = useState(() =>
    prefersReducedMotion() ? text.length : 0,
  );
  const finished = count >= text.length;

  useEffect(() => {
    if (finished) return;
    const timer = setInterval(
      () => setCount((value) => Math.min(value + 1, text.length)),
      interval,
    );
    return () => clearInterval(timer);
  }, [finished, text.length, interval]);

  return <>{text.slice(0, count)}</>;
}
