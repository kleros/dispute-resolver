# Case details page checks
- `fixture-gnosis`: cases 1011 (real, view-only), 900001 (multi-select appeal), 900002 (free-value), 900003 (no meta-evidence), 999999 (malformed), 123456789 (not found).
- `fixture-gnosis`: section order is case card, then summary, in every period the fixtures cover (evidence, commit, vote and appeal).
- `fixture-gnosis`: typing in the search changes nothing on the current case. Enter opens the new case. Back returns to the previous one.
- `fixture-signed-in`: fund on 900001 shows pending, then success.
- `fixture-writes-fail`: fund on 900001 shows failure feedback, amount kept.
- `fixture-delay`: placeholders while loading, never "unavailable".
- `fixture-fail`: "Failed to load dispute" with a retry.
- `fixture-fail-reads`: the failed sections say unavailable; the rest stays visible.
- `real`: /100/cases/1011 loads in one step.