# Claude AI Agent Guidelines for Dispute Resolver

## Code Quality Standards

This project uses SonarCloud for code quality analysis. The SonarQube extension is already configured and connected to our SonarCloud project.

### Before Making Any Code Changes

1. **Check Current Diagnostics**: Review any existing SonarCloud issues in files you plan to modify
2. **Understand Context**: Read the existing code patterns and follow established conventions
3. **Plan Changes**: Ensure changes align with SonarCloud quality profile

### During Code Development

1. **Follow SonarCloud Rules**: Never introduce code that would trigger SonarCloud warnings
2. **Fix Existing Issues**: When modifying a file, fix any existing SonarCloud issues if possible
3. **Maintain Quality**: Ensure all new code meets or exceeds current quality standards

### After Code Changes

1. **Verify No New Issues**: Check that no new SonarCloud diagnostics appear
2. **Test Functionality**: Ensure changes work correctly
3. **Document Changes**: Update comments and documentation as needed

## SonarCloud Quality Gates

- **Critical/Blocker Issues**: Must be fixed immediately
- **Major Issues**: Should be fixed when touching the code
- **Minor Issues**: Fix opportunistically

## Project-Specific Patterns

### Web3/Ethereum Code
- Always handle async operations properly
- Use proper error handling for contract calls
- Follow BigNumber handling patterns established in the codebase

### React Components
- Use hooks appropriately and follow React best practices
- Maintain consistent prop types and state management
- Follow established component structure patterns

### Testing
- Run existing tests after changes: `npm test`
- Ensure no regressions in functionality
- Add tests for new features when appropriate

## Commands to Run

```bash
# Start development server
npm start

# Run tests
npm test

# Build for production
npm run build

# Check for issues (if available)
npm run lint
```

## Quality Metrics

- Maintain or improve SonarCloud quality rating
- Keep code coverage stable or increasing
- Ensure no security issues are introduced
- Follow established code style and patterns

## Kleros Arbitration Standards (ERC-792 & ERC-1497)

[... previous content remains unchanged ...]

## Memories and Learning Notes

### Interface Compatibility and Dispute Handling
- Some arbitrables we load only implement IEvidence and IArbitrable, some implement IDisputeResolver in addition. 
- Crowdfunded appeal and evidence submission functionalities are only guaranteed to work if the arbitrable implements IDisputeResolver. 
- Other view functionality should work just fine.
- There might be bad disputes, such as those that are badly configured and do not follow the standard. 
- We don't have to figure out how to display them perfectly, but we must make sure they don't crash the application altogether. 
- When a bad dispute is encountered, the application should fail gracefully.

[... rest of the previous content remains unchanged ...]