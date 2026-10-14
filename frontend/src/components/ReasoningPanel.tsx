"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/lib/api";
import { prefersReducedMotion } from "@/lib/motion";

type StepState = "done" | "active" | "pending";

interface LogEntry {
  text: string;
  at: number;
}

interface Step {
  title: string;
  detail: string;
}

const PHASE = { measure: 0, judge: 2, rules: 3 } as const;
type Phase = (typeof PHASE)[keyof typeof PHASE];

const LOOKING_AT = [
  "whether anyone blinked",
  "how crisp the main face is",
  "mid-word and awkward expressions",
  "the small differences between near-identical frames",
];

const JUDGING_NOTE = /^(Comparing|Checking)/;
const RULES_NOTE = "Applying";

const TYPING_INTERVAL_MS = 22;
const LOOKING_ROTATION_SECONDS = 3;
const LOG_LIMIT = 6;
const MIN_JUDGED_FOR_ESTIMATE = 2;
const STALLED_AFTER_SECONDS = 90;

const MODEL_SHARE = 0.3;
const METRICS_SHARE = 0.75;
const JUDGE_CEILING = 0.95;
const RULES_FRACTION = 0.97;

const SLOT = "grid size-5 shrink-0 place-items-center";
const CORNER = "absolute h-2.5 w-2.5 border-accent";
const CORNERS = [
  "left-0 top-0 border-l-2 border-t-2",
  "right-0 top-0 border-r-2 border-t-2",
  "bottom-0 left-0 border-b-2 border-l-2",
  "bottom-0 right-0 border-b-2 border-r-2",
];
const DOT_DELAYS = [0, 160, 320];

function describeRemaining(seconds: number): string {
  if (seconds < 45) return "less than a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 2) return "about a minute";
  if (minutes >= 90) return "over an hour";
  return `about ${minutes} minutes`;
}

function detectPhase(job: Job, current: string): Phase {
  if (current.startsWith(RULES_NOTE)) return PHASE.rules;
  const judging = job.stage === "judge" || JUDGING_NOTE.test(current);
  return judging ? PHASE.judge : PHASE.measure;
}

function progressFraction(
  phase: Phase,
  ratio: number,
  useModel: boolean,
): number {
  const share = useModel ? MODEL_SHARE : METRICS_SHARE;
  if (phase === PHASE.measure) return share * ratio;
  if (phase === PHASE.judge) return share + (JUDGE_CEILING - share) * ratio;
  return RULES_FRACTION;
}

function stepState(index: number, phase: Phase): StepState {
  if (index < phase) return "done";
  return index === phase ? "active" : "pending";
}

