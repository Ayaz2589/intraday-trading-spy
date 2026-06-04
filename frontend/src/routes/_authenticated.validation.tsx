import { createFileRoute, Link } from "@tanstack/react-router";
import { StartStudyDialog } from "@/components/validation/start-study-dialog";
import { LockboxGate } from "@/components/validation/lockbox-gate";
import { useLockboxStatus, useRunLockbox, useStudies } from "@/hooks/useStudies";

export const Route = createFileRoute("/_authenticated/validation")({
  component: ValidationPage,
});

function ValidationPage() {
  const studies = useStudies();
  const lockbox = useLockboxStatus();
  const runLockbox = useRunLockbox();

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
        <LockboxGate
          status={lockbox.data}
          running={runLockbox.isPending}
          onRun={(override) => runLockbox.mutate({ config_name: "default", override })}
        />
      )}
    </div>
  );
}
