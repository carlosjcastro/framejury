"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/lib/api";
import { prefersReducedMotion } from "@/lib/motion";

type State = "done" | "active" | "pending";

const LOOKING_AT = [
  "Whether anyone blinked",
  "How crisp the main face is",
  "Mid-word and awkward expressions",
  "The small differences between near-identical frames",
];

function Marker({ state }: { state: State }) {
  if (state === "done") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-keep text-[#052e1f]">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path className="draw" d="M3 8.5l3.2 3.2L13 4.8" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="grid size-5 shrink-0 place-items-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="20"
          height="20"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="spin"
        >
          <circle
            cx="10"
            cy="10"
            r="7"
            stroke="var(--control)"
            opacity="0.35"
          />
          <path d="M10 3a7 7 0 0 1 7 7" stroke="var(--accent)" />
        </svg>
      </span>
    );
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center">
      <span className="size-2.5 rounded-full border border-control" />
    </span>
  );
}

function Viewfinder() {
  const corner = "absolute h-2.5 w-2.5 border-accent";
  return (
    <span
      aria-hidden="true"
      className="relative block size-12 shrink-0 overflow-hidden rounded-sm bg-raised"
    >
      <i className={`${corner} left-0 top-0 border-l-2 border-t-2`} />
      <i className={`${corner} right-0 top-0 border-r-2 border-t-2`} />
      <i className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <i className={`${corner} bottom-0 right-0 border-b-2 border-r-2`} />
      <span className="scanline" />
    </span>
  );
}

function Dots() {
  return (
    <span aria-hidden="true" className="dot-wave ml-0.5 inline-flex">
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ animationDelay: `${i * 160}ms` }}>
          .
        </span>
      ))}
    </span>
  );
}

function Typed({ text }: { text: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      const timer = setTimeout(() => setCount(text.length), 0);
      return () => clearTimeout(timer);
    }
    const timer = setInterval(
      () => setCount((c) => Math.min(c + 1, text.length)),
      22,
    );
    return () => clearInterval(timer);
  }, [text]);

  return <>{text.slice(0, count)}</>;
}

export function ReasoningPanel({ job }: { job: Job }) {
  const [elapsed, setElapsed] = useState(0);
  const [log, setLog] = useState<{ text: string; at: number }[]>([]);
  const [seen, setSeen] = useState("");

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  const current = job.current ?? "";
  if (current && current !== seen) {
    setSeen(current);
    setLog((previous) => [
      ...previous.slice(-5),
      { text: current, at: elapsed },
    ]);
  }

  const useModel = job.vision !== false;
  const judging =
    job.stage === "judge" || /^(Comparing|Checking)/.test(current);
  const rules = current.startsWith("Applying");
  const phase = rules ? 3 : judging ? 2 : 0;
  const state = (index: number): State =>
    index < phase ? "done" : index === phase ? "active" : "pending";

  const ratio = job.total > 0 ? Math.min(job.done / job.total, 1) : 0;
  const share = useModel ? 0.3 : 0.75;
  const fraction =
    phase === 0
      ? share * ratio
      : phase === 2
        ? share + (0.95 - share) * ratio
        : 0.97;
  const percent = Math.round(fraction * 100);

  const groupLine =
    job.stage === "judge"
      ? `Group ${Math.min(job.done + 1, job.total)} of ${job.total}`
      : useModel
        ? "The first call loads the model and can take a few seconds"
        : "Comparing sharpness";

  const steps = [
    {
      title: "Measure every photo",
      detail:
        phase === 0
          ? `${job.done} of ${job.total}`
          : "Sharpness, exposure and capture time",
    },
    {
      title: "Group near-identical shots",
      detail:
        phase >= 2 && job.stage === "judge"
          ? `${job.total} groups found`
          : "Photos taken seconds apart that look alike",
    },
    {
      title: useModel
        ? "Compare shots with the vision model"
        : "Compare shots by sharpness",
      detail:
        phase === 2
          ? groupLine
          : useModel
            ? "Eyes, focus and expression"
            : "No model used",
    },
    {
      title: "Apply the decision rules",
      detail: "Every decision gets a reason",
    },
  ];

  const lookingAt = LOOKING_AT[Math.floor(elapsed / 3) % LOOKING_AT.length];

  return (
    <div className="mt-10 max-w-3xl">
      <div className="flex items-center gap-4">
        <Viewfinder />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {phase === 2 && useModel
              ? "Gemma is looking at your photos"
              : "Working on it"}
            <Dots />
          </h2>
          <p className="text-sm tabular-nums text-muted">
            {elapsed} s · everything stays on your computer
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{percent}%</p>
      </div>

      <div
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-5 h-1.5 overflow-hidden rounded-full bg-overlay"
      >
        <div
          className="bar h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>

      <ol className="mt-6 space-y-4">
        {steps.map((step, index) => {
          const s = state(index);
          return (
            <li
              key={step.title}
              className="reveal flex gap-3"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <Marker state={s} />
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${s === "pending" ? "text-muted" : ""}`}
                >
                  {step.title}
                </p>
                <p className="text-sm tabular-nums text-muted">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {phase === 2 && useModel && (
        <p className="mt-6 text-sm text-muted">
          Looking at{" "}
          <span key={lookingAt} className="fade-in inline-block text-ink">
            {lookingAt.toLowerCase()}
          </span>
        </p>
      )}

      {current && (
        <div className="mt-6 border-l-2 border-accent pl-4 font-mono text-sm">
          <p aria-live="polite">
            <span className="shimmer">
              <Typed key={current} text={current} />
            </span>
            <span aria-hidden="true" className="caret" />
          </p>
          {log.length > 1 && (
            <ul
              aria-label="Recent activity"
              className="mt-3 space-y-1 text-xs text-muted"
            >
              {log
                .slice(0, -1)
                .reverse()
                .map((entry, index) => (
                  <li
                    key={`${entry.at}-${entry.text}`}
                    className="fade-in flex gap-3 tabular-nums"
                    style={{ opacity: Math.max(0.25, 0.8 - index * 0.18) }}
                  >
                    <span className="shrink-0">
                      {String(entry.at).padStart(3, " ")} s
                    </span>
                    <span className="truncate">{entry.text}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
