"use client";

import { useState } from "react";
import type { Report } from "@/lib/api";

function formatDuration(seconds: number) {
  const s = Math.round(Math.abs(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m >= 120) return `${Math.floor(m / 60)} h ${m % 60} min`;
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

export function ImpactStrip({ report }: { report: Report }) {
  const [perPhoto, setPerPhoto] = useState(4);

  const attention = new Set<string>();
  for (const group of report.groups) {
    for (const photo of group.photos) {
      if (group.needs_review || photo.status === "review")
        attention.add(photo.name);
    }
  }
  const total = report.stats.photos;
  const decided = total - attention.size;
  const manual = total * perPhoto;
  const withTool = report.stats.total_seconds + attention.size * perPhoto;
  const saved = manual - withTool;

  return (
    <section
      aria-labelledby="impact"
      className="mt-8 border-t border-line pt-6"
    >
      <h2 id="impact" className="sr-only">
        Impact of this analysis
      </h2>
      <dl className="grid gap-6 sm:grid-cols-3">
        <div>
          <dd className="text-3xl font-semibold tabular-nums tracking-tight">
            {decided}
            <span className="text-lg text-muted"> of {total}</span>
          </dd>
          <dt className="mt-1 text-sm text-muted">
            photos decided without needing you
          </dt>
        </div>
        <div>
          <dd className="text-3xl font-semibold tabular-nums tracking-tight">
            {attention.size}
          </dd>
          <dt className="mt-1 text-sm text-muted">
            photos that deserve a look from you
          </dt>
        </div>
        <div>
          <dd className="text-3xl font-semibold tabular-nums tracking-tight">
            {saved > 0 ? `≈ ${formatDuration(saved)}` : "None yet"}
          </dd>
          <dt className="mt-1 text-sm text-muted">
            {saved > 0 ? "estimated time saved" : "saved on a set this small"}
          </dt>
        </div>
      </dl>
      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <label htmlFor="per-photo">Estimate assumes culling by hand at</label>
        <input
          id="per-photo"
          type="number"
          min={1}
          max={30}
          value={perPhoto}
          onChange={(e) =>
            setPerPhoto(Math.min(30, Math.max(1, Number(e.target.value) || 1)))
          }
          className="field !min-h-9 !w-16 !px-2 text-center print:hidden"
        />
        <span className="hidden print:inline">{perPhoto}</span>
        <span>seconds per photo, plus the analysis time.</span>
      </p>
    </section>
  );
}
