import { expectTypeOf, test } from "vitest";
import type {
  RunSummaryView,
  JournalRowView,
  BarView,
  RunManifestView,
  JournalFilter,
} from "./types";

test("types are exported and have the expected shape", () => {
  expectTypeOf<RunSummaryView["run_id"]>().toBeString();
  expectTypeOf<JournalRowView["status"]>().not.toBeNever();
  expectTypeOf<BarView["symbol"]>().toEqualTypeOf<"SPY">();
  expectTypeOf<RunManifestView["data_fingerprint"]["sha256"]>().toBeString();
  expectTypeOf<JournalFilter>().toMatchTypeOf<
    "all" | "executed" | "exited" | "rejected" | "lockout" | "force_flat"
  >();
});
