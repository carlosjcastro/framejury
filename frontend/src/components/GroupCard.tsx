import { thumbUrl, type Group, type Status } from "@/lib/api";
import { FILL, LABEL, StatusChip, StatusIcon, TEXT } from "./StatusChip";

const ORDER: Status[] = ["keep", "review", "reject"];

function Corners({ status }: { status: Status }) {
  if (status === "reject") return null;
  const line = status === "review" ? "border-dotted" : "border-solid";
  const base = `pointer-events-none absolute h-6 w-6 ${line}`;
  return (
    <span aria-hidden="true">
      <i className={`${base} left-0 top-0 border-l-2 border-t-2`} />
      <i className={`${base} right-0 top-0 border-r-2 border-t-2`} />
      <i className={`${base} bottom-0 left-0 border-b-2 border-l-2`} />
      <i className={`${base} bottom-0 right-0 border-b-2 border-r-2`} />
    </span>
  );
}

export function GroupCard({
  jobId,
  group,
  index,
  eager,
  onChange,
}: {
  jobId: string;
  group: Group;
  index: number;
  eager: boolean;
  onChange: (name: string, status: Status) => void;
}) {
  const count = group.photos.length;
  const titleId = `group-${group.id}`;
  const topSharpness = Math.max(
    ...group.photos.map((p) => p.metrics.sharpness),
    1,
  );
  const touched = group.photos.some((p) => p.manual);

  return (
    <section
      aria-labelledby={titleId}
      className="reveal border-t border-line pt-6"
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <header className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          Group {group.id}
        </h2>
        <p className="text-sm text-muted">
          {count} {count === 1 ? "photo" : "photos"}
        </p>
        {group.needs_review && !touched && (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-review">
            <StatusIcon status="review" />
            Needs your review
          </p>
        )}
      </header>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-6 print:grid-cols-2">
        {group.photos.map((photo) => {
          const relative = Math.round(
            (photo.metrics.sharpness / topSharpness) * 100,
          );
          const obs = photo.observation;
          return (
            <li key={photo.name}>
              <article>
                <div
                  className={`relative p-3 transition-colors duration-200 ${TEXT[photo.status]}`}
                >
                  <Corners status={photo.status} />
                  <div className="relative">
                    <img
                      src={thumbUrl(jobId, photo.name)}
                      alt={`Preview of ${photo.name}`}
                      loading={eager ? "eager" : "lazy"}
                      className={`block aspect-[3/2] w-full rounded-md bg-raised object-contain transition-[filter] duration-300 ${
                        photo.status === "reject"
                          ? "brightness-75 saturate-50"
                          : ""
                      }`}
                    />
                    <div className="absolute left-2 top-2">
                      <StatusChip status={photo.status} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2 px-1">
                  <h3
                    className="truncate font-mono text-sm font-medium"
                    title={photo.name}
                  >
                    {photo.name}
                  </h3>
                  <p className="text-sm text-muted">{photo.reason}</p>

                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-accent underline-offset-4 hover:underline">
                      Evidence
                    </summary>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                      <dt className="text-muted">Sharpness</dt>
                      <dd className="tabular-nums">
                        {Math.round(photo.metrics.sharpness)} · {relative}% of
                        the sharpest
                        <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-overlay">
                          <span
                            className="block h-full bg-accent"
                            style={{ width: `${relative}%` }}
                          />
                        </span>
                      </dd>
                      <dt className="text-muted">Bright areas clipped</dt>
                      <dd className="tabular-nums">
                        {(photo.metrics.clipped_high * 100).toFixed(1)}%
                      </dd>
                      <dt className="text-muted">Dark areas clipped</dt>
                      <dd className="tabular-nums">
                        {(photo.metrics.clipped_low * 100).toFixed(1)}%
                      </dd>
                      {obs ? (
                        <>
                          <dt className="text-muted">Eyes closed</dt>
                          <dd className="tabular-nums">
                            {obs.closed_eyes} of {obs.people}
                          </dd>
                          <dt className="text-muted">Subject focus</dt>
                          <dd className="tabular-nums">
                            {obs.subject_focus} / 5
                          </dd>
                          <dt className="text-muted">Expression</dt>
                          <dd className="tabular-nums">{obs.expression} / 5</dd>
                          <dt className="text-muted">Model note</dt>
                          <dd>{obs.note}</dd>
                        </>
                      ) : (
                        <>
                          <dt className="text-muted">Vision model</dt>
                          <dd>Not used for this photo</dd>
                        </>
                      )}
                      <dt className="text-muted">Decision score</dt>
                      <dd className="tabular-nums">{photo.score}</dd>
                    </dl>
                  </details>

                  <div
                    role="group"
                    aria-label={`Decision for ${photo.name}`}
                    className="flex gap-1.5 pt-1 print:hidden"
                  >
                    {ORDER.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={photo.status === s}
                        onClick={() =>
                          photo.status !== s && onChange(photo.name, s)
                        }
                        className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-sm font-medium transition-colors sm:min-h-9 ${
                          photo.status === s
                            ? `${FILL[s]} border-transparent`
                            : "border-control text-ink hover:bg-overlay"
                        }`}
                      >
                        <StatusIcon status={s} />
                        {LABEL[s]}
                      </button>
                    ))}
                  </div>

                  {photo.manual && photo.auto_status && (
                    <p className="text-xs text-muted">
                      Changed by you.{" "}
                      <button
                        type="button"
                        onClick={() => onChange(photo.name, photo.auto_status!)}
                        className="underline underline-offset-4 hover:text-ink print:hidden"
                      >
                        Undo, back to {LABEL[photo.auto_status]}
                      </button>
                    </p>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
