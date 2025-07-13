# AI Agent SonarCloud Workflow

## Overview

This document outlines the workflow for AI agents working with this codebase to ensure compliance with SonarCloud quality standards using the existing SonarQube extension.

## Prerequisites

- SonarQube extension is installed and configured in your IDE
- Extension is connected to the SonarCloud project
- Real-time analysis is enabled

## Workflow Steps

### 1. Before Making Any Changes

#### Check Current State
```bash
# Run quality check
./scripts/check-quality.sh

# Check specific file
./scripts/pre-change-check.sh src/path/to/file.js
```

#### Review IDE Diagnostics
- Open the file in your IDE
- Check the Problems panel for SonarCloud issues
- Look for SonarLint annotations in the code
- Note any existing issues that should be fixed

### 2. During Development

#### Follow SonarCloud Patterns
- **Code Style**: Match existing code patterns
- **Error Handling**: Use try/catch for async operations
- **Security**: Avoid eval(), innerHTML, document.write
- **Complexity**: Keep functions small and focused
- **Performance**: Avoid unnecessary computations

#### Common SonarCloud Rules to Follow

**JavaScript/React Specific:**
- Use `const` and `let` instead of `var`
- Prefer arrow functions for callbacks
- Use proper error handling for async operations
- Avoid console.log in production code
- Use meaningful variable names
- Keep functions under 50 lines when possible

**React Component Patterns:**
- Use hooks appropriately
- Avoid direct state mutations
- Use proper prop types
- Handle component lifecycle correctly

**Web3/Ethereum Patterns:**
- Handle BigNumber operations carefully
- Use proper error handling for contract calls
- Validate addresses and parameters
- Use safe arithmetic operations

### 3. After Making Changes

#### Verify Quality
```bash
# Quick check for common issues
./scripts/check-quality.sh

# Check modified file specifically
./scripts/pre-change-check.sh src/path/to/modified/file.js
```

#### IDE Verification
- Check Problems panel for new issues
- Ensure no new SonarCloud warnings appear
- Verify existing issues are fixed (if touched)

### 4. Quality Gates

#### Must Fix (Blocker/Critical)
- Security vulnerabilities
- Major bugs or logic errors
- Critical performance issues

#### Should Fix (Major)
- Code smells in modified files
- Maintainability issues
- Performance improvements

#### Can Fix (Minor)
- Style inconsistencies
- Documentation improvements
- Minor optimizations

## Common SonarCloud Issues and Solutions

### 1. Complexity Issues
```javascript
// ❌ Too complex
function processData(data) {
  if (data && data.length > 0) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].status === 'active') {
        // lots of nested logic...
      }
    }
  }
}

// ✅ Simplified
function processData(data) {
  if (!data?.length) return;
  
  const activeItems = data.filter(item => item.status === 'active');
  return activeItems.map(processActiveItem);
}

function processActiveItem(item) {
  // focused logic
}
```

### 2. Async/Await Error Handling
```javascript
// ❌ No error handling
async function fetchData() {
  const response = await fetch('/api/data');
  return response.json();
}

// ✅ Proper error handling
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}
```

### 3. React Component Issues
```javascript
// ❌ Direct state mutation
this.state.items.push(newItem);

// ✅ Proper state update
this.setState(prevState => ({
  items: [...prevState.items, newItem]
}));
```

### 4. Web3 Patterns
```javascript
// ❌ No validation
function transfer(address, amount) {
  contract.transfer(address, amount);
}

// ✅ Proper validation
function transfer(address, amount) {
  if (!ethers.utils.isAddress(address)) {
    throw new Error('Invalid address');
  }
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  return contract.transfer(address, amount);
}
```

## AI Agent Best Practices

### 1. Proactive Quality Checking
- Always check file quality before modifications
- Use IDE diagnostics as primary source of truth
- Run scripts to understand current state

### 2. Incremental Improvements
- Fix existing issues when touching files
- Don't introduce new quality issues
- Maintain or improve overall quality score

### 3. Documentation
- Update comments when changing logic
- Document complex business rules
- Explain Web3/blockchain specific patterns

### 4. Testing
- Run existing tests after changes
- Ensure no regressions
- Add tests for new functionality

## Troubleshooting

### SonarQube Extension Issues
- Restart VS Code if analysis stops working
- Check extension status in VS Code
- Verify connection to SonarCloud project

### Common Problems
- **No diagnostics appearing**: Check extension configuration
- **Too many false positives**: Review SonarCloud project settings
- **Performance issues**: Consider excluding large files from analysis

## Resources

- [SonarCloud Documentation](https://docs.sonarcloud.io/)
- [SonarLint VS Code Extension](https://marketplace.visualstudio.com/items?itemName=SonarSource.sonarlint-vscode)
- [Project CLAUDE.md](../CLAUDE.md) - AI agent guidelines
- [Quality Check Script](../scripts/check-quality.sh)

## Summary

This workflow ensures that AI agents can effectively use the existing SonarQube extension to maintain code quality without requiring additional tools. The key is to leverage the real-time feedback from the IDE and follow established patterns in the codebase.