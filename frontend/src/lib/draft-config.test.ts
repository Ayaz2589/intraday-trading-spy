import { describe, it, expect } from "vitest";
import { encodeDraft, decodeDraft, type DraftConfig } from "./draft-config";

const DRAFT: DraftConfig = {
  base_config_name: "wf-rr3",
  changes: [
    { knob_path: "strategy.vwap_pullback.target.risk_reward", value: 2.5 },
  ],
  analysis_id: "d7e75317-4fd5-4d23-967d-a326c62c9c5b",
  experiment_index: 0,
  hypothesis: "Test a wider risk:reward",
};

describe("draft-config encode/decode", () => {
  it("round-trips a draft", () => {
    expect(decodeDraft(encodeDraft(DRAFT))).toEqual(DRAFT);
  });

  it("returns null for garbage, wrong-shape JSON, and oversized input — never throws", () => {
    expect(decodeDraft("not-base64!!!")).toBeNull();
    expect(decodeDraft(btoa(JSON.stringify({ hello: "world" })))).toBeNull();
    expect(decodeDraft(btoa(JSON.stringify({ ...DRAFT, changes: "nope" })))).toBeNull();
    expect(decodeDraft("A".repeat(20000))).toBeNull();
    expect(decodeDraft("")).toBeNull();
  });
});
