# TypeScript Conversion Plan for Dispute Resolver

## Project Overview
- **Current State**: React application using JavaScript (JS/JSX)
- **Total Files**: 29 source files (28 JS/JSX files + 1 test file)
- **Build Tool**: Create React App (react-scripts 4.0.0)
- **TypeScript**: Already installed (v5.5.4) but not configured

## Phase 1: Initial Setup and Configuration

### 1.1 Create TypeScript Configuration
- Create `tsconfig.json` based on existing `jsconfig.json`
- Configure for React 17 and ES2020+ features
- Enable strict mode gradually
- Set up path aliases (baseUrl: "src")

### 1.2 Install Type Definitions
**Required @types packages:**
```bash
@types/react @types/react-dom @types/react-router-dom @types/react-router-bootstrap
@types/bootstrap @types/jquery @types/lodash.debounce @types/lodash.throttle
@types/styled-components @types/react-dropzone @types/react-is
```

### 1.3 Create Custom Type Declarations
Create `src/types` directory for packages without types:
- `@kleros/*` packages
- `@alch/alchemy-web3`
- `@reality.eth/reality-eth-lib`
- React components without types (react-blockies, react-countdown, etc.)

## Phase 2: Core Infrastructure Conversion

### 2.1 Ethereum/Blockchain Layer (Priority: Critical)
Convert in order:
1. `src/ethereum/interface.js` - Contract interfaces and utilities
2. `src/ethereum/network-contract-mapping.js` - Network configurations
3. `src/ethereum/whitelistedArbitrables.js` - Whitelist data

**Key typing needs:**
- Contract ABIs and interfaces
- Web3/Ethers provider types
- Network configuration types
- Address and transaction types

### 2.2 Utility Functions
Convert standalone utilities:
1. `src/ipfs-publish.js` - IPFS publishing
2. `src/urlNormalizer.js` - URL normalization

## Phase 3: Component Conversion (Bottom-Up Approach)

### 3.1 Leaf Components (No dependencies on other components)
Convert simple presentational components first:
1. `src/components/alertMessage.js`
2. `src/components/toast.js`
3. `src/components/ipfs.js`
4. `src/components/unsupportedNetwork.jsx`
5. `src/components/footer.js`

### 3.2 Form Components
1. `src/components/FileUploadDropzone.js`
2. `src/components/datetimePicker.js`
3. `src/components/createForm.js` (complex form with validation)
4. `src/components/createSummary.js`

### 3.3 Display Components
1. `src/components/ongoing-card.js`
2. `src/components/crowdfundingCard.js`
3. `src/components/disputeSummary.js`
4. `src/components/disputeDetails.js`
5. `src/components/disputeTimeline.js`
6. `src/components/evidenceTimeline.js`

### 3.4 Layout Components
1. `src/components/header.js` - Navigation header

## Phase 4: Container/Page Components

Convert page-level components:
1. `src/containers/404.js` - Simple error page
2. `src/containers/create.js` - Dispute creation page
3. `src/containers/open-disputes.js` - Dispute listing page
4. `src/containers/interact.js` - Dispute interaction page (most complex)

## Phase 5: Application Root

### 5.1 Main Application
1. `src/app.js` - Main App component (1100+ lines, highest complexity)
   - Contains Web3 initialization
   - State management
   - Route configuration
   - Contract interactions

### 5.2 Entry Point
1. `src/index.js` - Application entry point

### 5.3 Tests
1. `src/app.test.js` - Convert test file to TypeScript

## Phase 6: Advanced TypeScript Features

### 6.1 Type Safety Improvements
- Create proper types for:
  - Contract method parameters and returns
  - Event types from smart contracts
  - MetaEvidence and Evidence structures
  - Dispute and Subcourt data structures

### 6.2 Generic Types
- Component props with proper generics
- Contract interaction utilities
- API response types

### 6.3 Type Guards and Utilities
- BigNumber type guards
- Network validation utilities
- Safe parsing utilities

## Conversion Strategy

### File Conversion Process
1. Rename `.js` to `.ts` (or `.jsx` to `.tsx`)
2. Add explicit type annotations for:
   - Function parameters and returns
   - Component props
   - State interfaces
   - Event handlers
3. Replace `PropTypes` with TypeScript interfaces
4. Fix type errors incrementally
5. Enable stricter compiler options gradually

### Testing Strategy
- Run existing tests after each component conversion
- Add type tests for critical interfaces
- Ensure no runtime behavior changes

### Migration Commands
```bash
# Initial setup
npm install --save-dev @types/[package-name]

# Rename files (example)
mv src/components/footer.js src/components/footer.tsx

# Type check
npm run tsc --noEmit

# Build
npm run build
```

## Risk Mitigation

### High-Risk Areas
1. **Web3/Ethers Integration**: Complex async operations and BigNumber handling
2. **Dynamic Contract Calls**: Need careful typing for contract methods
3. **Event Handling**: Browser and blockchain events need proper typing
4. **Route Parameters**: Dynamic routing with TypeScript

### Mitigation Strategies
- Start with `any` types and refine gradually
- Use `unknown` instead of `any` where possible
- Create comprehensive interface definitions
- Test thoroughly after each conversion
- Keep original JS files as backup until conversion is stable

## Timeline Estimate

- **Phase 1**: 2-3 days (setup and configuration)
- **Phase 2**: 3-4 days (core infrastructure)
- **Phase 3**: 5-7 days (components)
- **Phase 4**: 4-5 days (containers)
- **Phase 5**: 3-4 days (app root)
- **Phase 6**: 2-3 days (refinements)

**Total**: 3-4 weeks for complete conversion

## Success Metrics

- All files converted to TypeScript
- No `any` types in critical paths
- All tests passing
- No runtime errors
- Improved IDE support and autocomplete
- Type coverage > 90%

## Next Steps

1. Create `tsconfig.json`
2. Install required @types packages
3. Set up custom type declarations structure
4. Begin Phase 2 with ethereum layer conversion
5. Proceed systematically through each phase