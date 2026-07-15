"use client";

import { useMemo, useRef, useState } from "react";
import { EditableNumberInput } from "@/components/EditableNumberInput";
import { runWorkerTournament } from "@/lib/simulator/worker-client";
import {
  JOINER_POOL,
  estimateFinalsBattles,
  estimateSwissBattles,
  estimateTournamentTeamCount,
  mainHeroesForRole,
  sortTournamentRows,
  tournamentRowsToCsv,
  type TournamentRequestPayload,
  type TournamentResult,
  type TournamentResultRow,
  type TournamentSortKey,
  type TournamentTeamGroupPayload,
} from "@/lib/tournament";

type SortDirection = "asc" | "desc";
type ResultTab = "swissOffense" | "swissDefense" | "finalsOffense" | "finalsDefense";

interface BuilderGroup extends TournamentTeamGroupPayload {
  id: string;
  ratioText: string;
}

const INFANTRY_MAINS = mainHeroesForRole("inf");
const LANCER_MAINS = mainHeroesForRole("lanc");
const MARKSMAN_MAINS = mainHeroesForRole("mark");
const DEFAULT_JOINERS = [...JOINER_POOL];
const SORT_LABELS: Record<TournamentSortKey, string> = {
  rank: "Rank",
  wins: "Wins",
  winRate: "Win %",
  avgMargin: "Avg margin",
  matches: "Matches",
  ratio: "Ratio",
  mains: "Mains",
  joiners: "Joiners",
};

