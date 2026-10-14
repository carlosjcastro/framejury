import type { Options, Photo, Report, Status } from "@/lib/api";

export const STATUSES: readonly Status[] = ["keep", "review", "reject"];

export function recount(report: Report): Report {
  const counts: Record<Status, number> = { keep: 0, review: 0, reject: 0 };
  for (const group of report.groups) {
    for (const photo of group.photos) counts[photo.status] += 1;
  }
  return { ...report, stats: { ...report.stats, ...counts } };
}

export function mapPhotos(
  report: Report,
  update: (photo: Photo) => Photo,
): Report {
  const groups = report.groups.map((group) => ({
    ...group,
    photos: group.photos.map(update),
  }));
  return recount({ ...report, groups });
}

export function withStatus(photo: Photo, status: Status): Photo {
  const auto = photo.auto_status ?? photo.status;
  return { ...photo, status, auto_status: auto, manual: status !== auto };
}

export function scanKey(options: Options): string {
  return JSON.stringify([
    options.recursive,
    [...options.kinds].sort(),
    options.exclude,
  ]);
}
