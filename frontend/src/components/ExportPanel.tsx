"use client";

import { useState } from "react";
import {
  csvUrl,
  exportFolders,
  exportXmp,
  type FolderExportResult,
  type XmpResult,
} from "@/lib/api";

export function ExportPanel({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [rejects, setRejects] = useState(false);
  const [confirmXmp, setConfirmXmp] = useState(false);
  const [busy, setBusy] = useState<"folders" | "xmp" | null>(null);
  const [folderResult, setFolderResult] = useState<FolderExportResult | null>(
    null,
  );
  const [xmpResult, setXmpResult] = useState<XmpResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setError(null);
    setFolderResult(null);
    setBusy("folders");
    try {
      setFolderResult(await exportFolders(jobId, destination.trim(), rejects));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function writeXmp() {
    setError(null);
    setXmpResult(null);
    setConfirmXmp(false);
    setBusy("xmp");
    try {
      setXmpResult(await exportXmp(jobId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 print:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="export-body"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-secondary"
      >
        Export selection
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 6l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div
          id="export-body"
          className="reveal mt-4 max-w-3xl divide-y divide-line border-y border-line"
        >
          <div className="grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <h3 className="font-medium">Spreadsheet of every decision</h3>
              <p className="text-sm text-muted">
                A CSV with the decision, the reason and the measurements for
                each photo, including the ones you changed.
              </p>
            </div>
            <a href={csvUrl(jobId)} className="btn btn-secondary">
              Download CSV
            </a>
          </div>

          <div className="py-5">
            <h3 className="font-medium">Copy into Keep and Review folders</h3>
            <p className="text-sm text-muted">
              Copies only. Your originals stay where they are, and matching
              RAW+JPEG pairs and .xmp files travel together.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <label htmlFor="destination" className="sr-only">
                Destination folder
              </label>
              <input
                id="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Default: a framejury-export folder next to your photos"
                spellCheck={false}
                autoComplete="off"
                className="field font-mono"
              />
              <button
                type="button"
                onClick={copy}
                disabled={busy !== null}
                className="btn btn-primary shrink-0"
              >
                {busy === "folders" ? "Copying…" : "Copy photos"}
              </button>
            </div>
            <label className="mt-2 flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={rejects}
                onChange={(e) => setRejects(e.target.checked)}
                className="size-5 accent-[var(--accent)]"
              />
              Also copy rejected photos into a Reject folder
            </label>
            {folderResult && (
              <p role="status" className="mt-2 text-sm text-keep">
                Copied {folderResult.copied.keep} to Keep,{" "}
                {folderResult.copied.review} to Review
                {rejects
                  ? `, ${folderResult.copied.reject} to Reject`
                  : ""} in{" "}
                <span className="break-all font-mono">
                  {folderResult.destination}
                </span>
              </p>
            )}
          </div>

          <div className="py-5">
            <h3 className="font-medium">
              Color labels for Lightroom and Bridge (experimental)
            </h3>
            <p className="text-sm text-muted">
              Writes an .xmp file next to each photo: green for Keep, yellow for
              Review, red plus a reject rating for Reject. Existing .xmp files
              are never overwritten. Lightroom reads these for RAW files, and
              ignores them for JPEG.
            </p>
            {!confirmXmp ? (
              <button
                type="button"
                onClick={() => setConfirmXmp(true)}
                disabled={busy !== null}
                className="btn btn-secondary mt-3"
              >
                {busy === "xmp" ? "Writing…" : "Write XMP files"}
              </button>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-sm">
                  This adds new files to your photo folder. Continue?
                </p>
                <button
                  type="button"
                  onClick={writeXmp}
                  className="btn btn-primary"
                >
                  Yes, write files
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmXmp(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            )}
            {xmpResult && (
              <p role="status" className="mt-2 text-sm text-keep">
                Wrote {xmpResult.written} files. Skipped{" "}
                {xmpResult.skipped_existing} that already had one.
                {xmpResult.missing > 0
                  ? ` ${xmpResult.missing} photos could not be found.`
                  : ""}
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="py-4 text-sm text-reject">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
