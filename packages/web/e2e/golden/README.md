# Golden-case parity suite

The Playwright suite of `docs/parity/04-golden-cases.md` §1 and §2: every stable-tier case page, and the Ongoing and
Create screens of mainnet and Gnosis, are extracted from production and from the new app in the same run and compared
field by field. It is the `golden` project of `../../playwright.config.ts`; `yarn test` never runs it and `yarn e2e`
runs only the `chromium` project.

```bash
yarn workspace @dispute-resolver/web playwright install chromium   # once
yarn workspace @dispute-resolver/web golden                        # builds and previews the app, then runs the suite
```

| Variable            | Default                                                            | Effect                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROD_URL`          | `https://resolve.kleros.io`                                        | Production.                                                                                                                                                                                                                                           |
| `NEW_URL`           | `http://localhost:4173` (the `vite preview` the web server starts) | The new app; set it to a deploy preview to check a PR.                                                                                                                                                                                                |
| `GOLDEN_CASES`      | all of §2                                                          | Comma-separated `chain:id` keys, for example `1:1454,100:0`.                                                                                                                                                                                          |
| `GOLDEN_SCREENS`    | on                                                                 | `0` leaves out the Ongoing and Create screens.                                                                                                                                                                                                        |
| `GOLDEN_WORKERS`    | `2`                                                                | Cases run in parallel.                                                                                                                                                                                                                                |
| `GOLDEN_ACCOUNTS`   | `golden/accounts.json`                                             | The account-context file, relative to the repository root.                                                                                                                                                                                            |
| `GOLDEN_NEW_WALLET` | from the build                                                     | `configured` or `unconfigured`: whether the new app's build has `REACT_APP_WALLETCONNECT_PROJECT_ID`. Needed for a remote `NEW_URL`; for the local preview the suite checks the environment and `.env` for the variable's presence (never its value). |

## How a case is compared

- `extract/productionCase.ts` reads the old app's DOM (CSS-module classes by their `module_name__` prefix; the collapsed
  Question section and its voting-options dropdown are opened to read the titles). Values production fetches but never
  renders (the arbitrable, `lastPeriodChange`, full evidence submitters, appeal-card ruling codes) are read from its own
  React component state (`extract/productionState.ts`).
- `extract/newCase.ts` reads the parity hooks of `ARCHITECTURE.md` §12, plus two things §12 has no hook for, read from
  what the user sees: the connected account (the header's account button) and the "Dispute summary unavailable" notice
  with its reason (D-36).
- `compare/` applies 04 §1: addresses case-insensitively (production's `0x1234...abcd` sender matches the full address),
  amounts as wei integers, markdown and evidence descriptions as text with all whitespace removed, countdowns and deadlines
  on presence and sign, withdrawable amounts only under the account context. Every evidence item the new app still shows
  is compared with its production counterpart, also when it hides others (D-22). An Ongoing period difference fails
  unless the period is later and production's own countdown says its period could have ended before the new app's
  snapshot (04 §1: only then is it a change between the two runs, compared on id and title).
- `ledger.ts` is the expected-difference table: every entry D-01 to D-56 and every proposal of `docs/ledger-proposals.md`
  with the snapshot fields it changes (a test reads the proposal headings, so a new proposal fails it until the table has
  an entry for it). A `replace` rule checks a field against the entry's expected new value instead of production; an
  `accept` rule accepts a difference that is exactly the change the entry describes. An entry with no field says where it is tested.
  Family-scoped entries (D-46, D-47, P-04, P-05) apply by the family 04 §2 names for the case, never by the family the
  new app reports. A case for which 04 §2 names no family gets an entry through its `deviations` tag in `stableTier.ts`, with
  the recorded evidence beside it (D-47 on Gnosis 41, 42, 44, 140 and 863, from their recorded bytecode). Whether a URI
  is content-addressed (P-07) is decided by core's `normalizeIpfsPath` on the value as the app wrote it. P-14 applies only
  to a case whose current ruling `stableTier.ts` records as 2²⁵⁶ − 1 on-chain (mainnet 1650 and 1657, with the block).
- `stableTier.ts` is 04 §2 as data: the highlights it states are checked on the new app (`family` on every row that
  names one), the bad disputes are checked for their degradation (D-36: the dispute info and timeline render, the
  meta-evidence section loaded or shows "unavailable" with its reason), the account-context cases of D-02 and D-30
  carry the on-chain withdrawable amount recorded for their account, with its block, and mainnet 1658 carries the
  RulingFunded event production's D-02 window missed, with the current ruling and the block both were read at.

A case fails when a field differs with no ledger entry, a 04 §2 check fails, or a page does not settle within its budget.
Two cases mark production as one that may not settle (`productionMayFail` in `stableTier.ts`): Gnosis 115, which 04 §2
records production does not load, and mainnet 1621, whose production override script reads through a shared third-party
Infura key that the suite's own load can rate-limit. When production then fails (on 1621 also by settling without its
meta-evidence), its settle check is a note with the reason (an environment result on 1621) and no field is compared; the
new app's checks (it settles, the 04 §2 highlights: on 1621 the governor family, "List 7" and "List 8", 2 evidence) still
block.
The golden project retries a failed case once (production and the RPCs are shared, and a rate limit degrades a section);
the report records the attempt. The bad-dispute preconditions 04 §2 recorded (the meta-evidence fails, or yields the
"invalid or tampered" placeholder) are reported as notes, not failures: the D-36 checks that block are that the page
renders with its dispute info and timeline and that the meta-evidence section never renders nothing.

## Account context

For a case with a contributor in `golden/accounts.json` (`yarn golden-gate accounts`), `provider.ts` injects a read-only
EIP-1193 provider with `addInitScript` that announces that account on the page's chain and refuses every signing or
sending method. Production reads it from `window.ethereum`. The new app connects a wallet only when its build has
`REACT_APP_WALLETCONNECT_PROJECT_ID` (K-02); otherwise the provider is not injected there. Each snapshot records the
account the app actually used: production's once its header left the no-account state, the new app's as its header
shows it connected. Where an app did not use the account, `appealPanel.withdrawableWei` is reported as skipped with the
reason, and a note says so. The cases whose ledger test reads that amount (D-02: Gnosis 121, 120, 118, 132, 220; D-30:
mainnet 1678, 1226) are compared with the amount recorded in `stableTier.ts` instead of production's, and fail when
either app did not use the recorded account: a run without `golden/accounts.json` or without a wallet in the new app's
build cannot pass them.

## Reports

`reports/golden-report.md` and `reports/golden-report.json` (ignored by git), plus one JSON file per screen under
`reports/cases/`. They hold both snapshots of every screen. No API key is written: the extractors store every URL in the
evidence-display parameters (the RPC URLs from `.env` or from production among them) as its host and a short SHA-256
fingerprint of the whole URL (`redact.ts`), so equal URLs still compare equal. On its way to its file each result is
redacted again: every RPC-named field and every value compared under the D-35 RPC rule (not other URLs, such as links,
which the comparison reads). The report names production and the new app by their origins, and each snapshot records
the page it loaded as the app's origin and the screen path only, without the credentials, path or query that `PROD_URL`
or `NEW_URL` may carry (a password-protected deploy preview).