function buildSteps(job: Job, phase: Phase, useModel: boolean): Step[] {
  const judgingGroups = job.stage === "judge";
  const groupLine = judgingGroups
    ? `Group ${Math.min(job.done + 1, job.total)} of ${job.total}`
    : useModel
      ? "The first call loads the model and can take a few seconds"
      : "Comparing sharpness";

  return [
    {
      title: "Measure every photo",
      detail:
        phase === PHASE.measure
          ? `${job.done} of ${job.total}`
          : "Sharpness, exposure and capture time",
    },
    {
      title: "Group near-identical shots",
      detail:
        phase >= PHASE.judge && judgingGroups
          ? `${job.total} groups found`
          : "Photos taken seconds apart that look alike",
    },
    {
      title: useModel
        ? "Compare shots with the vision model"
        : "Compare shots by sharpness",
      detail:
        phase === PHASE.judge
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
}

function useElapsedSeconds(): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  return elapsed;
}

function useActivityLog(current: string, elapsed: number): LogEntry[] {
  const [log, setLog] = useState<LogEntry[]>([]);

  if (current && current !== log.at(-1)?.text) {
    setLog([...log.slice(1 - LOG_LIMIT), { text: current, at: elapsed }]);
  }

  return log;
}

function useRunPace(job: Job, judging: boolean, elapsed: number) {
  const [judgeStart, setJudgeStart] = useState<number | null>(null);
  const [lastProgress, setLastProgress] = useState({ key: "", at: 0 });

  const progressKey = `${job.stage}:${job.done}`;
  if (judging && judgeStart === null) setJudgeStart(elapsed);
  if (lastProgress.key !== progressKey)
    setLastProgress({ key: progressKey, at: elapsed });

  const judged = job.stage === "judge" ? job.done : 0;
  const remaining =
    judgeStart !== null && judged >= MIN_JUDGED_FOR_ESTIMATE
      ? Math.max(job.total - judged, 0) * ((elapsed - judgeStart) / judged)
      : null;

  return { remaining, idleSeconds: elapsed - lastProgress.at };
}

function Marker({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className={`${SLOT} rounded-full bg-keep text-[#052e1f]`}>
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
      <span className={SLOT}>
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
    <span className={SLOT}>
      <span className="size-2.5 rounded-full border border-control" />
    </span>
  );
}

function Viewfinder() {
  return (
    <span
      aria-hidden="true"
      className="relative block size-12 shrink-0 overflow-hidden rounded-sm bg-raised"
    >
      {CORNERS.map((position) => (
        <i key={position} className={`${CORNER} ${position}`} />
      ))}
      <span className="scanline" />
    </span>
  );
}

function Dots() {
  return (
    <span aria-hidden="true" className="dot-wave ml-0.5 inline-flex">
      {DOT_DELAYS.map((delay) => (
        <span key={delay} style={{ animationDelay: `${delay}ms` }}>
          .
        </span>
      ))}
    </span>
  );
}

function Typed({ text }: { text: string }) {
  const [count, setCount] = useState(() =>
    prefersReducedMotion() ? text.length : 0,
  );
  const finished = count >= text.length;

  useEffect(() => {
    if (finished) return;
    const timer = setInterval(
      () => setCount((value) => Math.min(value + 1, text.length)),
      TYPING_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [finished, text.length]);

  return <>{text.slice(0, count)}</>;
}

function ActivityHistory({ entries }: { entries: LogEntry[] }) {
  return (
    <ul
      aria-label="Recent activity"
      className="mt-3 space-y-1 text-xs text-muted"
    >
      {entries.map((entry, index) => (
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
  );
}

export function ReasoningPanel({ job }: { job: Job }) {
  const elapsed = useElapsedSeconds();
  const current = job.current ?? "";
  const log = useActivityLog(current, elapsed);
  const phase = detectPhase(job, current);
  const { remaining, idleSeconds } = useRunPace(
    job,
    phase >= PHASE.judge,
    elapsed,
  );

  const useModel = job.vision !== false;
  const modelJudging = useModel && phase === PHASE.judge;
  const stalled = phase === PHASE.judge && idleSeconds > STALLED_AFTER_SECONDS;
  const ratio = job.total > 0 ? Math.min(job.done / job.total, 1) : 0;
  const percent = Math.round(progressFraction(phase, ratio, useModel) * 100);
  const steps = buildSteps(job, phase, useModel);
  const history = log.slice(0, -1).reverse();
  const lookingAt =
    LOOKING_AT[
      Math.floor(elapsed / LOOKING_ROTATION_SECONDS) % LOOKING_AT.length
    ];

  return (
    <div className="mt-10 max-w-3xl">
      <div className="flex items-center gap-4">
        <Viewfinder />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {modelJudging ? "Gemma is looking at your photos" : "Working on it"}
            <Dots />
          </h2>
          <p className="text-sm tabular-nums text-muted">
            {elapsed} s
            {remaining !== null &&
              remaining > 0 &&
              ` · ${describeRemaining(remaining)} left`}{" "}
            · everything stays on your computer
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
          const state = stepState(index, phase);
          return (
            <li
              key={step.title}
              className="reveal flex gap-3"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <Marker state={state} />
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${state === "pending" ? "text-muted" : ""}`}
                >
                  {step.title}
                </p>
                <p className="text-sm tabular-nums text-muted">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {useModel && phase < PHASE.rules && (
        <p className="mt-6 max-w-xl text-sm text-muted">
          {stalled
            ? "Still working. This group is taking longer than usual. Large RAW files and the first model load are the usual reasons, and your graphics card sets the pace."
            : "Comparing shots with a local model can take several minutes, depending on your graphics card and how many groups there are. Keep this tab open."}
        </p>
      )}

      {modelJudging && (
        <p className="mt-6 text-sm text-muted">
          Looking at{" "}
          <span key={lookingAt} className="fade-in inline-block text-ink">
            {lookingAt}
          </span>
        </p>
      )}

      {current && (
        <div className="mt-6 border-l-2 border-accent pl-4 font-mono text-sm">
          <p>
            <span className="sr-only" aria-live="polite">
              {current}
            </span>
            <span aria-hidden="true" className="shimmer">
              <Typed key={current} text={current} />
            </span>
            <span aria-hidden="true" className="caret" />
          </p>
          {history.length > 0 && <ActivityHistory entries={history} />}
        </div>
      )}
    </div>
  );
}
