# Architecture decision records

Decisions that are hard to reverse, surprising without context, and the result of a real trade-off. Numbered sequentially; a new record takes the next number. Format: a title and a few sentences on context, decision and reasoning; `Considered options` and `Consequences` only where they add something.

| # | Decision | Status |
|---|---|---|
| [0001](0001-greenfield-rewrite-in-the-same-repository.md) | Rebuild from scratch in this repository against a frozen behavioral spec | accepted |
| [0002](0002-application-stack.md) | Vite, React 18, viem and wagmi with Reown AppKit, the Kleros UI components library, the shared Atlas client | accepted |
| [0003](0003-arbitrable-family-registry.md) | Per-arbitrable behavior in one registry; generic rule first, every data entry justified | accepted |
| [0004](0004-dynamic-script-isolation.md) | Dynamic scripts in a dedicated opaque-origin runner page with explicit UTF-8; no `allow-same-origin` for scripts | accepted |

The behavioral spec, security checklist, golden cases and deviations ledger these records refer to live in `docs/parity/` (frozen on 2026-10-14).
