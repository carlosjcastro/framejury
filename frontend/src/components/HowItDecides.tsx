const STEPS = [
  {
    title: "Measure",
    text: "Sharpness, exposure and capture time for every photo, computed on your machine.",
  },
  {
    title: "Group",
    text: "Near-identical shots taken seconds apart become one group, so you compare like with like.",
  },
  {
    title: "Judge",
    text: "A local Gemma model checks eyes, focus and expression. Plain rules make the call and give the reason.",
  },
];

export function HowItDecides() {
  return (
    <section aria-labelledby="how" className="mt-24">
      <h2 id="how" className="text-xl font-semibold tracking-tight">
        How it decides
      </h2>
      <ol className="mt-6 grid gap-8 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="border-t border-accent pt-4">
            <p className="text-sm tabular-nums text-muted">{index + 1}</p>
            <h3 className="mt-1 font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm text-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
