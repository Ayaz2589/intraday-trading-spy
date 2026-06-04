import { useState } from "react";
import { useStartStudy } from "@/hooks/useStudies";
import type { StartStudyRequest, StudyKind } from "@/api/types";

// Feature 011: minimal launcher for a walk-forward or sensitivity study.
export function StartStudyDialog({ configName = "default" }: { configName?: string }) {
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

  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">New validation study</h3>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        <label className="stat-label">
          Kind{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value as StudyKind)}>
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
