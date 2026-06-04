import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StartStudyDialog } from "@/components/validation/start-study-dialog";
import { LockboxGate } from "@/components/validation/lockbox-gate";
import { useConfigs } from "@/hooks/useConfigs";
import { useLockboxStatus, useRunLockbox, useStudies } from "@/hooks/useStudies";

export const Route = createFileRoute("/_authenticated/validation")({
  component: ValidationPage,
});

function ValidationPage() {
  const studies = useStudies();
  const lockbox = useLockboxStatus();
  const runLockbox = useRunLockbox();
  const configsQuery = useConfigs();
  const configs = configsQuery.data?.configs ?? [];
  const [lockboxConfig, setLockboxConfig] = useState("default");

  return (
    <div style={{ padding: "var(--sp-5)", display: "grid", gap: "var(--sp-5)", maxWidth: 900 }}>
      <h2>Validation</h2>
      <StartStudyDialog />

      <section className="card">
        <header className="card-head">
          <h3 className="card-title">Studies</h3>
        </header>
        {studies.isLoading ? (
          <div className="stat-label">Loading…</div>
        ) : (studies.data?.studies ?? []).length === 0 ? (
          <div className="stat-label">No studies yet — launch one above.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {studies.data!.studies.map((s) => (
              <li key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <Link to="/validation/$studyId" params={{ studyId: s.id }}>
                  {s.kind} · {s.status} · {s.progress_completed}/{s.progress_total}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lockbox.data && (
        <div style={{ display: "grid", gap: "var(--sp-2)" }}>
          <label className="stat-label">
            Candidate config to freeze{" "}
            <select
              aria-label="lockbox config"
              value={lockboxConfig}
              onChange={(e) => setLockboxConfig(e.target.value)}
            >
              {(configs.length > 0 ? configs.map((c) => c.name) : ["default"]).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <LockboxGate
            status={lockbox.data}
            running={runLockbox.isPending}
            onRun={(override) => runLockbox.mutate({ config_name: lockboxConfig, override })}
          />
        </div>
      )}
    </div>
  );
}
