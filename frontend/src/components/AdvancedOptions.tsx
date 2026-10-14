"use client";

import { useState } from "react";
import {
  getModels,
  type ConfigInfo,
  type ModelInfo,
  type Options,
  type SliderKey,
} from "@/lib/api";

const SLIDERS: SliderKey[] = [
  "group_gap_seconds",
  "group_hash_distance",
  "shortlist_size",
  "soft_ratio",
];

function formatValue(key: SliderKey, value: number) {
  if (key === "group_gap_seconds") return `${value} s`;
  if (key === "soft_ratio") return `${Math.round(value * 100)}%`;
  return String(value);
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function AdvancedOptions({
  config,
  value,
  onChange,
  vision,
}: {
  config: ConfigInfo;
  value: Options;
  onChange: (next: Options) => void;
  vision: boolean;
}) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [exclude, setExclude] = useState(value.exclude.join(", "));

  async function loadModels() {
    if (models) return;
    try {
      setModels((await getModels()).models);
      setModelError(null);
    } catch (e) {
      setModelError((e as Error).message);
    }
  }

  function setExcludeText(text: string) {
    setExclude(text);
    onChange({
      ...value,
      exclude: text
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  function reset() {
    setExclude(config.defaults.exclude.join(", "));
    onChange(config.defaults);
  }

  const changed = JSON.stringify(value) !== JSON.stringify(config.defaults);

  return (
    <details
      className="group mt-6 border-t border-line pt-4"
      onToggle={(e) => e.currentTarget.open && loadModels()}
    >
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline">
        Analysis options
        {changed && (
          <span className="rounded-md bg-overlay px-2 py-0.5 text-xs text-muted">
            customized
          </span>
        )}
      </summary>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-medium">What to look for</legend>
          <p className="mt-1 text-sm text-muted">
            Turn off anything you do not care about. Photos are only judged on
            what you leave on.
          </p>
          <div className="mt-2">
            {config.criteria.map((criterion) => {
              const on = value.criteria.includes(criterion.id);
              const only = on && value.criteria.length === 1;
              const needsModel = criterion.needs_model && !vision;
              return (
                <label
                  key={criterion.id}
                  className="flex min-h-11 items-start gap-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={only}
                    onChange={() =>
                      onChange({
                        ...value,
                        criteria: toggle(value.criteria, criterion.id),
                      })
                    }
                    className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className={needsModel ? "opacity-60" : ""}>
                    <span className="font-medium">{criterion.label}</span>
                    <span className="block text-muted">
                      {criterion.hint}
                      {needsModel && " Needs the vision model."}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-8">
          <fieldset>
            <legend className="text-sm font-medium">Which files</legend>
            <div className="mt-2 flex flex-wrap gap-x-6">
              {config.kinds.map((kind) => {
                const on = value.kinds.includes(kind.id);
                return (
                  <label
                    key={kind.id}
                    className="flex min-h-11 items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={on && value.kinds.length === 1}
                      onChange={() =>
                        onChange({
                          ...value,
                          kinds: toggle(value.kinds, kind.id),
                        })
                      }
                      className="size-5 accent-[var(--accent)]"
                    />
                    {kind.label}
                  </label>
                );
              })}
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={value.recursive}
                onChange={(e) =>
                  onChange({ ...value, recursive: e.target.checked })
                }
                className="size-5 accent-[var(--accent)]"
              />
              Include subfolders
            </label>
            <label htmlFor="exclude" className="mt-2 block text-sm">
              Skip files matching
            </label>
            <input
              id="exclude"
              value={exclude}
              onChange={(e) => setExcludeText(e.target.value)}
              placeholder="*draft*, backup/*"
              spellCheck={false}
              autoComplete="off"
              aria-describedby="exclude-help"
              className="field mt-1 font-mono"
            />
            <p id="exclude-help" className="mt-1 text-sm text-muted">
              Comma separated. Use * as a wildcard. Hidden folders are always
              skipped.
            </p>
          </fieldset>

          <div>
            <label htmlFor="model" className="text-sm font-medium">
              Vision model
            </label>
            <select
              id="model"
              value={value.model}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
              onFocus={loadModels}
              disabled={!vision}
              className="field mt-1 font-mono"
            >
              {!models?.some((m) => m.name === value.model) && (
                <option value={value.model}>{value.model}</option>
              )}
              {models?.map((model) => (
                <option
                  key={model.name}
                  value={model.name}
                  disabled={model.vision === false}
                >
                  {model.name}
                  {model.vision === false ? " (no vision)" : ""}
                </option>
              ))}
            </select>
            {modelError && (
              <p className="mt-1 text-sm text-review">
                Could not list models: {modelError}
              </p>
            )}
          </div>
        </div>
      </div>

      <fieldset className="mt-8">
        <legend className="text-sm font-medium">How strict to be</legend>
        <div className="mt-2 grid gap-6 sm:grid-cols-2">
          {SLIDERS.map((key) => {
            const spec = config.bounds[key];
            const id = `slider-${key}`;
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <label htmlFor={id}>{spec.label}</label>
                  <output htmlFor={id} className="font-mono tabular-nums">
                    {formatValue(key, value[key])}
                  </output>
                </div>
                <input
                  id={id}
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={value[key]}
                  onChange={(e) =>
                    onChange({ ...value, [key]: Number(e.target.value) })
                  }
                  aria-describedby={`${id}-hint`}
                  className="mt-2 h-11 w-full accent-[var(--accent)]"
                />
                <p id={`${id}-hint`} className="text-sm text-muted">
                  {spec.hint}
                </p>
              </div>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={reset}
        disabled={!changed}
        className="btn btn-secondary mt-6"
      >
        Reset to defaults
      </button>
    </details>
  );
}
