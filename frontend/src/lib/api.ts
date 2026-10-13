const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Status = "keep" | "reject" | "review";
export type Lang = "es" | "en";

export interface Observation {
  people: number;
  closed_eyes: number;
  expression: number;
  subject_focus: number;
  note: string;
}

export interface Metrics {
  sharpness: number;
  brightness: number;
  clipped_high: number;
  clipped_low: number;
  width: number;
  height: number;
  taken_at: number;
}

export interface Photo {
  name: string;
  path: string;
  status: Status;
  reason: string;
  flags: string[];
  score: number;
  observation: Observation | null;
  metrics: Metrics;
  manual?: boolean;
  auto_status?: Status;
}

export interface Group {
  id: number;
  keeper: string;
  needs_review: boolean;
  vision_error: string | null;
  photos: Photo[];
}

export interface Stats {
  photos: number;
  groups: number;
  keep: number;
  reject: number;
  review: number;
  model_calls: number;
  model_seconds: number;
  total_seconds: number;
}

export interface Report {
  version: string;
  folder: string;
  model: string | null;
  lang: Lang;
  stats: Stats;
  groups: Group[];
  skipped: { name: string; error: string }[];
}

export interface Job {
  id: string;
  status: "running" | "done" | "error";
  stage?: "analyze" | "judge";
  done: number;
  total: number;
  report?: Report;
  error?: string;
  current?: string;
  vision?: boolean;
}

export interface FolderExportResult {
  destination: string;
  copied: { keep: number; review: number; reject: number };
}

export interface XmpResult {
  written: number;
  skipped_existing: number;
  missing: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function createJob(folder: string, lang: Lang, vision: boolean) {
  return request<{ id: string }>("/jobs", {
    method: "POST",
    body: JSON.stringify({ folder, lang, vision }),
  });
}

export function getJob(id: string) {
  return request<Job>(`/jobs/${id}`);
}

export function setStatus(jobId: string, name: string, status: Status) {
  return request<Photo>(`/jobs/${jobId}/photos/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function thumbUrl(jobId: string, name: string, size = 480) {
  return `${API_URL}/jobs/${jobId}/thumb/${encodeURIComponent(name)}?size=${size}`;
}

export function csvUrl(jobId: string) {
  return `${API_URL}/jobs/${jobId}/export.csv`;
}

export function exportFolders(
  jobId: string,
  destination: string,
  includeRejects: boolean,
) {
  return request<FolderExportResult>(`/jobs/${jobId}/export/folders`, {
    method: "POST",
    body: JSON.stringify({
      destination: destination || null,
      include_rejects: includeRejects,
    }),
  });
}

export function exportXmp(jobId: string) {
  return request<XmpResult>(`/jobs/${jobId}/export/xmp`, { method: "POST" });
}
