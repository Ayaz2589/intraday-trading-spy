import { useState } from "react";
import { useConfigs } from "@/hooks/useConfigs";
import { useStartStudy } from "@/hooks/useStudies";
import type { StartStudyRequest, StudyKind } from "@/api/types";

// Feature 011: launcher for a walk-forward or sensitivity study. The config
// picker lets each study test a DIFFERENT saved config — walk-forward over a
// single config is deterministic, so varying the config (or sweeping knobs via
// sensitivity) is how you actually do research.
export function StartStudyDialog({ defaultConfig = "default" }: { defaultConfig?: string }) {
  const configsQuery = useConfigs();
  const configs = configsQuery.data?.configs ?? [];
  // Pre-select the active config (Feature 012); the user can still pick another.
  const activeName = configs.find((c) => c.is_active)?.name;
  const [picked, setPicked] = useState<string | null>(null);
  const configName = picked ?? activeName ?? defaultConfig;
  const [kind, setKind] = useState<StudyKind>("walk_forward");
  const [knob, setKnob] = useState("strategy.vwap_pullback.target.risk_reward");
  const [values, setValues] = useState("1.5, 2.0, 2.5, 3.0");
  const start = useStartStudy();

  function launch() {
    const body: StartStudyRequest = { kind, config_name: configName };
    if (kind === "sensitivity") {
      const parsed = values.split(",").map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v));
      body.grid = [{ knob, values: parsed }];
      body.segment = "train";
    }
    start.mutate(body);
  }

  // Always offer the chosen default even before the list loads / if empty.
  const options = configs.length > 0 ? configs.map((c) => c.name) : [defaultConfig];

  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">New validation study</h3>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        <label className="stat-label">
          Config{" "}
          <select aria-label="config" value={configName} onChange={(e) => setPicked(e.target.value)}>
            {options.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="stat-label">
          Kind{" "}
          <select aria-label="kind" value={kind} onChange={(e) => setKind(e.target.value as StudyKind)}>
            <option value="walk_forward">Walk-forward</option>
            <option value="sensitivity">Sensitivity</option>
          </select>
        </label>
        {kind === "sensitivity" && (
          <>
            <label className="stat-label">
              Knob <input value={knob} onChange={(e) => setKnob(e.target.value)} style={{ width: "100%" }} />
            </label>
            <label className="stat-label">
              Values <input value={values} onChange={(e) => setValues(e.target.value)} style={{ width: "100%" }} />
            </label>
          </>
        )}
        <button type="button" className="btn btn-primary" disabled={start.isPending} onClick={launch}>
          {start.isPending ? "Launching…" : "Launch study"}
        </button>
        {start.isError && <div style={{ color: "var(--loss)" }}>{start.error.message}</div>}
        {start.isSuccess && (
          <div className="stat-label">
            Launched · {start.data.planned_evaluations} evaluations planned
          </div>
        )}
      </div>
    </section>
  );
}
