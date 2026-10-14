"use client";

import { useState } from "react";
import type { Problem } from "@/lib/problems";

interface Props {
  problem: Problem;
  onRetry?: () => void;
  retryLabel?: string;
  onWithoutModel?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const MODEL_CODES = new Set([
  "ollama_down",
  "model_missing",
  "model_not_vision",
]);

export function ProblemNotice({
  problem,
  onRetry,
  retryLabel = "Try again",
  onWithoutModel,
  onDismiss,
  className = "",
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!problem.command) return;
    try {
      await navigator.clipboard.writeText(problem.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      role="alert"
      className={`fade-in max-w-3xl rounded-lg border border-reject bg-surface px-4 py-4 print:hidden ${className}`}
    >
      <div className="flex items-start gap-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="var(--reject)"
          strokeWidth="2"
          strokeLinecap="round"
          className="mt-0.5 shrink-0"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 4.5v4M8 11v.01" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{problem.title}</p>
          <p className="mt-1 text-sm text-muted">{problem.body}</p>

          {problem.command && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-line bg-canvas py-1 pl-3 pr-1">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">
                {problem.command}
              </code>
              <button
                type="button"
                onClick={copy}
                className="btn btn-secondary !min-h-9 shrink-0 !px-3 text-sm"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          {problem.hint && (
            <p className="mt-2 text-sm text-muted">{problem.hint}</p>
          )}

          {problem.detail && problem.code !== "unknown" && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer underline-offset-4 hover:underline">
                Technical detail
              </summary>
              <p className="mt-1 break-words font-mono text-xs">
                {problem.detail}
              </p>
            </details>
          )}

          {(onRetry || onWithoutModel || onDismiss) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="btn btn-primary"
                >
                  {retryLabel}
                </button>
              )}
              {onWithoutModel && MODEL_CODES.has(problem.code) && (
                <button
                  type="button"
                  onClick={onWithoutModel}
                  className="btn btn-secondary"
                >
                  Analyze without the model
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="btn btn-secondary"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
