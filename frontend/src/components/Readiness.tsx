"use client";

import { useCallback, useEffect, useState } from "react";
import { getModels } from "@/lib/api";
import { explain, problemFor, type Problem } from "@/lib/problems";
import { ProblemNotice } from "@/components/ProblemNotice";

type State =
  | { kind: "checking" }
  | { kind: "ready"; model: string }
  | { kind: "problem"; problem: Problem };

interface Props {
  vision: boolean;
  model: string;
  onWithoutModel: () => void;
}

export function Readiness({ vision, model, onWithoutModel }: Props) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [round, setRound] = useState(0);

  const check = useCallback(async () => {
    try {
      const { models } = await getModels();
      const found = models.find(
        (m) => m.name === model || m.name === `${model}:latest`,
      );
      if (!found) {
        setState({
          kind: "problem",
          problem: problemFor("model_missing", { model }),
        });
      } else if (found.vision === false) {
        setState({
          kind: "problem",
          problem: problemFor("model_not_vision", { model }),
        });
      } else {
        setState({ kind: "ready", model });
      }
    } catch (e) {
      const problem = explain(e);
      setState(
        problem.code === "api_down"
          ? { kind: "ready", model }
          : { kind: "problem", problem },
      );
    }
  }, [model]);

  useEffect(() => {
    if (!vision) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) void check();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [vision, check, round]);

  if (!vision) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-muted">
        <span aria-hidden="true" className="size-2 rounded-full bg-control" />
        Metrics only. No model needed, and it runs faster.
      </p>
    );
  }

  if (state.kind === "problem") {
    return (
      <ProblemNotice
        problem={state.problem}
        className="mt-4"
        onRetry={() => {
          setState({ kind: "checking" });
          setRound((n) => n + 1);
        }}
        retryLabel="Check again"
        onWithoutModel={onWithoutModel}
      />
    );
  }

  return (
    <p
      role="status"
      className="mt-4 flex items-center gap-2 text-sm text-muted"
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${state.kind === "ready" ? "bg-keep" : "bg-review pulse-dot"}`}
      />
      {state.kind === "ready"
        ? `Ollama is running and ${state.model} is ready.`
        : "Checking that Ollama and the model are ready…"}
    </p>
  );
}
