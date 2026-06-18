"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { MacroBenchmarkResult } from "@/lib/ai-model-benchmark";

type ApiResponse =
  | {
      ok: true;
      result: MacroBenchmarkResult;
    }
  | {
      ok: false;
      error: string;
    };

function formatMacroValue(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}

function formatExpected(macros: {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}) {
  return [
    formatMacroValue(macros.caloriesKcal, " kcal"),
    formatMacroValue(macros.proteinG, "g P"),
    formatMacroValue(macros.carbsG, "g C"),
    formatMacroValue(macros.fatG, "g F"),
  ].join(" / ");
}

function SummaryCard({
  label,
  model,
  completedCases,
  failedCases,
  averageErrorPct,
  averageLatencyMs,
}: {
  label: string;
  model: string;
  completedCases: number;
  failedCases: number;
  averageErrorPct: number | null;
  averageLatencyMs: number | null;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-app-bg)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
        {label}
      </p>
      <p className="mt-2 break-all font-mono text-xs text-[var(--color-muted-strong)]">
        {model}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Avg error
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-ink)]">
            {averageErrorPct === null ? "n/a" : `${averageErrorPct.toFixed(1)}%`}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Avg latency
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-ink)]">
            {averageLatencyMs === null ? "n/a" : `${averageLatencyMs}ms`}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        {completedCases} completed, {failedCases} failed
      </p>
    </div>
  );
}

function ResultCell({
  result,
}: {
  result: MacroBenchmarkResult["cases"][number]["current"];
}) {
  if (!result.ok || !result.estimate) {
    return (
      <div className="max-w-sm text-sm text-[var(--color-danger)]">
        {result.error ?? "Model failed"}
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {result.latencyMs}ms
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-[13rem] text-sm">
      <p className="font-semibold text-[var(--color-ink)]">
        {formatExpected(result.estimate)}
      </p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Error {result.normalizedErrorPct?.toFixed(1)}% - {result.latencyMs}ms
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-[var(--color-muted)]">
        {result.estimate.label}
      </p>
    </div>
  );
}

export function AdminAiBenchmarkClient() {
  const [model, setModel] = useState("");
  const [result, setResult] = useState<MacroBenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const verdict = useMemo(() => {
    if (!result) {
      return null;
    }

    const currentError = result.summaries.current.averageErrorPct;
    const candidateError = result.summaries.candidate.averageErrorPct;

    if (currentError === null || candidateError === null) {
      return "Compare completed cases below; at least one model had failures.";
    }

    if (candidateError < currentError) {
      return "The candidate was more accurate on this fixture set.";
    }

    if (candidateError > currentError) {
      return "The current model was more accurate on this fixture set.";
    }

    return "Accuracy tied on this fixture set; compare latency and failures.";
  }, [result]);

  async function runBenchmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsRunning(true);

    try {
      const response = await fetch("/api/admin/ai-model-benchmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!payload.ok) {
        setError(payload.error);
        return;
      }

      setResult(payload.result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Benchmark request failed.",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <form className="grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={runBenchmark}>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
            Candidate OpenRouter model
          </span>
          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="google/gemma-4-31b-it:free"
            className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-app-bg)] px-4 py-3 font-mono text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={isRunning}
          className="self-end rounded-2xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {isRunning ? "Running benchmark" : "Run benchmark"}
        </button>
      </form>

      <p className="text-sm text-[var(--color-muted)]">
        Each run compares the configured production model with the candidate
        model on three public single-serving food images. Lower macro error and
        lower latency are better.
      </p>

      {error ? (
        <div className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryCard label="Current model" {...result.summaries.current} />
            <SummaryCard label="Candidate model" {...result.summaries.candidate} />
          </div>

          {verdict ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-app-bg)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">
              {verdict}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
                <tr>
                  <th className="pb-3 pr-4">Fixture</th>
                  <th className="pb-3 pr-4">Expected</th>
                  <th className="pb-3 pr-4">Current</th>
                  <th className="pb-3">Candidate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.cases.map((item) => (
                  <tr key={item.fixtureId}>
                    <td className="py-4 pr-4 align-top">
                      <div className="flex min-w-[16rem] gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt={item.fixtureName}
                          className="h-16 w-16 rounded-2xl object-cover"
                        />
                        <div>
                          <p className="font-semibold text-[var(--color-ink)]">
                            {item.fixtureName}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-muted)]">
                            {item.servingDescription}
                          </p>
                          <a
                            href={item.imageSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-xs font-semibold text-[var(--color-accent)] underline-offset-4 hover:underline"
                          >
                            Image source
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 align-top text-sm text-[var(--color-muted-strong)]">
                      <p className="font-semibold text-[var(--color-ink)]">
                        {formatExpected(item.expected)}
                      </p>
                      <p className="mt-1 max-w-[16rem] text-xs text-[var(--color-muted)]">
                        {item.expectedSource}
                      </p>
                    </td>
                    <td className="py-4 pr-4 align-top">
                      <ResultCell result={item.current} />
                    </td>
                    <td className="py-4 align-top">
                      <ResultCell result={item.candidate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