function newGroup(index: number): BuilderGroup {
  return {
    id: `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: `Batch ${index}`,
    infantryMains: [...INFANTRY_MAINS],
    lancerMains: [...LANCER_MAINS],
    marksmanMains: [...MARKSMAN_MAINS],
    joiners: [...DEFAULT_JOINERS],
    ratios: ["50,20,30"],
    ratioText: "50,20,30",
    allowRepeatedJoiners: false,
    excludeMainHeroesFromJoiners: true,
  };
}

function defaultJobs(): number {
  if (typeof navigator === "undefined") return 4;
  return Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
}

function groupPayload(group: BuilderGroup): TournamentTeamGroupPayload {
  return {
    label: group.label,
    infantryMains: group.infantryMains,
    lancerMains: group.lancerMains,
    marksmanMains: group.marksmanMains,
    joiners: group.joiners,
    ratios: splitRatios(group.ratioText),
    allowRepeatedJoiners: group.allowRepeatedJoiners,
    excludeMainHeroesFromJoiners: group.excludeMainHeroesFromJoiners,
  };
}

export default function TournamentPage() {
  const [groups, setGroups] = useState<BuilderGroup[]>([newGroup(1)]);
  const [totalTroops, setTotalTroops] = useState(100000);
  const [rounds, setRounds] = useState(12);
  const [seedRounds, setSeedRounds] = useState(2);
  const [reps, setReps] = useState(1);
  const [jobs, setJobs] = useState(defaultJobs());
  const [seed, setSeed] = useState(1234);
  const [freezeRate, setFreezeRate] = useState(0.2);
  const [freezeLossesGte, setFreezeLossesGte] = useState("");
  const [startFreezeRound, setStartFreezeRound] = useState(6);
  const [minPoolSize, setMinPoolSize] = useState(100);
  const [topN, setTopN] = useState(100);
  const [finalsTopM, setFinalsTopM] = useState(0);
  const [finalsReps, setFinalsReps] = useState(1);
  const [finalsMaxSameMainLineup, setFinalsMaxSameMainLineup] = useState(10);
  const [result, setResult] = useState<TournamentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<ResultTab>("swissOffense");
  const [sortKey, setSortKey] = useState<TournamentSortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const cancelRef = useRef<(() => void) | null>(null);

  const payload = useMemo<TournamentRequestPayload>(() => ({
    groups: groups.map(groupPayload),
    totalTroops,
    rounds,
    seedRounds,
    reps,
    jobs,
    seed,
    freezeRate,
    freezeLossesGte: freezeLossesGte.trim() === "" ? null : Number(freezeLossesGte),
    startFreezeRound,
    minPoolSize,
    topN,
    finalsTopM,
    finalsReps,
    finalsMaxSameMainLineup,
  }), [
    finalsMaxSameMainLineup,
    finalsReps,
    finalsTopM,
    freezeLossesGte,
    freezeRate,
    groups,
    jobs,
    minPoolSize,
    reps,
    rounds,
    seed,
    seedRounds,
    startFreezeRound,
    topN,
    totalTroops,
  ]);

  const teamCount = useMemo(() => estimateTournamentTeamCount(payload.groups), [payload.groups]);
  const swissBattles = estimateSwissBattles(teamCount, payload);
  const finalsBattles = estimateFinalsBattles(teamCount, payload);
  const activeRows = useMemo(() => {
    const rows = rowsForTab(result, activeTab);
    return sortTournamentRows(rows, sortKey, sortDirection);
  }, [activeTab, result, sortDirection, sortKey]);
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  async function run() {
    setError(null);
    setResult(null);
    setRunning(true);
    setProgress({ done: 0, total: swissBattles + finalsBattles });
    const job = runWorkerTournament(payload, (done, total) => setProgress({ done, total }));
    cancelRef.current = job.cancel;
    try {
      const data = await job.promise;
      setResult(data);
      setActiveTab(data.finals ? "finalsOffense" : "swissOffense");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      cancelRef.current = null;
      setRunning(false);
    }
  }

  function cancel() {
    cancelRef.current?.();
    cancelRef.current = null;
    setRunning(false);
  }

  function updateGroup(id: string, patch: Partial<BuilderGroup>) {
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...patch } : group));
  }

  function downloadRows(kind: "csv" | "json") {
    if (!activeRows.length) return;
    const extension = kind;
    const body = kind === "csv" ? tournamentRowsToCsv(activeRows) : JSON.stringify(activeRows, null, 2);
    const type = kind === "csv" ? "text/csv" : "application/json";
    downloadText(`wos-${activeTab}.${extension}`, body, type);
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: "var(--border-color)" }}>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-white">Dual Swiss Tournament</h1>
          </div>
          <div className="flex gap-2">
            {running ? (
              <button type="button" onClick={cancel} className="rounded border px-4 py-2 text-sm" style={{ borderColor: "var(--border-color)" }}>
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={run}
              disabled={running || teamCount < 2}
              className="rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run tournament
            </button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4">
            {groups.map((group, index) => (
              <GroupCard
                key={group.id}
                group={group}
                index={index}
                onChange={(patch) => updateGroup(group.id, patch)}
                onRemove={groups.length > 1 ? () => setGroups((current) => current.filter((item) => item.id !== group.id)) : undefined}
              />
            ))}
            <button
              type="button"
              onClick={() => setGroups((current) => [...current, newGroup(current.length + 1)])}
              className="rounded border px-4 py-3 text-sm text-slate-100"
              style={{ borderColor: "var(--border-color)" }}
            >
              Add batch
            </button>
          </div>

          <aside className="self-start rounded border p-4" style={{ borderColor: "var(--border-color)", backgroundColor: "#202033" }}>
            <h2 className="text-base font-semibold text-white">Options</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <NumberField label="Total troops" value={totalTroops} min={1} onChange={setTotalTroops} />
              <NumberField label="Top rows" value={topN} min={1} onChange={setTopN} />
              <NumberField label="Rounds" value={rounds} min={1} onChange={setRounds} />
              <NumberField label="Seed rounds" value={seedRounds} min={0} onChange={setSeedRounds} />
              <NumberField label="Reps" value={reps} min={1} onChange={setReps} />
              <NumberField label="Jobs" value={jobs} min={1} onChange={setJobs} />
              <NumberField label="Seed" value={seed} min={0} onChange={setSeed} />
              <NumberField label="Freeze start" value={startFreezeRound} min={1} onChange={setStartFreezeRound} />
              <NumberField label="Min pool" value={minPoolSize} min={1} onChange={setMinPoolSize} />
              <DecimalField label="Freeze rate" value={freezeRate} min={0} max={1} step={0.05} onChange={setFreezeRate} />
              <TextField label="Freeze losses" value={freezeLossesGte} placeholder="off" onChange={setFreezeLossesGte} />
              <NumberField label="Finals top" value={finalsTopM} min={0} onChange={setFinalsTopM} />
              <NumberField label="Finals reps" value={finalsReps} min={1} onChange={setFinalsReps} />
              <NumberField label="Max same mains" value={finalsMaxSameMainLineup} min={0} onChange={setFinalsMaxSameMainLineup} />
            </div>
            <div className="mt-4 rounded bg-slate-950/40 p-3 text-xs text-slate-300">
              <div className="flex justify-between"><span>Teams</span><strong>{teamCount.toLocaleString()}</strong></div>
              <div className="mt-1 flex justify-between"><span>Swiss battle reps</span><strong>{swissBattles.toLocaleString()}</strong></div>
              <div className="mt-1 flex justify-between"><span>Finals battle reps</span><strong>{finalsBattles.toLocaleString()}</strong></div>
            </div>
            {running ? (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-slate-300">
                  <span>Running</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-950">
                  <div className="h-full bg-sky-400" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            ) : null}
            {error ? <p className="mt-4 rounded border border-red-400/60 bg-red-950/40 p-3 text-sm text-red-100">{error}</p> : null}
          </aside>
        </section>

        {result ? (
          <section className="rounded border" style={{ borderColor: "var(--border-color)" }}>
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border-color)" }}>
              <div className="flex flex-wrap gap-2">
                <ResultTabButton label="Swiss offense" active={activeTab === "swissOffense"} onClick={() => setActiveTab("swissOffense")} />
                <ResultTabButton label="Swiss defense" active={activeTab === "swissDefense"} onClick={() => setActiveTab("swissDefense")} />
                {result.finals ? <ResultTabButton label="Finals offense" active={activeTab === "finalsOffense"} onClick={() => setActiveTab("finalsOffense")} /> : null}
                {result.finals ? <ResultTabButton label="Finals defense" active={activeTab === "finalsDefense"} onClick={() => setActiveTab("finalsDefense")} /> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as TournamentSortKey)}
                  className="rounded border bg-slate-950 px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  {Object.entries(SORT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <button type="button" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--border-color)" }}>
                  {sortDirection === "asc" ? "Asc" : "Desc"}
                </button>
                <button type="button" onClick={() => downloadRows("csv")} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--border-color)" }}>CSV</button>
                <button type="button" onClick={() => downloadRows("json")} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--border-color)" }}>JSON</button>
              </div>
            </div>
            <ResultsTable rows={activeRows} />
          </section>
        ) : null}
      </div>
    </main>
  );
}

function GroupCard({
  group,
  index,
  onChange,
  onRemove,
}: {
  group: BuilderGroup;
  index: number;
  onChange: (patch: Partial<BuilderGroup>) => void;
  onRemove?: () => void;
}) {
  return (
    <section className="rounded border p-4" style={{ borderColor: "var(--border-color)", backgroundColor: "#202033" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TextField label="Batch label" value={group.label} onChange={(label) => onChange({ label })} />
        {onRemove ? <button type="button" onClick={onRemove} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--border-color)" }}>Remove</button> : null}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <MultiSelect label="Infantry mains" options={INFANTRY_MAINS} selected={group.infantryMains} onChange={(infantryMains) => onChange({ infantryMains })} />
        <MultiSelect label="Lancer mains" options={LANCER_MAINS} selected={group.lancerMains} onChange={(lancerMains) => onChange({ lancerMains })} />
        <MultiSelect label="Marksman mains" options={MARKSMAN_MAINS} selected={group.marksmanMains} onChange={(marksmanMains) => onChange({ marksmanMains })} />
        <MultiSelect label="Joiners" options={DEFAULT_JOINERS} selected={group.joiners} onChange={(joiners) => onChange({ joiners })} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <TextField label="Ratios" value={group.ratioText} placeholder="60,40,0 70,30,0 59,39,2" onChange={(ratioText) => onChange({ ratioText, ratios: splitRatios(ratioText) })} />
        <label className="flex items-center gap-2 rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--border-color)" }}>
          <input type="checkbox" checked={group.allowRepeatedJoiners} onChange={(event) => onChange({ allowRepeatedJoiners: event.target.checked })} />
          Same joiner
        </label>
        <label className="flex items-center gap-2 rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--border-color)" }}>
          <input type="checkbox" checked={group.excludeMainHeroesFromJoiners} onChange={(event) => onChange({ excludeMainHeroesFromJoiners: event.target.checked })} />
          Exclude mains
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-400">Batch {index + 1}: {estimateTournamentTeamCount([groupPayload(group)]).toLocaleString()} teams</p>
    </section>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  function toggle(option: string) {
    onChange(selectedSet.has(option) ? selected.filter((value) => value !== option) : [...selected, option]);
  }
  return (
    <fieldset>
      <div className="mb-2 flex items-center justify-between gap-2">
        <legend className="text-sm font-medium text-slate-100">{label}</legend>
        <div className="flex gap-1">
          <button type="button" onClick={() => onChange([...options])} className="rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--border-color)" }}>All</button>
          <button type="button" onClick={() => onChange([])} className="rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--border-color)" }}>None</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option} className="flex min-h-9 items-center gap-2 rounded border px-2 py-1 text-sm" style={{ borderColor: selectedSet.has(option) ? "#38bdf8" : "var(--border-color)" }}>
            <input type="checkbox" checked={selectedSet.has(option)} onChange={() => toggle(option)} />
            <span className="truncate">{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ResultsTable({ rows }: { rows: TournamentResultRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-950/50 text-xs uppercase text-slate-400">
          <tr>
            {["Rank", "W-L", "Win %", "Avg margin", "Group", "Ratio", "Mains", "Joiners", "Troops"].map((head) => (
              <th key={head} className="px-3 py-2 font-medium">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.rank}-${row.teamId}`} className="border-t" style={{ borderColor: "var(--border-color)" }}>
              <td className="px-3 py-2 font-semibold text-white">{row.rank}</td>
              <td className="px-3 py-2">{row.wins}-{row.losses}</td>
              <td className="px-3 py-2">{(row.winRate * 100).toFixed(1)}%</td>
              <td className="px-3 py-2">{row.avgMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className="px-3 py-2">{row.groupLabel}</td>
              <td className="px-3 py-2">{row.ratioLabel}</td>
              <td className="px-3 py-2">{row.mains.join(" / ")}</td>
              <td className="px-3 py-2">{row.joiners.join(" / ")}</td>
              <td className="px-3 py-2">{row.troops.infantry_t10.toLocaleString()} / {row.troops.lancer_t10.toLocaleString()} / {row.troops.marksman_t10.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-3 py-2 text-sm"
      style={{ backgroundColor: active ? "#38bdf8" : "#181825", color: active ? "#020617" : "#cbd5e1" }}
    >
      {label}
    </button>
  );
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-xs text-slate-300">
      {label}
      <EditableNumberInput
        value={value}
        min={min}
        parse="int"
        onValueChange={(next) => onChange(Math.max(min ?? Number.NEGATIVE_INFINITY, next))}
        className="mt-1 h-9 w-full rounded border bg-slate-950 px-2 text-sm text-slate-100"
        style={{ borderColor: "var(--border-color)" }}
      />
    </label>
  );
}

function DecimalField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-xs text-slate-300">
      {label}
      <EditableNumberInput
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(clamp(next, min, max))}
        className="mt-1 h-9 w-full rounded border bg-slate-950 px-2 text-sm text-slate-100"
        style={{ borderColor: "var(--border-color)" }}
      />
    </label>
  );
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="block w-full text-xs text-slate-300">
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded border bg-slate-950 px-2 text-sm text-slate-100"
        style={{ borderColor: "var(--border-color)" }}
      />
    </label>
  );
}

function rowsForTab(result: TournamentResult | null, tab: ResultTab): TournamentResultRow[] {
  if (!result) return [];
  if (tab === "swissOffense") return result.swiss.offense.rows;
  if (tab === "swissDefense") return result.swiss.defense.rows;
  if (tab === "finalsOffense") return result.finals?.offense.rows ?? [];
  return result.finals?.defense.rows ?? [];
}

function splitRatios(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?/g)]
    .map((match) => match[0].replace(/\s+/g, ""));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
