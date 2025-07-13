# Fast Testing Strategy for Dispute Resolver (1 hour → 1 minute)

## Current Testing Pain Points Identified
- **Blockchain dependency**: Creating disputes, waiting for periods to pass, checking evidence display
- **Time-dependent periods**: Evidence → Voting → Appeal → Execution phases
- **Dynamic script evaluation**: `evidenceDisplayInterfaceURI` iframe with injected blockchain data
- **Complex state management**: Multiple contract interactions, event filtering, async calls

## Comprehensive Testing Solution

### 1. **Mock Blockchain Layer** 
- **Mock contract factory** (`getContract`, `getSignableContract`) 
- **Stub all async contract methods**: `arbitrationCost()`, `createDispute()`, `getDispute()`, `currentRuling()`, `appealCost()`, `submitEvidence()`
- **Mock event filtering**: Replace `queryFilter()` with predefined event datasets
- **Mock transaction flows**: Instant "confirmation" instead of `tx.wait()`

### 2. **Test Data Fixtures**
- **Pre-built dispute states**: Evidence period, Voting period, Appeal period, Execution period
- **Sample evidence sets**: Valid/invalid evidence, different file types, IPFS URIs
- **Mock contract responses**: Dispute details, subcourt info, appeal costs, contributions
- **Time-controlled periods**: Fast-forward dispute timelines instantly

### 3. **Evidence Display Testing**
- **Mock iframe injection**: Test `evidenceDisplayInterfaceURI` with mock `injectedArgs`
- **Sandbox testing**: Validate script execution without network calls
- **Dynamic content simulation**: Test evidence rendering with various data shapes

### 4. **Development Environment**
- **Local test mode**: Environment variable to enable mock mode
- **Instant period transitions**: Button/command to advance dispute periods
- **Pre-seeded disputes**: Database of test disputes in different states
- **Hot reload with state**: Maintain dispute state across code changes

### 5. **Automated Test Scenarios** 
- **End-to-end flows**: Create dispute → Submit evidence → Period transitions → Appeals
- **Visual regression**: Evidence display rendering across different dispute types
- **Edge cases**: Invalid evidence, network failures, period boundary conditions
- **Performance testing**: Large evidence sets, multiple disputes

### 6. **Implementation Tools**
- **Jest + React Testing Library**: Component-level mocking
- **MSW (Mock Service Worker)**: IPFS and blockchain API mocking  
- **Hardhat Network**: Local blockchain with instant mining
- **Storybook**: Isolated component testing with mock data
- **Custom test utils**: Helper functions for dispute state management

This approach transforms 1-hour manual testing cycles into 1-minute automated test suites while providing comprehensive coverage of all dispute resolver functionality.

## Key Blockchain Interaction Points to Mock

### Dispute Creation and Fetching Patterns
**File: `src/app.js`**
- `createDispute()` (lines 897-952): Creates disputes via ArbitrableProxy contract
- `getArbitratorDispute()` (lines 389-404): Fetches dispute details from KlerosLiquid
- `getArbitratorDisputeDetails()` (lines 406-421): Gets detailed dispute info
- `getArbitrableDisputeID()` (lines 286-299): Maps arbitrator to arbitrable dispute IDs
- `getOpenDisputesOnCourt()` (lines 259-284): Queries NewPeriod and DisputeCreation events

### Period Change Detection Patterns
**File: `src/app.js`**
- NewPeriod event filtering (lines 271-272): `contract.filters.NewPeriod()` 
- Period-based logic in `getContributions()` (lines 666-719)
- Appeal period tracking (lines 477-492): `contract.appealPeriod()`
- Period-based execution logic in interact.js (lines 188-219)

### Evidence Submission and Validation Patterns
**File: `src/app.js`**
- `submitEvidence()` (lines 864-895): Submits evidence via ArbitrableProxy
- `getEvidences()` (lines 623-630): Fetches evidence using Archon library
- `getMetaEvidence()` (lines 516-568): Retrieves meta evidence from IPFS
- MetaEvidence event filtering (lines 530-535)

### Async/Await Patterns for Blockchain Calls
**Key async patterns found:**
- Contract method calls with `await` (lines 294, 309, 327, 365, etc.)
- Transaction waiting with `tx.wait()` (lines 890, 933, 966, 999)
- Promise.all() for parallel blockchain calls (lines 153-163 in interact.js)
- Event querying with `queryFilter()` (lines 272, 275, 531, 595, 643, 697, 761)

### Contract Method Calls and Event Listening
**Contract Interface Usage:** `src/ethereum/interface.js`
- `getContract()` and `getSignableContract()` factory functions
- Support for multiple contract types: KlerosLiquid, IDisputeResolver, ArbitrableProxy, etc.

**Event Listening Patterns:**
- MetaMask account/chain change listeners (lines 90-97 in app.js)
- Event filters for DisputeCreation, NewPeriod, MetaEvidence, Contribution, RulingFunded, AppealDecision
- Block range querying with `queryFilter(filter, fromBlock, toBlock)`

**Key Contract Methods that need mocking:**
- `arbitrationCost()`, `appealCost()`, `currentRuling()`, `disputes()`, `getDispute()`
- `submitEvidence()`, `createDispute()`, `fundAppeal()`, `withdrawFeesAndRewardsForAllRounds()`
- `getSubcourt()`, `policies()`, `getTotalWithdrawableAmount()`, `getMultipliers()`

### Evidence Display Interface
**File: `src/components/disputeSummary.js`**
- `evidenceDisplayInterfaceURI` iframe rendering (lines 61-73)
- Dynamic script injection with `injectedArgs` (lines 29-51)
- Sandbox control based on whitelisted arbitrables (lines 63-67)

### Time-Dependent Dispute Periods
**File: `src/components/disputeTimeline.js`**
- Period constants: Evidence (0), Voting (2), Appeal (3), Execution (4)
- Period status calculation: current, past, upcoming
- Countdown timers based on `lastPeriodChange` and `timesPerPeriod`
- Evidence submission enabled only in periods 0-3 (evidenceTimeline.js:162)