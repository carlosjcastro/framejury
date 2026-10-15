import { useId } from "react";
import type { FrameSpec, Palette } from "./scenes";

const BOKEH = [
  { x: 30, y: 35, r: 16 },
  { x: 200, y: 28, r: 22 },
  { x: 215, y: 100, r: 14 },
  { x: 18, y: 110, r: 20 },
  { x: 172, y: 62, r: 10 },
  { x: 70, y: 18, r: 9 },
];

const INK = "#241a17";

function Eyes({ open }: { open: boolean }) {
  return (
    <>
      {[108, 132].map((cx) =>
        open ? (
          <g key={cx}>
            <ellipse cx={cx} cy="78" rx="4.6" ry="3.2" fill="#fff" />
            <circle cx={cx} cy="78" r="2" fill={INK} />
          </g>
        ) : (
          <path
            key={cx}
            d={`M${cx - 4.5} 78 Q${cx} 82 ${cx + 4.5} 78`}
            fill="none"
            stroke={INK}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        ),
      )}
    </>
  );
}

function Mouth({ kind }: { kind: FrameSpec["mouth"] }) {
  if (kind === "open") {
    return (
      <ellipse
        cx="120"
        cy="97"
        rx="7"
        ry="5.5"
        fill="#6b2430"
        transform="rotate(-8 120 97)"
      />
    );
  }
  if (kind === "flat") {
    return (
      <path
        d="M111 97 H129"
        stroke="#8a3b3b"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    );
  }
  return (
    <path
      d="M108 95 Q120 106 132 95"
      fill="none"
      stroke="#8a3b3b"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  );
}

interface FrameArtProps {
  frame: FrameSpec;
  palette: Palette;
}

export function FrameArt({ frame, palette }: FrameArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const sky = `${uid}sky`;
  const subject = `${uid}subject`;
  const bokeh = `${uid}bokeh`;
  const blurred = frame.blurX > 0 || frame.blurY > 0;

  return (
    <svg
      viewBox="0 0 240 160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="block size-full"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.sky} />
          <stop offset="1" stopColor={palette.floor} />
        </linearGradient>
        <filter id={bokeh} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id={subject} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation={`${frame.blurX} ${frame.blurY}`} />
        </filter>
      </defs>

      <rect width="240" height="160" fill={`url(#${sky})`} />

      <g filter={`url(#${bokeh})`} opacity="0.7">
        {palette.bokeh.map((color, index) => (
          <circle
            key={color}
            cx={BOKEH[index].x}
            cy={BOKEH[index].y}
            r={BOKEH[index].r}
            fill={color}
          />
        ))}
      </g>

      <g
        filter={blurred ? `url(#${subject})` : undefined}
        transform={`translate(${frame.shift} 0) rotate(${frame.tilt} 120 110)`}
      >
        <path
          d="M56 160 C58 124 88 112 120 112 C152 112 182 124 184 160 Z"
          fill={palette.cloth}
        />
        <rect
          x="110"
          y="98"
          width="20"
          height="20"
          rx="7"
          fill={palette.skinShade}
        />
        <circle cx="93" cy="80" r="4.5" fill={palette.skinShade} />
        <circle cx="147" cy="80" r="4.5" fill={palette.skinShade} />
        <ellipse cx="120" cy="76" rx="27" ry="32" fill={palette.skin} />
        <path
          d="M91 74 C88 38 152 36 149 74 C143 55 97 55 91 74 Z"
          fill={palette.hair}
        />
        <Eyes open={frame.eyes === "open"} />
        <path
          d="M101 70 Q108 66 115 70 M125 70 Q132 66 139 70"
          fill="none"
          stroke={palette.hair}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M120 80 Q117 88 121 90"
          fill="none"
          stroke={palette.skinShade}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <Mouth kind={frame.mouth} />
      </g>
    </svg>
  );
}
