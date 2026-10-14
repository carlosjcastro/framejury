"use client";

import { useState } from "react";
import { createSummary, type Summary } from "@/lib/api";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setSummary(await createSummary(jobId));
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

      {busy && (
        <p aria-live="polite" className="mt-4 font-mono text-sm">
          <span className="shimmer">Reading the results</span>
          <span aria-hidden="true" className="caret" />
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-reject">
          {error}
        </p>
      )}

      {summary && !busy && (
        <div className="mt-4 max-w-2xl space-y-4">
          <p className="fade-in text-base leading-relaxed">{summary.summary}</p>

          {summary.double_check.length > 0 && (
            <div className="fade-in" style={{ animationDelay: "120ms" }}>
              <h3 className="text-sm font-medium">Worth a second look</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted marker:text-accent">
                {summary.double_check.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <p
            className="fade-in border-l-2 border-accent pl-4 text-sm"
            style={{ animationDelay: "240ms" }}
          >
            {summary.tip}
          </p>

          <p className="text-xs text-muted">
            {summary.source === "model"
              ? `Written by ${summary.model ?? "the local model"} on your computer. It can be wrong: check it against the evidence on each photo.`
              : "Template summary built from the counts. The model was not used for this one."}
          </p>
        </div>
      )}
    </section>
  );
}
