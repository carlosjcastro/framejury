"use client";

import { useEffect, useState } from "react";
import { AdvancedOptions } from "@/components/AdvancedOptions";
import { ExportPanel } from "@/components/ExportPanel";
import { GroupCard } from "@/components/GroupCard";
import { ImpactStrip } from "@/components/ImpactStrip";
import { PhotoPicker } from "@/components/PhotoPicker";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { StatusIcon } from "@/components/StatusChip";
import { DebriefPanel } from "@/components/DebriefPanel";
import {
  createJob,
  getConfig,
  getJob,
  scanFolder,
  setManyStatus,
  setStatus,
  type ConfigInfo,
  type Job,
  type Lang,
  type Options,
  type Report,
  type ScanResult,
  type Status,
} from "@/lib/api";

type Filter = "all" | Status;

const STEPS = [
  {
    title: "Measure",
    text: "Sharpness, exposure and capture time for every photo, computed on your machine.",
  },
  {
    title: "Group",
    text: "Near-identical shots taken seconds apart become one group, so you compare like with like.",
  },
  {
    title: "Judge",
    text: "A local Gemma model checks eyes, focus and expression. Plain rules make the call and give the reason.",
  },
];

function recount(report: Report): Report {
  const counts = { keep: 0, reject: 0, review: 0 };
  for (const group of report.groups) {
    for (const photo of group.photos) counts[photo.status] += 1;
  }
  return { ...report, stats: { ...report.stats, ...counts } };
}

function scanKey(options: Options) {
  return JSON.stringify([
    options.recursive,
    [...options.kinds].sort(),
    options.exclude,
  ]);
}

