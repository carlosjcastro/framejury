"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdvancedOptions } from "@/components/AdvancedOptions";
import { Hero } from "@/components/Hero";
import { HowItDecides } from "@/components/HowItDecides";
import { PhotoPicker } from "@/components/PhotoPicker";
import { ProblemNotice } from "@/components/ProblemNotice";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { Readiness } from "@/components/Readiness";
import { ReviewScreen } from "@/components/ReviewScreen";
import { explain, problemFor, type Problem } from "@/lib/problems";
import { scanKey } from "@/lib/report";
import {
  ApiError,
  createJob,
  getConfig,
  getJob,
  scanFolder,
  type ConfigInfo,
  type Job,
  type Lang,
  type Options,
  type Report,
  type ScanResult,
} from "@/lib/api";

type LastRun =
  | { kind: "analyze"; files?: string[]; compare: boolean }
  | { kind: "scan" };

const POLL_INTERVAL_MS = 1000;

export default function Home() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);
  const [folder, setFolder] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [vision, setVision] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRun = useRef<LastRun | null>(null);

  const jobId = job?.id;
  const running = job?.status === "running";
  const report = job?.status === "done" ? job.report : undefined;
  const unavailable = busy || running || !options;

  const loadConfig = useCallback(() => {
    getConfig()
      .then((info) => {
        setConfig(info);
        setOptions(info.defaults);
        setError((current) => (current?.code === "api_down" ? null : current));
      })
      .catch((e) => setError(explain(e)));
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!jobId || !running) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const next = await getJob(jobId);
        if (!active) return;
        setJob(next);
        setError((current) => (current?.code === "api_down" ? null : current));
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) setJob(null);
        setError(explain(e));
      }
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId, running]);

  function updateOptions(next: Options) {
    if (options && scan && scanKey(next) !== scanKey(options)) setScan(null);
    setOptions(next);
  }

  function updateReport(update: (report: Report) => Report) {
    setJob((current) =>
      current?.report
        ? { ...current, report: update(current.report) }
        : current,
    );
  }

  function reset() {
    setJob(null);
    setError(null);
  }

  async function analyze(
    files?: string[],
    compareSelected = false,
    withVision = vision,
  ) {
    if (!options) return;
    lastRun.current = { kind: "analyze", files, compare: compareSelected };
    setError(null);
    setJob(null);
    setBusy(true);
    try {
      const { id } = await createJob({
        folder: folder.trim(),
        lang,
        vision: withVision,
        options,
        files,
        compare_selected: compareSelected,
      });
      setScan(null);
      setJob(await getJob(id));
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  async function choosePhotos() {
    if (!options || !folder.trim()) {
      setError(problemFor("need_folder"));
      return;
    }
    lastRun.current = { kind: "scan" };
    setError(null);
    setBusy(true);
    try {
      const result = await scanFolder(folder.trim(), options);
      if (result.total === 0) {
        setError(problemFor("no_photos", { folder: folder.trim() }));
        return;
      }
      setScan(result);
      setSelected(new Set(result.files.map((file) => file.name)));
      setCompare(false);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  function analyzeSelection() {
    if (!scan) return;
    const everything = selected.size === scan.total && !compare;
    void analyze(everything ? undefined : Array.from(selected), compare);
  }

  function rerun(withVision = vision) {
    const last = lastRun.current;
    if (last?.kind === "analyze")
      void analyze(last.files, last.compare, withVision);
    else if (last?.kind === "scan") void choosePhotos();
  }

  function retry() {
    if (!config) {
      setError(null);
      loadConfig();
      return;
    }
    if (running) {
      setError(null);
      return;
    }
    rerun();
  }

  function withoutModel() {
    setVision(false);
    setError(null);
    if (folder.trim()) rerun(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void analyze();
  }

  if (report && job) {
    return (
      <ReviewScreen
        job={job}
        report={report}
        error={error}
        onDismissError={() => setError(null)}
        onError={(e) => setError(explain(e))}
        onReportChange={updateReport}
        onReset={reset}
      />
    );
  }

  return (
    <main>
      <form onSubmit={submit}>
        <Hero still={running}>
          <label htmlFor="folder" className="block text-sm font-medium">
            Photo folder
          </label>
          <input
            id="folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="C:\photos\wedding"
            required
            autoComplete="off"
            spellCheck={false}
            aria-describedby="folder-help"
            className="field mt-2 font-mono"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={unavailable}
              className="btn btn-primary btn-lg"
            >
              {running ? "Analyzing…" : "Analyze folder"}
            </button>
            <button
              type="button"
              onClick={choosePhotos}
              disabled={unavailable}
              className="btn btn-secondary btn-lg"
            >
              Choose photos
            </button>
          </div>
          <p id="folder-help" className="mt-3 text-sm text-muted">
            Start with a folder of JPEG or RAW files and paste its full path.
            Analysis only reads your photos, and nothing changes until you
            export.
          </p>

          {error && (
            <ProblemNotice
              problem={error}
              className="mt-4"
              onRetry={error.code === "need_folder" ? undefined : retry}
              retryLabel={config ? "Try again" : "Check again"}
              onWithoutModel={folder.trim() ? withoutModel : undefined}
              onDismiss={() => setError(null)}
            />
          )}
        </Hero>

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
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

            {options && (
              <Readiness
                vision={vision}
                model={options.model}
                onWithoutModel={() => setVision(false)}
              />
            )}

            {config && options && (
              <AdvancedOptions
                config={config}
                value={options}
                onChange={updateOptions}
                vision={vision}
              />
            )}
          </div>
        </div>
      </form>

      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
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

        {running && job && <ReasoningPanel job={job} />}

        {job?.status === "error" && (
          <ProblemNotice
            problem={problemFor("analysis_failed", {}, job.error)}
            className="mt-8"
            onRetry={() => rerun()}
            onWithoutModel={vision ? () => rerun(false) : undefined}
          />
        )}

        {!running && <HowItDecides />}
      </div>
    </main>
  );
}
