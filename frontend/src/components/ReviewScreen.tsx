"use client";

import { useMemo, useState } from "react";
import { DebriefPanel } from "@/components/DebriefPanel";
import { ExportPanel } from "@/components/ExportPanel";
import { GroupCard } from "@/components/GroupCard";
import { ImpactStrip } from "@/components/ImpactStrip";
import { ProblemNotice } from "@/components/ProblemNotice";
import { ReportNotices } from "@/components/ReportNotices";
import { LABEL, StatusIcon } from "@/components/StatusChip";
import {
  setManyStatus,
  setStatus,
  type Job,
  type Report,
  type Status,
} from "@/lib/api";
import type { Problem } from "@/lib/problems";
import { mapPhotos, STATUSES, withStatus } from "@/lib/report";

type Filter = "all" | Status;

interface ReviewScreenProps {
  job: Job;
  report: Report;
  error: Problem | null;
  onDismissError: () => void;
  onError: (error: unknown) => void;
  onReportChange: (update: (report: Report) => Report) => void;
  onReset: () => void;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  ...STATUSES.map((status) => ({ key: status, label: LABEL[status] })),
];

const PRINT_SETTLE_MS = 80;

function waitForImages(): Promise<unknown[]> {
  const pending = Array.from(document.querySelectorAll("img")).filter(
    (img) => !img.complete,
  );
  return Promise.all(
    pending.map(
      (img) =>
        new Promise((resolve) => {
          img.onload = img.onerror = () => resolve(null);
        }),
    ),
  );
}

function describeSettings(options: NonNullable<Report["options"]>): string {
  return [
    `Looked at ${options.criteria.join(", ")}.`,
    options.selected_only && "Only the photos you chose.",
    options.compared_selection && "Compared as one group.",
    options.recursive && "Included subfolders.",
    `File types: ${options.kinds.join(", ")}.`,
    options.exclude.length > 0 && `Skipped: ${options.exclude.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function FilterBar({
  filter,
  count,
  onChange,
}: {
  filter: Filter;
  count: (key: Filter) => number;
  onChange: (key: Filter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by decision"
      className="mt-8 flex flex-wrap gap-2 print:hidden"
    >
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={filter === key}
          onClick={() => onChange(key)}
          className={`btn ${filter === key ? "btn-primary" : "btn-secondary"}`}
        >
          {label}
          <span className="tabular-nums opacity-80">{count(key)}</span>
        </button>
      ))}
    </div>
  );
}

function BulkBar({
  count,
  onChange,
  onClear,
}: {
  count: number;
  onChange: (status: Status) => void;
  onClear: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-4 mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-overlay px-4 py-3 print:hidden"
    >
      <p className="mr-auto text-sm tabular-nums">{count} selected</p>
      {STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className="btn btn-secondary"
        >
          <StatusIcon status={status} />
          {LABEL[status]}
        </button>
      ))}
      <button type="button" onClick={onClear} className="btn btn-secondary">
        Clear
      </button>
    </div>
  );
}

export function ReviewScreen({
  job,
  report,
  error,
  onDismissError,
  onError,
  onReportChange,
  onReset,
}: ReviewScreenProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [eager, setEager] = useState(false);

  const { stats, options } = report;
  const groups = useMemo(
    () =>
      report.groups.filter(
        (group) =>
          filter === "all" ||
          group.photos.some((photo) => photo.status === filter),
      ),
    [report.groups, filter],
  );

  function togglePicked(name: string) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  async function changeStatus(name: string, status: Status) {
    onDismissError();
    try {
      const updated = await setStatus(job.id, name, status);
      onReportChange((current) =>
        mapPhotos(current, (photo) => (photo.name === name ? updated : photo)),
      );
    } catch (e) {
      onError(e);
    }
  }

  async function changeMany(status: Status) {
    if (picked.size === 0) return;
    const names = picked;
    onDismissError();
    try {
      await setManyStatus(job.id, Array.from(names), status);
      onReportChange((current) =>
        mapPhotos(current, (photo) =>
          names.has(photo.name) ? withStatus(photo, status) : photo,
        ),
      );
      setPicked(new Set());
    } catch (e) {
      onError(e);
    }
  }

  async function exportPdf() {
    setEager(true);
    document
      .querySelectorAll("details")
      .forEach((details) => (details.open = true));
    await new Promise((resolve) => setTimeout(resolve, PRINT_SETTLE_MS));
    await waitForImages();
    window.print();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 print:py-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="hidden print:inline">Framejury report · </span>
            Review
          </h1>
          <p className="mt-1 break-all font-mono text-sm text-muted">
            {report.folder}
          </p>
          <p className="mt-1 text-sm tabular-nums text-muted">
            {stats.photos} photos in {stats.groups} groups · {stats.keep} keep ·{" "}
            {stats.review} review · {stats.reject} reject · analyzed in{" "}
            {stats.total_seconds} s
            {report.model ? ` · ${report.model}` : " · metrics only"}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={exportPdf}
            className="btn btn-secondary"
          >
            Export PDF
          </button>
          <button type="button" onClick={onReset} className="btn btn-secondary">
            New analysis
          </button>
        </div>
      </div>

      {options && (
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer underline-offset-4 hover:underline print:hidden">
            Settings used
          </summary>
          <p className="mt-2 max-w-3xl">{describeSettings(options)}</p>
        </details>
      )}

      {error && (
        <ProblemNotice
          problem={error}
          className="mt-6"
          onDismiss={onDismissError}
        />
      )}

      <ReportNotices report={report} />
      <ImpactStrip report={report} />
      <ExportPanel jobId={job.id} />

      <FilterBar
        filter={filter}
        count={(key) => (key === "all" ? stats.photos : stats[key])}
        onChange={setFilter}
      />

      <div className="mt-10 space-y-10">
        {groups.map((group, index) => (
          <GroupCard
            key={group.id}
            jobId={job.id}
            group={group}
            index={index}
            eager={eager}
            onChange={changeStatus}
            picked={picked}
            onPick={togglePicked}
          />
        ))}
        {groups.length === 0 && (
          <p className="text-muted">No photos match this filter.</p>
        )}
      </div>

      <DebriefPanel jobId={job.id} saved={job.summary} model={report.model} />

      {picked.size > 0 && (
        <BulkBar
          count={picked.size}
          onChange={changeMany}
          onClear={() => setPicked(new Set())}
        />
      )}
    </main>
  );
}
