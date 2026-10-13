import type { Status } from "@/lib/api";

export const LABEL: Record<Status, string> = {
  keep: "Keep",
  reject: "Reject",
  review: "Review",
};

export const TEXT: Record<Status, string> = {
  keep: "text-keep",
  reject: "text-reject",
  review: "text-review",
};

export const FILL: Record<Status, string> = {
  keep: "bg-keep text-[#052e1f]",
  reject: "bg-reject text-[#3b0a0a]",
  review: "bg-review text-[#3a2600]",
};

export function StatusIcon({ status }: { status: Status }) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 16 16",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (status === "keep") {
    return (
      <svg {...common}>
        <path d="M3 8.5l3.2 3.2L13 4.8" />
      </svg>
    );
  }
  if (status === "reject") {
    return (
      <svg {...common}>
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.5M8 11h.01" />
    </svg>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold print:border print:border-black print:bg-white print:text-black ${FILL[status]}`}
    >
      <StatusIcon status={status} />
      {LABEL[status]}
    </span>
  );
}
