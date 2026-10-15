import { LogoMark } from "@/components/LogoMark";

const REPO = "https://github.com/carlosjcastro/framejury";

const PROJECT_LINKS = [
  { label: "Source code", href: REPO },
  { label: "Documentation", href: `${REPO}#readme` },
  { label: "Contributing", href: `${REPO}/blob/main/CONTRIBUTING.md` },
  { label: "Security policy", href: `${REPO}/blob/main/SECURITY.md` },
  { label: "MIT License", href: `${REPO}/blob/main/LICENSE` },
];

const STACK = [
  {
    label: "Interface",
    items: ["Next.js", "React", "TypeScript", "Tailwind CSS"],
  },
  { label: "Engine", items: ["Python", "FastAPI", "OpenCV", "Pillow"] },
  { label: "Model, running locally", items: ["Gemma 4", "Ollama"] },
];

const EDGE_FADE =
  "linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent)";

function Heading({ children }: { children: string }) {
  return (
    <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
      {children}
    </h2>
  );
}

export function Footer() {
  return (
    <footer className="relative mt-8 overflow-hidden border-t border-line bg-surface print:hidden">
      <div
        aria-hidden="true"
        className="film-edge"
        style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
      />

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-14 pt-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.4fr] lg:gap-16">
        <div>
          <p className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <LogoMark />
            Framejury
          </p>
          <p className="mt-4 max-w-sm text-sm text-muted">
            Local photo culling that explains every decision. Your photos are
            processed on this computer and never uploaded.
          </p>
        </div>

        <nav aria-label="Project links">
          <Heading>Project</Heading>
          <ul className="mt-4">
            {PROJECT_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex min-h-10 items-center gap-1.5 text-sm text-ink underline-offset-4 hover:text-accent hover:underline"
                >
                  {link.label}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-accent"
                  >
                    <path d="M5 11l6-6M6 5h5v5" />
                  </svg>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <Heading>Built with</Heading>
          <dl className="mt-4 space-y-4">
            {STACK.map((group) => (
              <div key={group.label}>
                <dt className="text-xs text-muted">{group.label}</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-md border border-line bg-canvas px-2.5 py-1 font-mono text-xs text-ink"
                    >
                      {item}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">
            Models that you run through Ollama keep their own licenses.
          </p>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>
            © 2026 Carlos José Castro Galante. Released under the MIT License.
          </p>
          <p>Built for the DEV Hacktoberfest Open Source AI Challenge.</p>
        </div>
      </div>

      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[0.1em] select-none text-center text-[clamp(4rem,17vw,15rem)] font-semibold leading-none tracking-[-0.06em]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--overlay), transparent 85%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Framejury
      </p>
    </footer>
  );
}
