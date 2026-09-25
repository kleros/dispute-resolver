# Dispute Resolver

## Commands
- Install: `yarn install`
- Start: `yarn start`
- Build: `yarn build`
- Test: `CI=true yarn test` (plain `yarn test` starts watch mode and never exits)
- Use yarn, not npm.

## Rules
- Never commit secrets or `.env`. Don't push or open PRs.
- Keep changes to the task; don't fix unrelated issues.
- In files you touch, match the existing style unless the task says otherwise.
- New components may use cleaner patterns but must fit the current stack. Don't add or upgrade dependencies unless the task says so.
- The project uses SonarCloud. Don't introduce new code smells, but don't fix unrelated existing issues.

## Web3 code
- Handle async operations and contract-call errors explicitly.
- Follow the BigNumber handling patterns already used in the codebase.

## Domain notes
- Some arbitrables only implement IEvidence and IArbitrable; some also implement IDisputeResolver.
- Crowdfunded appeals and evidence submission are only guaranteed when the arbitrable implements IDisputeResolver; view functionality should work for all.
- Bad or non-standard disputes exist. They don't need perfect display, but must never crash the app: fail gracefully.