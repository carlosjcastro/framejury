"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/lib/api";

type State = "done" | "active" | "pending";

function Marker({ state }: { state: State }) {
  if (state === "done") {
    return (
      <span className="grid size-5 place-items-center rounded-full bg-keep text-[#052e1f]">
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
      <span className="grid size-5 place-items-center">
        <span className="pulse-dot size-2.5 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <span className="grid size-5 place-items-center">
      <span className="size-2.5 rounded-full border border-control" />
    </span>
  );
}

export function ReasoningPanel({ job }: { job: Job }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  const current = job.current ?? "";
  const useModel = job.vision !== false;
  const judging =
    job.stage === "judge" || /^(Comparing|Checking)/.test(current);
  const rules = current.startsWith("Applying");
  const phase = rules ? 3 : judging ? 2 : 0;
  const state = (index: number): State =>
    index < phase ? "done" : index === phase ? "active" : "pending";

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

  return (
    <div className="mt-10 max-w-3xl">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Working on it</h2>
        <p className="text-sm tabular-nums text-muted">{elapsed} s</p>
      </div>

      <ol className="mt-5 space-y-4">
        {steps.map((step, index) => {
          const s = state(index);
          return (
            <li key={step.title} className="flex gap-3">
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

      {current && (
        <p
          aria-live="polite"
          className="mt-6 border-l-2 border-accent pl-4 font-mono text-sm"
        >
          <span className="shimmer">{current}</span>
          <span aria-hidden="true" className="caret" />
        </p>
      )}
    </div>
  );
}
