import type { ReactNode } from "react";
import { ContactStrip } from "@/components/contact/ContactStrip";

const SIGNALS = [
  { label: "Runs on your computer", path: "M3 5h18v11H3zM8 20h8M12 16v4" },
  {
    label: "Photos never uploaded",
    path: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  },
  {
    label: "Gemma 4 through Ollama",
    path: "M8 8h8v8H8zM10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3",
  },
];

interface HeroProps {
  children: ReactNode;
  still: boolean;
}

export function Hero({ children, still }: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="aurora aurora-a -left-[8%] -top-[18rem] size-[46rem] bg-[radial-gradient(closest-side,rgba(61,214,245,0.16),transparent)]" />
        <div className="aurora aurora-b -right-[6%] -top-[6rem] size-[40rem] bg-[radial-gradient(closest-side,rgba(52,211,153,0.1),transparent)]" />
        <div className="aurora aurora-c -bottom-[16rem] left-[22%] size-[36rem] bg-[radial-gradient(closest-side,rgba(99,102,241,0.1),transparent)]" />
        <div className="hero-grid absolute inset-0" />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 pb-12 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-14 lg:pt-24">
        <div>
          <h1 className="reveal max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
            Find the best frame of every burst, and{" "}
            <span className="hero-accent">see why it won.</span>
          </h1>
          <p
            className="reveal mt-5 max-w-xl text-lg text-muted"
            style={{ animationDelay: "90ms" }}
          >
            Framejury groups the near identical shots, picks the keeper of each
            group and writes down the reason, all on your own computer.
          </p>

          <div
            className="reveal mt-9 max-w-xl"
            style={{ animationDelay: "180ms" }}
          >
            {children}
          </div>

          <ul
            className="reveal mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted"
            style={{ animationDelay: "260ms" }}
          >
            {SIGNALS.map((signal) => (
              <li key={signal.label} className="flex items-center gap-2">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={signal.path} />
                </svg>
                {signal.label}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="reveal w-full max-w-[32rem]"
          style={{ animationDelay: "200ms" }}
        >
          <ContactStrip still={still} />
        </div>
      </div>
    </section>
  );
}
