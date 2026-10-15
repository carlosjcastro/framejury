"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Typed } from "@/components/Typed";
import { usePageHidden, useReducedMotion } from "@/lib/useMotion";
import { FrameArt } from "./FrameArt";
import {
  SCENES,
  STATUS_COLOR,
  STATUS_LABEL,
  observe,
  type FrameSpec,
  type Scene,
} from "./scenes";

const STEP_MS = [900, 900, 900, 900, 900, 900, 1400, 2400, 3200];
const DECIDE_STEP = 6;
const REASON_STEP = 7;
const LAST_STEP = STEP_MS.length - 1;
const TYPING_MS = 24;

const CORNERS = [
  "left-0 top-0 border-l-2 border-t-2",
  "right-0 top-0 border-r-2 border-t-2",
  "bottom-0 left-0 border-b-2 border-l-2",
  "bottom-0 right-0 border-b-2 border-r-2",
];

interface Cursor {
  scene: number;
  step: number;
  manual: number | null;
}

const START: Cursor = { scene: 0, step: 0, manual: null };

function advance(cursor: Cursor): Cursor {
  if (cursor.step < LAST_STEP) return { ...cursor, step: cursor.step + 1 };
  return { scene: (cursor.scene + 1) % SCENES.length, step: 0, manual: null };
}

function FaceBrackets() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-[35%] top-[22%] h-[50%] w-[30%]"
    >
      {CORNERS.map((position) => (
        <i
          key={position}
          className={`absolute size-3 ${position}`}
          style={{ borderColor: "var(--tone)" }}
        />
      ))}
    </span>
  );
}

