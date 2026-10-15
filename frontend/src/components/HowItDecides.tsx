import type { ReactNode } from "react";

interface Step {
  title: string;
  tag: string;
  usesModel: boolean;
  text: string;
  art: ReactNode;
}

const FRAME = "var(--control)";
const TRACK = "var(--overlay)";

function MeasureArt() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 80"
      className="h-full w-full"
      fill="none"
    >
      <rect
        x="8"
        y="8"
        width="64"
        height="64"
        rx="8"
        stroke={FRAME}
        strokeWidth="2"
      />
      <path
        d="M16 58l16-18 12 12 10-8 10 14"
        stroke={FRAME}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="56" cy="24" r="5" stroke={FRAME} strokeWidth="2" />
      {[
        { y: 16, width: 66 },
        { y: 37, width: 50 },
        { y: 58, width: 36 },
      ].map((bar) => (
        <g key={bar.y}>
          <rect x="88" y={bar.y} width="66" height="7" rx="3.5" fill={TRACK} />
          <rect
            x="88"
            y={bar.y}
            width={bar.width}
            height="7"
            rx="3.5"
            fill="var(--accent)"
          />
        </g>
      ))}
    </svg>
  );
}

function GroupArt() {
  const tiles = [
    { x: 14, y: 14 },
    { x: 40, y: 22 },
    { x: 26, y: 40 },
    { x: 112, y: 12 },
    { x: 118, y: 46 },
  ];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 80"
      className="h-full w-full"
      fill="none"
    >
      <rect
        x="6"
        y="6"
        width="76"
        height="68"
        rx="10"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeDasharray="5 5"
      />
      {tiles.map((tile, index) => (
        <rect
          key={tile.x}
          x={tile.x}
          y={tile.y}
          width="30"
          height="20"
          rx="4"
          fill="var(--raised)"
          stroke={index < 3 ? "var(--accent)" : FRAME}
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

function ObserveArt() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 80"
      className="h-full w-full"
      fill="none"
    >
      <path
        d="M14 22V10h12M62 10h12v12M74 58v12H62M26 70H14V58"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="40" r="15" stroke={FRAME} strokeWidth="2" />
      <circle cx="39" cy="37" r="2" fill={FRAME} />
      <circle cx="49" cy="37" r="2" fill={FRAME} />
      <path
        d="M38 46q6 5 12 0"
        stroke={FRAME}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {[
        { y: 14, width: 46 },
        { y: 34, width: 56 },
        { y: 54, width: 38 },
      ].map((chip) => (
        <rect
          key={chip.y}
          x="92"
          y={chip.y}
          width={chip.width}
          height="14"
          rx="7"
          stroke={FRAME}
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

function DecideArt() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 80"
      className="h-full w-full"
      fill="none"
    >
      <g transform="rotate(-6 40 40)">
        <rect
          x="10"
          y="22"
          width="62"
          height="36"
          rx="7"
          stroke="var(--keep)"
          strokeWidth="2.5"
        />
        <path
          d="M28 41l8 8 16-17"
          stroke="var(--keep)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {[
        { y: 22, width: 62 },
        { y: 40, width: 48 },
        { y: 58, width: 56 },
      ].map((line) => (
        <rect
          key={line.y}
          x="92"
          y={line.y - 3}
          width={line.width}
          height="6"
          rx="3"
          fill={TRACK}
        />
      ))}
    </svg>
  );
}

const STEPS: Step[] = [
  {
    title: "Measure",
    tag: "No model",
    usesModel: false,
    text: "Sharpness, exposure and capture time are computed for every photo with ordinary image analysis, all on your machine.",
    art: <MeasureArt />,
  },
  {
    title: "Group",
    tag: "No model",
    usesModel: false,
    text: "Photos taken seconds apart that also look alike become one group, so you always compare a shot with its true alternatives.",
    art: <GroupArt />,
  },
  {
    title: "Observe",
    tag: "Gemma 4, local",
    usesModel: true,
    text: "A local vision model looks at the best candidates of each group twice, in a different order, and reports eyes, focus and expression.",
    art: <ObserveArt />,
  },
  {
    title: "Decide",
    tag: "Plain rules",
    usesModel: false,
    text: "Readable rules turn the measurements and the observations into Keep, Review or Reject, and write the reason in a sentence.",
    art: <DecideArt />,
  },
];

export function HowItDecides() {
  return (
    <section aria-labelledby="how" className="mt-24 border-t border-line pt-16">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        How it decides
      </p>
      <h2
        id="how"
        className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl"
      >
        The model observes. Plain rules decide.
      </h2>
      <p className="mt-4 max-w-2xl text-muted">
        Only one of the four steps uses a language model, and it never makes the
        final call, so every decision can be traced back to a measurement that
        you can check.
      </p>

      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="relative flex flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-control"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs tabular-nums text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                  step.usesModel
                    ? "border-accent text-accent"
                    : "border-line text-muted"
                }`}
              >
                {step.tag}
              </span>
            </div>
            <div className="mt-6 h-20">{step.art}</div>
            <h3 className="mt-6 text-lg font-semibold tracking-tight">
              {step.title}
            </h3>
            <p className="mt-2 text-sm text-muted">{step.text}</p>
          </li>
        ))}
      </ol>

      <p className="mt-6 flex items-start gap-3  p-4 text-sm text-muted">
        <span
          aria-hidden="true"
          className="mt-1.5 size-2 shrink-0 rounded-full bg-review"
        />
        <span>
          Close calls are never decided silently. They are marked for review so
          that a person makes the final choice.
        </span>
      </p>
    </section>
  );
}
