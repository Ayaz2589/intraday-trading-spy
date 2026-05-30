import type { RunManifestView } from "@/api/types";
import { formatRunTitle, runIdHash } from "@/lib/format";

// RunHeader — restyled per design handoff's .run-header block.
// Spec FR-001, FR-004 (mono numerics).
export function RunHeader({ manifest }: { manifest: RunManifestView }) {
  const totalR = manifest.summary?.total_r ?? 0;
  const positive = totalR >= 0;
  return (
    <header className="run-header">
      <div className="rh-main">
        <h1 className="rh-title">{formatRunTitle(manifest.run_started_at)}</h1>
        <span
          className={`badge badge-xs ${
            positive ? "badge-profit" : "badge-loss"
          }`}
        >
          complete
        </span>
      </div>
      <div className="rh-meta">
        <span>
          <b>Run</b>
          <code className="mono">{runIdHash(manifest.run_id)}</code>
        </span>
        <span className="rh-dot" />
        <span>
          <b>Started</b>
          {new Date(manifest.run_started_at).toLocaleString()}
        </span>
        <span className="rh-dot" />
        <span>
          <b>Code</b>
          <code className="mono">{manifest.code_version.slice(0, 12)}…</code>
        </span>
        <span className="rh-dot" />
        <span>
          <b>Data</b>
          <code className="mono">
            {manifest.data_fingerprint.sha256.slice(0, 8)}
          </code>
        </span>
      </div>
    </header>
  );
}
