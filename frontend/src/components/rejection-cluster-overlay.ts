import { registerOverlay, type Chart } from "klinecharts";
import type { RejectionCluster } from "@/lib/rejection-clusters";

// rejection-cluster-overlay — KLineCharts overlay for the "Show rejections"
// chart layer. Spec FR-008 (cluster collapse with `Rej · ×N`).

const OVERLAY_NAME = "rejectionClusterTag";

// Pure helper for the visible tag text.
export function rejectionTagText(cluster: RejectionCluster): string {
  return cluster.count === 1 ? "Rej" : `Rej · ×${cluster.count}`;
}

let registered = false;

export function registerRejectionClusterOverlay(): void {
  if (registered) return;
  registered = true;
  registerOverlay({
    name: OVERLAY_NAME,
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ overlay, coordinates }) => {
      const { x, y } = coordinates[0];
      const text = String(overlay.extendData ?? "Rej");
      // Tag sits 18px above the bar's high, x-anchored on the bar's center.
      const tagY = y - 18;
      return [
        {
          type: "text",
          attrs: {
            x,
            y: tagY,
            text,
            align: "center",
            baseline: "middle",
          },
          ignoreEvent: true,
        },
      ];
    },
  });
}

export function createRejectionClusterOverlays(
  chart: Chart,
  clusters: RejectionCluster[],
  // Lookup from timestamp → bar so we can anchor above the high.
  barHighByTimestamp: Map<string, number>,
): string[] {
  registerRejectionClusterOverlay();
  const ids: string[] = [];
  for (const c of clusters) {
    const high = barHighByTimestamp.get(c.first_timestamp);
    if (high == null) continue;
    const result = chart.createOverlay({
      name: OVERLAY_NAME,
      extendData: rejectionTagText(c),
      points: [
        { timestamp: new Date(c.first_timestamp).getTime(), value: high },
      ],
      styles: {
        text: {
          color: "#ffffff",
          backgroundColor: "rgba(138, 150, 171, 0.85)", // ~--text-faint
          size: 10,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 2,
          paddingBottom: 2,
          borderRadius: 3,
        },
      },
    });
    const id = Array.isArray(result) ? result[0] : result;
    if (typeof id === "string") ids.push(id);
  }
  return ids;
}
