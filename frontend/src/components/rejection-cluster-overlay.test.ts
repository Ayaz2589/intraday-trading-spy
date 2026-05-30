import { describe, it, expect } from "vitest";
import { rejectionTagText } from "./rejection-cluster-overlay";
import type { RejectionCluster } from "@/lib/rejection-clusters";

function makeCluster(count: number, check = "X"): RejectionCluster {
  return {
    rejection_check: check,
    first_timestamp: "2026-05-26T09:30:00-04:00",
    last_timestamp: "2026-05-26T09:30:00-04:00",
    timestamps: Array.from({ length: count }, (_, i) => `t${i}`),
    count,
  };
}

describe("rejectionTagText", () => {
  it("renders 'Rej' for a single-bar cluster", () => {
    expect(rejectionTagText(makeCluster(1))).toBe("Rej");
  });

  it("renders 'Rej · ×N' for N>1 (T-CLUSTER-7 visual spec)", () => {
    expect(rejectionTagText(makeCluster(2))).toBe("Rej · ×2");
    expect(rejectionTagText(makeCluster(27))).toBe("Rej · ×27");
  });
});
