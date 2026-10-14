import type { Report } from "@/lib/api";
import { readFailure } from "@/lib/problems";

export function ReportNotices({ report }: { report: Report }) {
  const skipped = report.skipped ?? [];
  const failedGroups = report.groups.filter((g) => g.vision_error);
  if (skipped.length === 0 && failedGroups.length === 0) return null;

  return (
    <div className="mt-6 max-w-3xl space-y-3">
      {skipped.length > 0 && (
        <section
          aria-labelledby="skipped-title"
          className="rounded-lg border border-review px-4 py-3 text-sm"
        >
          <h2 id="skipped-title" className="font-medium text-review">
            {skipped.length === 1
              ? "1 file couldn’t be read and was left out"
              : `${skipped.length} files couldn’t be read and were left out`}
          </h2>
          <p className="mt-1 text-muted">
            They are not in the results below. Open them in another app to check
            whether they are damaged.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-muted underline-offset-4 hover:underline">
              Show files
            </summary>
            <ul className="mt-2 space-y-1">
              {skipped.map((file) => (
                <li
                  key={file.name}
                  className="flex flex-col gap-0.5 sm:flex-row sm:gap-3"
                >
                  <span className="break-all font-mono text-xs">
                    {file.name}
                  </span>
                  <span className="text-muted">{readFailure(file.error)}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {failedGroups.length > 0 && (
        <section
          aria-labelledby="model-title"
          className="rounded-lg border border-review px-4 py-3 text-sm"
        >
          <h2 id="model-title" className="font-medium text-review">
            {failedGroups.length === 1
              ? "The model didn’t answer for 1 group"
              : `The model didn’t answer for ${failedGroups.length} groups`}
          </h2>
          <p className="mt-1 text-muted">
            Those groups were decided by sharpness alone and marked for review.
            Check that Ollama is still running, then analyze the folder again to
            get the model’s opinion.
          </p>
        </section>
      )}
    </div>
  );
}
