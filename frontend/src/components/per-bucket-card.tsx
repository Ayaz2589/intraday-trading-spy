import { HelpTooltip } from "./help-tooltip";
import type { BucketView } from "@/api/legacy-types";

// Feature 010: where the edge lives (or breaks) — net PnL + trade count grouped
// by hour-of-day, weekday, and month-of-year (NY-local entry time).
function BucketRow({ b }: { b: BucketView }) {
  const tone = b.net_pnl_dollars >= 0 ? "var(--profit)" : "var(--loss)";
  const sign = b.net_pnl_dollars >= 0 ? "+" : "-";
  return (
    <div className="rej-row">
      <span className="rej-label">{b.key}</span>
      <span className="rej-count mono" style={{ color: tone }}>
        {sign}${Math.abs(b.net_pnl_dollars).toFixed(2)} · {b.trade_count}t
      </span>
    </div>
  );
}

export function PerBucketCard({
  hour,
  weekday,
  month,
}: {
  hour: BucketView[];
  weekday: BucketView[];
  month: BucketView[];
}) {
  const dims: Array<[string, BucketView[]]> = [
    ["Hour of day", hour ?? []],
    ["Weekday", weekday ?? []],
    ["Month", month ?? []],
  ];
  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Per-Bucket Performance
          <HelpTooltip helpKey="per_bucket" />
        </h3>
      </header>
      {dims.map(([title, buckets]) => (
        <div key={title} className="bucket-dim">
          <div className="stat-label">{title}</div>
          <div className="rej-list">
            {buckets.length === 0 ? (
              <div className="rej-row">
                <span className="rej-label">—</span>
              </div>
            ) : (
              buckets.map((b) => <BucketRow key={b.key} b={b} />)
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
