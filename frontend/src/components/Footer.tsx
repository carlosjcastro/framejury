const REPO = "https://github.com/carlosjcastro/framejury";

const STACK = [
  { label: "Interface", items: "Next.js, React, TypeScript, Tailwind CSS" },
  { label: "Engine", items: "Python, FastAPI, OpenCV, Pillow" },
  { label: "Model", items: "Gemma 4 through Ollama, running on your computer" },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line print:hidden">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-sm font-semibold tracking-tight">Framejury</p>
          <p className="mt-2 max-w-md text-sm text-muted">
            Local photo culling that explains every decision. Your photos are
            processed on this computer and never uploaded.
          </p>
          <dl className="mt-6 space-y-2 text-sm">
            {STACK.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-0.5 sm:flex-row sm:gap-4"
              >
                <dt className="w-20 shrink-0 text-muted">{row.label}</dt>
                <dd>{row.items}</dd>
              </div>
            ))}
          </dl>
        </div>

        <nav aria-label="Project links" className="text-sm">
          <ul className="space-y-1">
            <li>
              <a
                href={REPO}
                className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline"
              >
                Source code on GitHub
              </a>
            </li>
            <li>
              <a
                href={`${REPO}/blob/main/LICENSE`}
                className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline"
              >
                MIT License
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">
          © 2026 Carlos José Castro Galante. Released under the MIT License.
          Models you run through Ollama keep their own licenses.
        </p>
      </div>
    </footer>
  );
}
