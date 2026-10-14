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
  options?: {
    recursive: boolean;
    kinds: string[];
    criteria: string[];
    exclude: string[];
    compared_selection: boolean;
    selected_only: boolean;
  };
}

export interface Summary {
  summary: string;
  double_check: string[];
  tip: string;
  source: "model" | "template";
  model: string | null;
  generated_at?: number;
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
  folder?: string;
  selected?: number | null;
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

export interface Options {
  model: string;
  criteria: string[];
  kinds: string[];
  recursive: boolean;
  exclude: string[];
  group_gap_seconds: number;
  group_hash_distance: number;
  shortlist_size: number;
  soft_ratio: number;
}

export type SliderKey =
  | "group_gap_seconds"
  | "group_hash_distance"
  | "shortlist_size"
  | "soft_ratio";

export interface ConfigInfo {
  defaults: Options;
  bounds: Record<
    SliderKey,
    { min: number; max: number; step: number; label: string; hint: string }
  >;
  criteria: { id: string; label: string; hint: string; needs_model: boolean }[];
  kinds: { id: string; label: string }[];
}

export interface ModelInfo {
  name: string;
  vision: boolean | null;
}

export interface ScanFile {
  name: string;
  folder: string;
  kind: string;
  size: number;
}

export interface ScanResult {
  folder: string;
  total: number;
  truncated: boolean;
  files: ScanFile[];
}

export interface JobPayload {
  folder: string;
  lang: Lang;
  vision: boolean;
  options: Options;
  files?: string[];
  compare_selected?: boolean;
}

function encodePath(name: string) {
  return name.split("/").map(encodeURIComponent).join("/");
}

export function createJob(payload: JobPayload) {
  return request<{ id: string }>("/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getConfig() {
  return request<ConfigInfo>("/config");
}

export function getModels() {
  return request<{ models: ModelInfo[] }>("/models");
}

export function scanFolder(folder: string, options: Options) {
  return request<ScanResult>("/scan", {
    method: "POST",
    body: JSON.stringify({ folder, options }),
  });
}

export function scanThumbUrl(folder: string, name: string, size = 240) {
  const query = new URLSearchParams({ folder, name, size: String(size) });
  return `${API_URL}/scan/thumb?${query.toString()}`;
}

export function getJob(id: string) {
  return request<Job>(`/jobs/${id}`);
}

export function setStatus(jobId: string, name: string, status: Status) {
  return request<Photo>(`/jobs/${jobId}/photos/${encodePath(name)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function thumbUrl(jobId: string, name: string, size = 480) {
  return `${API_URL}/jobs/${jobId}/thumb/${encodePath(name)}?size=${size}`;
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

export function setManyStatus(jobId: string, names: string[], status: Status) {
  return request<{ changed: number }>(`/jobs/${jobId}/photos/bulk`, {
    method: "POST",
    body: JSON.stringify({ names, status }),
  });
}
