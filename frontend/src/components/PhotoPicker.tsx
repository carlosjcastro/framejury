"use client";

import { useMemo, useState } from "react";
import { scanThumbUrl, type ScanResult } from "@/lib/api";

const PAGE = 120;

export function PhotoPicker({
  scan,
  selected,
  onSelected,
  compare,
  onCompare,
  shortlist,
  busy,
  onAnalyze,
  onClose,
}: {
  scan: ScanResult;
  selected: Set<string>;
  onSelected: (next: Set<string>) => void;
  compare: boolean;
  onCompare: (next: boolean) => void;
  shortlist: number;
  busy: boolean;
  onAnalyze: () => void;
  onClose: () => void;
}) {
  const [folder, setFolder] = useState("all");
  const [limit, setLimit] = useState(PAGE);

  const folders = useMemo(
    () => Array.from(new Set(scan.files.map((file) => file.folder))).sort(),
    [scan.files],
  );
  const visible = useMemo(
    () =>
      scan.files.filter((file) => folder === "all" || file.folder === folder),
    [scan.files, folder],
  );
  const shown = visible.slice(0, limit);
  const count = selected.size;
  const canRun = count > 0 && (!compare || count >= 2);

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onSelected(next);
  }

  function setMany(names: string[], on: boolean) {
    const next = new Set(selected);
    for (const name of names) {
      if (on) next.add(name);
      else next.delete(name);
    }
    onSelected(next);
  }

  return (
    <section aria-labelledby="picker-title" className="reveal mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="picker-title"
            className="text-xl font-semibold tracking-tight"
          >
            Choose photos
          </h2>
          <p className="mt-1 text-sm tabular-nums text-muted">
            {count} of {scan.total} selected
            {scan.truncated && ` · showing the first ${scan.files.length}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {folders.length > 1 && (
            <>
              <label htmlFor="picker-folder" className="sr-only">
                Show folder
              </label>
              <select
                id="picker-folder"
                value={folder}
                onChange={(e) => {
                  setFolder(e.target.value);
                  setLimit(PAGE);
                }}
                className="field !min-h-11 !w-auto font-mono"
              >
                <option value="all">All folders</option>
                {folders.map((name) => (
                  <option key={name} value={name}>
                    {name || "(top level)"}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setMany(
                visible.map((file) => file.name),
                true,
              )
            }
          >
            Select {folder === "all" ? "all" : "this folder"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setMany(
                visible.map((file) => file.name),
                false,
              )
            }
          >
            Clear
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-3">
        {shown.map((file) => {
          const on = selected.has(file.name);
          return (
            <li key={file.name}>
              <label
                className={`relative block cursor-pointer overflow-hidden rounded-md border-2 transition-colors ${
                  on
                    ? "border-accent"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(file.name)}
                  className="absolute left-2 top-2 z-10 size-5 accent-[var(--accent)]"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scanThumbUrl(scan.folder, file.name)}
                  alt=""
                  loading="lazy"
                  className="block aspect-[3/2] w-full bg-raised object-cover"
                />
                <span
                  className="block truncate bg-surface px-2 py-1 font-mono text-xs"
                  title={file.name}
                >
                  <span className="sr-only">
                    {on ? "Selected: " : "Not selected: "}
                  </span>
                  {file.name}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {visible.length > shown.length && (
        <button
          type="button"
          className="btn btn-secondary mt-6"
          onClick={() => setLimit(limit + PAGE)}
        >
          Show {Math.min(PAGE, visible.length - shown.length)} more
        </button>
      )}

      <div className="sticky bottom-0 mt-8 border-t border-line bg-canvas/95 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex min-h-11 max-w-xl items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => onCompare(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">
                Compare the selected photos as one group
              </span>
              <span className="block text-muted">
                Skips automatic grouping. The sharpest {shortlist} are compared,
                the rest are marked as softer.
              </span>
            </span>
          </label>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!canRun || busy}
            className="btn btn-primary btn-lg"
          >
            {busy
              ? "Starting…"
              : `Analyze ${count} ${count === 1 ? "photo" : "photos"}`}
          </button>
        </div>
        {compare && count < 2 && count > 0 && (
          <p role="status" className="mt-2 text-sm text-review">
            Select at least two photos to compare.
          </p>
        )}
      </div>
    </section>
  );
}