export default function Home() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [vision, setVision] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [eager, setEager] = useState(false);

  const jobId = job?.id;
  const running = job?.status === "running";
  const report = job?.status === "done" ? job.report : undefined;

  useEffect(() => {
    getConfig()
      .then((info) => {
        setConfig(info);
        setOptions(info.defaults);
      })
      .catch((e) =>
        setError(`Cannot reach the Framejury API. ${(e as Error).message}`),
      );
  }, []);

  useEffect(() => {
    if (!jobId || !running) return;
    const timer = setInterval(async () => {
      try {
        setJob(await getJob(jobId));
      } catch (e) {
        setError((e as Error).message);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [jobId, running]);

  function updateOptions(next: Options) {
    if (options && scan && scanKey(next) !== scanKey(options)) setScan(null);
    setOptions(next);
  }

  async function launch(files?: string[], compareSelected = false) {
    if (!options) return;
    setError(null);
    setJob(null);
    setFilter("all");
    setPicked(new Set());
    setBusy(true);
    try {
      const { id } = await createJob({
        folder: folder.trim(),
        lang,
        vision,
        options,
        files,
        compare_selected: compareSelected,
      });
      setScan(null);
      setJob(await getJob(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function start(event: React.FormEvent) {
    event.preventDefault();
    void launch();
  }

  async function choosePhotos() {
    if (!options || !folder.trim()) {
      setError("Type a folder first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await scanFolder(folder.trim(), options);
      if (result.total === 0) {
        setError("No photos found with these options.");
        return;
      }
      setScan(result);
      setSelected(new Set(result.files.map((file) => file.name)));
      setCompare(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function analyzeSelection() {
    if (!scan) return;
    const all = selected.size === scan.total && !compare;
    void launch(all ? undefined : Array.from(selected), compare);
  }

  function reset() {
    setJob(null);
    setError(null);
    setFilter("all");
    setPicked(new Set());
  }

  function pick(name: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function changeMany(status: Status) {
    if (!job || picked.size === 0) return;
    const names = Array.from(picked);
    setError(null);
    try {
      await setManyStatus(job.id, names, status);
      setJob((prev) => {
        if (!prev || !prev.report) return prev;
        const groups = prev.report.groups.map((g) => ({
          ...g,
          photos: g.photos.map((p) => {
            if (!picked.has(p.name)) return p;
            const auto = p.auto_status ?? p.status;
            return { ...p, status, auto_status: auto, manual: status !== auto };
          }),
        }));
        return { ...prev, report: recount({ ...prev.report, groups }) };
      });
      setPicked(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function changeStatus(name: string, status: Status) {
    if (!job) return;
    setError(null);
    try {
      const updated = await setStatus(job.id, name, status);
      setJob((prev) => {
        if (!prev || !prev.report) return prev;
        const groups = prev.report.groups.map((g) => ({
          ...g,
          photos: g.photos.map((p) => (p.name === name ? updated : p)),
        }));
        return { ...prev, report: recount({ ...prev.report, groups }) };
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function exportPdf() {
    setEager(true);
    document.querySelectorAll("details").forEach((d) => (d.open = true));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const images = Array.from(document.querySelectorAll("img"));
    await Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = img.onerror = () => resolve(null);
            }),
      ),
    );
    window.print();
  }

  if (report && job) {
    const stats = report.stats;
    const filterOptions: { key: Filter; label: string; count: number }[] = [
      { key: "all", label: "All", count: stats.photos },
      { key: "keep", label: "Keep", count: stats.keep },
      { key: "review", label: "Review", count: stats.review },
      { key: "reject", label: "Reject", count: stats.reject },
    ];
    const groups = report.groups.filter(
      (g) => filter === "all" || g.photos.some((p) => p.status === filter),
    );

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
              {stats.photos} photos in {stats.groups} groups · {stats.keep} keep
              · {stats.review} review · {stats.reject} reject · analyzed in{" "}
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
            <button type="button" onClick={reset} className="btn btn-secondary">
              New analysis
            </button>
          </div>
        </div>

        {report.options && (
          <details className="mt-3 text-sm text-muted">
            <summary className="cursor-pointer underline-offset-4 hover:underline print:hidden">
              Settings used
            </summary>
            <p className="mt-2 max-w-3xl">
              Looked at {report.options.criteria.join(", ")}.{" "}
              {report.options.selected_only
                ? "Only the photos you chose. "
                : ""}
              {report.options.compared_selection
                ? "Compared as one group. "
                : ""}
              {report.options.recursive ? "Included subfolders. " : ""}
              File types: {report.options.kinds.join(", ")}.
              {report.options.exclude.length > 0 &&
                ` Skipped: ${report.options.exclude.join(", ")}.`}
            </p>
          </details>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 flex items-center gap-2 rounded-lg border border-reject px-4 py-3 text-sm text-reject print:hidden"
          >
            <StatusIcon status="reject" />
            {error}
          </p>
        )}

        <ImpactStrip report={report} />
        <ExportPanel jobId={job.id} />

        <div
          role="group"
          aria-label="Filter by decision"
          className="mt-8 flex flex-wrap gap-2 print:hidden"
        >
          {filterOptions.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={filter === o.key}
              onClick={() => setFilter(o.key)}
              className={`btn ${filter === o.key ? "btn-primary" : "btn-secondary"}`}
            >
              {o.label}
              <span className="tabular-nums opacity-80">{o.count}</span>
            </button>
          ))}
        </div>

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
              onPick={pick}
            />
          ))}
          {groups.length === 0 && (
            <p className="text-muted">No photos match this filter.</p>
          )}
        </div>

        <DebriefPanel jobId={job.id} saved={job.summary} model={report.model} />

        {picked.size > 0 && (
          <div
            role="region"
            aria-label="Bulk actions"
            className="sticky bottom-4 mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-overlay px-4 py-3 print:hidden"
          >
            <p className="mr-auto text-sm tabular-nums">
              {picked.size} selected
            </p>
            {(["keep", "review", "reject"] as Status[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => changeMany(status)}
                className="btn btn-secondary"
              >
                <StatusIcon status={status} />
                {status === "keep"
                  ? "Keep"
                  : status === "review"
                    ? "Review"
                    : "Reject"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="btn btn-secondary"
            >
              Clear
            </button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(61,214,245,0.14),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
        <h1 className="reveal max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-6xl">
          Cull event photos in minutes. Locally.
        </h1>
        <p
          className="reveal mt-5 max-w-xl text-lg text-muted"
          style={{ animationDelay: "90ms" }}
        >
          Framejury finds the best shot of every burst and tells you why. Your
          photos never leave your computer.
        </p>

        <form
          onSubmit={start}
          className="reveal mt-10 max-w-3xl"
          style={{ animationDelay: "180ms" }}
        >
          <label htmlFor="folder" className="block text-sm font-medium">
            Photo folder
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="C:\photos\wedding"
              required
              autoComplete="off"
              spellCheck={false}
              aria-describedby="folder-help"
              className="field font-mono"
            />
            <button
              type="submit"
              disabled={busy || running || !options}
              className="btn btn-primary btn-lg shrink-0"
            >
              {running ? "Analyzing…" : "Analyze folder"}
            </button>
            <button
              type="button"
              onClick={choosePhotos}
              disabled={busy || running || !options}
              className="btn btn-secondary btn-lg shrink-0"
            >
              Choose photos
            </button>
          </div>
          <p id="folder-help" className="mt-2 text-sm text-muted">
            Type the full path. Browsers can’t pick folders for you.
          </p>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={vision}
                onChange={(e) => setVision(e.target.checked)}
                className="size-5 accent-[var(--accent)]"
              />
              Use the vision model (slower, more precise)
            </label>
            <div className="flex items-center gap-3">
              <label htmlFor="lang" className="text-sm">
                Reasons in
              </label>
              <select
                id="lang"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="field !min-h-11 !w-auto"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>

          {config && options && (
            <AdvancedOptions
              config={config}
              value={options}
              onChange={updateOptions}
              vision={vision}
            />
          )}
        </form>

        {scan && options && !running && (
          <PhotoPicker
            scan={scan}
            selected={selected}
            onSelected={setSelected}
            compare={compare}
            onCompare={setCompare}
            shortlist={options.shortlist_size}
            busy={busy}
            onAnalyze={analyzeSelection}
            onClose={() => setScan(null)}
          />
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 flex max-w-3xl items-center gap-2 rounded-lg border border-reject px-4 py-3 text-sm text-reject"
          >
            <StatusIcon status="reject" />
            {error}
          </p>
        )}

        {running && job && <ReasoningPanel job={job} />}

        {job?.status === "error" && (
          <p role="alert" className="mt-8 text-sm text-reject">
            {job.error}
          </p>
        )}

        {!running && (
          <section aria-labelledby="how" className="mt-24">
            <h2 id="how" className="text-xl font-semibold tracking-tight">
              How it decides
            </h2>
            <ol className="mt-6 grid gap-8 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="border-t border-accent pt-4">
                  <p className="text-sm tabular-nums text-muted">{index + 1}</p>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
