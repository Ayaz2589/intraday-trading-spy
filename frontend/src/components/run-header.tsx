import type { RunManifestView } from "@/api/types";

export function RunHeader({ manifest }: { manifest: RunManifestView }) {
  return (
    <header className="border-b border-gray-200 dark:border-slate-700 p-4 flex flex-col gap-1">
      <h1 className="text-xl font-mono">{manifest.run_id}</h1>
      <div className="text-sm text-gray-500 dark:text-slate-400 flex gap-4 flex-wrap">
        <span>
          started {new Date(manifest.run_started_at).toLocaleString()}
        </span>
        <span>code {manifest.code_version}</span>
        <span>data {manifest.data_fingerprint.sha256.slice(0, 8)}</span>
      </div>
    </header>
  );
}
