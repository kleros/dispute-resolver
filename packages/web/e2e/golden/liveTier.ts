import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { StableCase } from "./stableTier";

// The live tier of docs/parity/04-golden-cases.md §3: the disputes `yarn golden-gate live` picked at run time, per chain
// and per period 0 to 3, from `golden/live.json`. Each pick runs as a golden case with the period-dependent checks of
// 04 §3 (liveChecks.ts), and with the family the selection recorded for it as its `family` highlight. `GOLDEN_LIVE`
// narrows the run: `0` runs none, `100:1,1:3` runs those `chain:period` picks.

const PERIOD_NAMES = ["evidence", "commit", "vote", "appeal"] as const;

const pickSchema = z.object({
  disputeId: z.number().int().nonnegative(),
  arbitrable: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** The arbitrable's family (06 §1) the selection detected; absent from a selection written before picks recorded it. */
  family: z.string().min(1).optional(),
  period: z.number().int().min(0).max(3),
});

const chainSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    chainId: z.number().int().positive(),
    blockNumber: z.number().int().nonnegative(),
    periods: z.object({ "0": pickSchema.nullable(), "1": pickSchema.nullable(), "2": pickSchema.nullable(), "3": pickSchema.nullable() }),
  }),
  z.object({ status: z.literal("failed"), chainId: z.number().int().positive(), message: z.string() }),
]);

const liveFileSchema = z.object({ generatedAt: z.string(), chains: z.array(chainSchema) });

type LiveChain = z.infer<typeof chainSchema>;

export type LiveTierEntry =
  | {
      readonly kind: "case";
      /** `chain:period`, the key `GOLDEN_LIVE` selects it by. */
      readonly key: string;
      readonly testCase: StableCase;
      /** The period the dispute was picked in. */
      readonly period: number;
      /** The block the selection was taken at. */
      readonly block: number;
    }
  | { readonly kind: "skipped"; readonly key: string; readonly reason: string };

function chainEntries(chain: LiveChain, generatedAt: string): LiveTierEntry[] {
  if (chain.status === "failed") return [{ kind: "skipped", key: chain.chainId.toString(), reason: `the live selection failed on this chain: ${chain.message}` }];
  return PERIOD_NAMES.map((name, period): LiveTierEntry => {
    const key = `${chain.chainId.toString()}:${period.toString()}`;
    const pick = chain.periods[period.toString() as keyof typeof chain.periods];
    if (pick === null)
      return { kind: "skipped", key, reason: `no open dispute in the ${name} period at block ${chain.blockNumber.toString()} (golden/live.json of ${generatedAt})` };
    return {
      kind: "case",
      key,
      period,
      block: chain.blockNumber,
      testCase: {
        chainId: chain.chainId,
        disputeId: pick.disputeId,
        arbitrable: pick.arbitrable,
        exercises: `live tier: the newest dispute in the ${name} period at block ${chain.blockNumber.toString()} (04 §3)`,
        // The recorded family stands for 04 §2's `family` highlight: the new app is held to it, and the family's ledger
        // rules key on it (D-47), never on the family the new app reports.
        ...(pick.family === undefined ? {} : { highlights: { family: pick.family } }),
      },
    };
  });
}

/** The live-tier picks of `file`, narrowed by `filter` (`GOLDEN_LIVE`); a missing file is one skipped entry saying how to write it. */
export function loadLiveTier(file: string, filter: string | undefined): LiveTierEntry[] {
  const selection = filter?.trim() ?? "";
  if (selection === "0") return [];
  if (!existsSync(file)) return [{ kind: "skipped", key: "live.json", reason: "golden/live.json is missing; run `yarn golden-gate live` to select the live tier (04 §3)" }];
  const parsed = liveFileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`golden/live.json does not have the shape \`yarn golden-gate live\` writes: ${parsed.error.message}`);
  const entries = parsed.data.chains.flatMap((chain) => chainEntries(chain, parsed.data.generatedAt));
  if (selection === "") return entries;
  const keys = selection.split(",").map((key) => key.trim());
  // A failed chain's entry is keyed by the chain alone: it stands for every period of that chain.
  return entries.filter((entry) => keys.some((key) => key === entry.key || key.startsWith(`${entry.key}:`)));
}