function Observations({ frame }: { frame: FrameSpec }) {
  return (
    <ul className="absolute inset-x-2 bottom-2 flex flex-wrap gap-1 font-mono text-[10px] sm:gap-1.5 sm:text-[11px]">
      {observe(frame).map((item, index) => (
        <li
          key={item.text}
          className={`fade-in rounded-md border border-line bg-canvas/85 px-1.5 py-0.5 sm:px-2 sm:py-1 ${
            item.flagged ? "text-review" : "text-ink"
          }`}
          style={{ animationDelay: `${index * 90}ms` }}
        >
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function Stamp({ status, on }: { status: FrameSpec["status"]; on: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-on={on}
      className="stamp absolute right-3 top-3 rounded-md border-2 bg-canvas/70 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.18em]"
      style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Viewer({
  scene,
  index,
  measured,
  decided,
}: {
  scene: Scene;
  index: number;
  measured: boolean;
  decided: boolean;
}) {
  const frame = scene.frames[index];
  const key = `${scene.id}-${index}`;

  return (
    <div className="relative aspect-[3/2] overflow-hidden rounded-xl border border-line bg-canvas">
      <div key={`${key}-art`} className="frame-in absolute inset-0">
        <FrameArt frame={frame} palette={scene.palette} />
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgba(0,0,0,0.45))]"
      />
      {measured && <FaceBrackets />}
      {measured && !decided && <span aria-hidden="true" className="scanline" />}
      {measured && <Observations key={`${key}-notes`} frame={frame} />}
      <Stamp status={frame.status} on={decided} />
    </div>
  );
}

function Grease({ on }: { on: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 70"
      preserveAspectRatio="none"
      data-on={on}
      className="grease pointer-events-none absolute -left-2 -top-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] overflow-visible"
    >
      <path
        pathLength={1}
        d="M9 38 C5 14 38 4 62 6 C90 9 99 30 91 51 C82 70 30 69 14 55 C6 47 7 33 14 24"
        fill="none"
        stroke="var(--keep)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ThumbProps {
  scene: Scene;
  index: number;
  current: number;
  step: number;
  decided: boolean;
  onInspect: (index: number) => void;
}

function Thumb({
  scene,
  index,
  current,
  step,
  decided,
  onInspect,
}: ThumbProps) {
  const frame = scene.frames[index];
  const measured = decided || step >= index + 1;
  const viewed = index === current;
  const ring = decided
    ? STATUS_COLOR[frame.status]
    : viewed && step >= 1
      ? "var(--accent)"
      : "var(--line)";
  const label = decided
    ? `Frame ${frame.code}, ${STATUS_LABEL[frame.status]}. Show the reason.`
    : `Frame ${frame.code}. Show the reason.`;

  return (
    <li className="reveal" style={{ animationDelay: `${index * 70}ms` }}>
      <button
        type="button"
        onClick={() => onInspect(index)}
        aria-pressed={decided && viewed}
        aria-label={label}
        className="block w-full text-left"
      >
        <span className="relative block">
          <span
            className="block aspect-[3/2] overflow-hidden rounded-md border-2 transition-[border-color,transform] duration-500"
            style={{
              borderColor: ring,
              transform: decided && viewed ? "scale(1.05)" : "none",
            }}
          >
            <FrameArt frame={frame} palette={scene.palette} />
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-canvas transition-opacity duration-500"
              style={{
                opacity: decided && frame.status === "reject" ? 0.55 : 0,
              }}
            />
          </span>
          <Grease on={decided && index === scene.winner} />
        </span>
        <span className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-muted">
          <span>{frame.code}</span>
          {decided && (
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ background: STATUS_COLOR[frame.status] }}
            />
          )}
        </span>
        <span
          aria-hidden="true"
          className="mt-1 block h-[3px] overflow-hidden rounded-full bg-overlay"
        >
          <span
            className="block h-full origin-left rounded-full bg-accent transition-transform duration-700 ease-out"
            style={{ transform: `scaleX(${measured ? frame.sharp / 100 : 0})` }}
          />
        </span>
      </button>
    </li>
  );
}

function PauseButton({
  paused,
  onToggle,
}: {
  paused: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={paused}
      aria-label="Pause animation"
      className="grid size-8 place-items-center rounded-md text-muted hover:bg-overlay hover:text-ink"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        width="14"
        height="14"
        fill="currentColor"
      >
        {paused ? (
          <path d="M6 4l10 6-10 6z" />
        ) : (
          <path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" />
        )}
      </svg>
    </button>
  );
}

export function ContactStrip({ still = false }: { still?: boolean }) {
  const reduced = useReducedMotion();
  const hidden = usePageHidden();
  const [cursor, setCursor] = useState<Cursor>(START);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  const settled = still || reduced;
  const halted = settled || hovered || focused || userPaused || hidden;

  useEffect(() => {
    if (halted) return;
    const timer = setTimeout(() => setCursor(advance), STEP_MS[cursor.step]);
    return () => clearTimeout(timer);
  }, [halted, cursor]);

  const scene = SCENES[cursor.scene];
  const step = settled ? REASON_STEP : cursor.step;
  const decided = step >= DECIDE_STEP;
  const showReason = step >= REASON_STEP;
  const measured = step >= 1 || decided;
  const current =
    cursor.manual ?? (decided ? scene.winner : Math.max(step - 1, 0));
  const frame = scene.frames[current];
  const tone = decided ? STATUS_COLOR[frame.status] : "var(--accent)";
  const status =
    cursor.manual !== null ? "Inspecting" : decided ? "Decided" : "Measuring";

  function inspect(index: number) {
    setCursor((value) => ({ ...value, step: REASON_STEP, manual: index }));
  }

  return (
    <div
      role="group"
      aria-label="Animated example of Framejury choosing the best photo of a burst"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      style={{ "--tone": tone } as CSSProperties}
      className="tone-card relative overflow-hidden rounded-2xl border border-line bg-[linear-gradient(180deg,var(--raised),var(--surface))] p-4 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.95)] sm:p-5"
    >
      <span
        aria-hidden="true"
        className="tone-glow pointer-events-none absolute inset-0"
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${decided ? "" : "pulse-dot"}`}
              style={{ background: "var(--tone)" }}
            />
            <span className="truncate">
              Example burst, frames {scene.range}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <span
              className="font-mono text-xs"
              style={{ color: "var(--tone)" }}
            >
              {status}
            </span>
            {!settled && (
              <PauseButton
                paused={userPaused}
                onToggle={() => setUserPaused((value) => !value)}
              />
            )}
          </div>
        </div>

        <div className="mt-3">
          <Viewer
            scene={scene}
            index={current}
            measured={measured}
            decided={decided}
          />
        </div>

        <div aria-hidden="true" className="film-edge mt-4" />
        <ul key={scene.id} className="mt-3 grid grid-cols-5 gap-2.5">
          {scene.frames.map((_, index) => (
            <Thumb
              key={index}
              scene={scene}
              index={index}
              current={current}
              step={step}
              decided={decided}
              onInspect={inspect}
            />
          ))}
        </ul>
        <div aria-hidden="true" className="film-edge mt-3" />

        <p
          className="mt-4 min-h-[3rem] border-l-2 pl-3 font-mono text-[13px] leading-snug"
          style={{ borderColor: "var(--tone)" }}
        >
          {showReason && (
            <>
              <span className="text-ink">{frame.code}</span>{" "}
              <span className="text-muted">
                <Typed
                  key={`${scene.id}-${current}`}
                  text={frame.reason}
                  interval={TYPING_MS}
                />
              </span>
              {!settled && <span aria-hidden="true" className="caret" />}
            </>
          )}
        </p>
      </div>

      <p className="sr-only">
        Example of a burst of five photos. Framejury keeps the sharpest one with
        open eyes, sends the close call to review, rejects the soft, blinking
        and blurred frames, and writes a reason for each. Select a frame to read
        its reason.
      </p>
    </div>
  );
}
