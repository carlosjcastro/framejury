export type Status = "keep" | "review" | "reject";
export type Eyes = "open" | "closed";
export type Mouth = "smile" | "open" | "flat";

export interface FrameSpec {
  code: string;
  sharp: number;
  blurX: number;
  blurY: number;
  eyes: Eyes;
  mouth: Mouth;
  tilt: number;
  shift: number;
  status: Status;
  reason: string;
}

export interface Palette {
  sky: string;
  floor: string;
  skin: string;
  skinShade: string;
  hair: string;
  cloth: string;
  bokeh: string[];
}

export interface Scene {
  id: string;
  range: string;
  winner: number;
  palette: Palette;
  frames: FrameSpec[];
}

export const STATUS_COLOR: Record<Status, string> = {
  keep: "var(--keep)",
  review: "var(--review)",
  reject: "var(--reject)",
};

export const STATUS_LABEL: Record<Status, string> = {
  keep: "Keep",
  review: "Review",
  reject: "Reject",
};

const EXPRESSION: Record<Mouth, { text: string; flagged: boolean }> = {
  smile: { text: "Natural expression", flagged: false },
  flat: { text: "Neutral expression", flagged: false },
  open: { text: "Awkward expression", flagged: true },
};

export interface Observation {
  text: string;
  flagged: boolean;
}

export function observe(frame: FrameSpec): Observation[] {
  return [
    { text: `${frame.sharp}% of the sharpest`, flagged: frame.sharp < 70 },
    {
      text: frame.eyes === "open" ? "Eyes open" : "Eyes closed",
      flagged: frame.eyes === "closed",
    },
    EXPRESSION[frame.mouth],
  ];
}

export const SCENES: Scene[] = [
  {
    id: "toast",
    range: "0412 to 0416",
    winner: 2,
    palette: {
      sky: "#3b2a1e",
      floor: "#1a1210",
      skin: "#e0ac8a",
      skinShade: "#c98f6e",
      hair: "#2a1a12",
      cloth: "#9f1239",
      bokeh: ["#fbbf24", "#fb7185", "#fde68a", "#f97316", "#fcd34d", "#fda4af"],
    },
    frames: [
      {
        code: "0412",
        sharp: 38,
        blurX: 2.4,
        blurY: 2.4,
        eyes: "open",
        mouth: "smile",
        tilt: -2,
        shift: -3,
        status: "reject",
        reason: "Soft focus, only 38% as sharp as 0414.",
      },
      {
        code: "0413",
        sharp: 91,
        blurX: 0.3,
        blurY: 0.3,
        eyes: "closed",
        mouth: "smile",
        tilt: 1,
        shift: 2,
        status: "reject",
        reason: "Eyes closed. Lower score than 0414.",
      },
      {
        code: "0414",
        sharp: 100,
        blurX: 0,
        blurY: 0,
        eyes: "open",
        mouth: "smile",
        tilt: 0,
        shift: 0,
        status: "keep",
        reason: "Sharpest of the burst, eyes open and a natural smile.",
      },
      {
        code: "0415",
        sharp: 96,
        blurX: 0.25,
        blurY: 0.25,
        eyes: "open",
        mouth: "smile",
        tilt: 2,
        shift: 3,
        status: "review",
        reason: "Almost tied with 0414, so a person should choose.",
      },
      {
        code: "0416",
        sharp: 42,
        blurX: 4.5,
        blurY: 0.4,
        eyes: "open",
        mouth: "flat",
        tilt: -3,
        shift: 5,
        status: "reject",
        reason: "Motion blur, only 42% as sharp as 0414.",
      },
    ],
  },
  {
    id: "dance",
    range: "0731 to 0735",
    winner: 4,
    palette: {
      sky: "#1b1b3a",
      floor: "#0c0c1a",
      skin: "#b9805c",
      skinShade: "#9c6444",
      hair: "#0f0f14",
      cloth: "#0e7490",
      bokeh: ["#818cf8", "#22d3ee", "#c084fc", "#38bdf8", "#f0abfc", "#67e8f9"],
    },
    frames: [
      {
        code: "0731",
        sharp: 33,
        blurX: 2.8,
        blurY: 2.8,
        eyes: "open",
        mouth: "smile",
        tilt: 2,
        shift: 4,
        status: "reject",
        reason: "Soft focus, only 33% as sharp as 0735.",
      },
      {
        code: "0732",
        sharp: 72,
        blurX: 0.5,
        blurY: 0.5,
        eyes: "open",
        mouth: "open",
        tilt: -2,
        shift: -2,
        status: "reject",
        reason: "Awkward expression mid word. Lower score than 0735.",
      },
      {
        code: "0733",
        sharp: 97,
        blurX: 0.2,
        blurY: 0.2,
        eyes: "open",
        mouth: "smile",
        tilt: 1,
        shift: -3,
        status: "review",
        reason: "Almost tied with 0735, so a person should choose.",
      },
      {
        code: "0734",
        sharp: 47,
        blurX: 4,
        blurY: 0.3,
        eyes: "open",
        mouth: "flat",
        tilt: -3,
        shift: 4,
        status: "reject",
        reason: "Motion blur, only 47% as sharp as 0735.",
      },
      {
        code: "0735",
        sharp: 100,
        blurX: 0,
        blurY: 0,
        eyes: "open",
        mouth: "smile",
        tilt: 0,
        shift: 0,
        status: "keep",
        reason: "Sharpest of the burst, eyes open and a relaxed expression.",
      },
    ],
  },
];
