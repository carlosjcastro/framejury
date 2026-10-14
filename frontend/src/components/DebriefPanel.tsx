"use client";

import { useEffect, useMemo, useState } from "react";
import { createSummary, type Summary } from "@/lib/api";
import { prefersReducedMotion } from "@/lib/motion";

const PHRASES = [
  "Reading the results",
  "Checking which photos were flagged",
  "Weighing your changes",
  "Choosing what to suggest",
  "Writing the note",
];

function Thinking() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => Math.min(i + 1, PHRASES.length - 1)),
      1600,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mt-4 max-w-2xl" role="status" aria-live="polite">
      <p className="flex items-center gap-2 font-mono text-sm">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="16"
          height="16"
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
        <span key={index} className="fade-in shimmer">
          {PHRASES[index]}
        </span>
        <span aria-hidden="true" className="dot-wave inline-flex">
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ animationDelay: `${i * 160}ms` }}>
              .
            </span>
          ))}
        </span>
      </p>
      <div aria-hidden="true" className="mt-5 space-y-2.5">
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton h-3.5 w-[92%]" />
        <div className="skeleton h-3.5 w-[64%]" />
      </div>
    </div>
  );
}

function slice(text: string, offset: number, shown: number) {
  return text.slice(0, Math.max(0, Math.min(text.length, shown - offset)));
}

function Note({ summary, animate }: { summary: Summary; animate: boolean }) {
  const parts = useMemo(
    () => [summary.summary, ...summary.double_check, summary.tip],
    [summary],
  );
  const offsets = useMemo(() => {
    let sum = 0;
    return parts.map((part) => {
      const start = sum;
      sum += part.length + 1;
      return start;
    });
  }, [parts]);
  const total = offsets[offsets.length - 1] + parts[parts.length - 1].length;
  const run = animate && !prefersReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!run) return;
    const rate = Math.max(110, total / 5);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(total, Math.floor(((now - start) / 1000) * rate));
      setShown((previous) => (previous === next ? previous : next));
      if (next < total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, total]);

  const visible = run ? shown : total;
  const done = visible >= total;
  const active = parts.findIndex(
    (part, i) => visible < offsets[i] + part.length,
  );
  const caret = (i: number) =>
    !done && active === i ? (
      <span aria-hidden="true" className="caret" />
    ) : null;

  const items = summary.double_check;
  const tipIndex = parts.length - 1;

  return (
    <div className="mt-4 max-w-2xl space-y-4">
      <div className="sr-only" aria-live="polite">
        <p>{summary.summary}</p>
        {items.length > 0 && (
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        <p>{summary.tip}</p>
      </div>

      <div aria-hidden="true" className="space-y-4">
        <p className="text-base leading-relaxed">
          {slice(parts[0], offsets[0], visible)}
          {caret(0)}
        </p>

        {items.length > 0 && visible > offsets[1] && (
          <div>
            <h3 className="fade-in text-sm font-medium">Worth a second look</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted marker:text-accent">
              {items.map((item, i) =>
                visible > offsets[i + 1] ? (
                  <li key={item}>
                    {slice(item, offsets[i + 1], visible)}
                    {caret(i + 1)}
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        )}

        {visible > offsets[tipIndex] && (
          <p className="border-l-2 border-accent pl-4 text-sm">
            {slice(parts[tipIndex], offsets[tipIndex], visible)}
            {caret(tipIndex)}
          </p>
        )}
      </div>

      {done && (
        <p className="fade-in text-xs text-muted">
          {summary.source === "model"
            ? `Written by ${summary.model ?? "the local model"} on your computer. It can be wrong: check it against the evidence on each photo.`
            : "Template summary built from the counts. The model was not used for this one."}
        </p>
      )}
    </div>
  );
}

export function DebriefPanel({
  jobId,
  saved,
  model,
}: {
  jobId: string;
  saved?: Summary;
  model: string | null;
}) {
  const [summary, setSummary] = useState<Summary | null>(saved ?? null);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const result = await createSummary(jobId);
      setSummary(result);
      setFresh(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="debrief"
      className="mt-14 border-t border-line pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="debrief" className="text-xl font-semibold tracking-tight">
          {model ? "Gemma’s debrief" : "Debrief"}
        </h2>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="btn btn-secondary print:hidden"
        >
          {busy ? "Writing…" : summary ? "Write it again" : "Write a debrief"}
        </button>
      </div>

      {!summary && !busy && !error && (
        <p className="mt-3 max-w-2xl text-sm text-muted">
          A short closing note on what was found and what deserves a second
          look. It is written from the numbers and reasons above, not from a new
          look at your photos. Your own changes are taken into account.
        </p>
      )}

      {busy && <Thinking />}

      {error && (
        <p role="alert" className="mt-4 text-sm text-reject">
          {error}
        </p>
      )}

      {summary && !busy && (
        <Note
          key={summary.generated_at ?? summary.summary}
          summary={summary}
          animate={fresh}
        />
      )}
    </section>
  );
}
