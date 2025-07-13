# AI Agent SonarCloud Integration Plan

## Overview
This plan outlines how to configure your local AI agent to automatically follow and enforce your SonarCloud rules without needing a separate local linting tool.

## Integration Approach

### 1. SonarLint CLI Integration

The most effective way for an AI agent to follow SonarCloud rules is to use SonarLint CLI, which can:
- Connect directly to your SonarCloud project
- Download and apply your exact ruleset
- Provide the same analysis locally that SonarCloud runs in CI/CD

### 2. Setup Instructions

#### 2.1 Install SonarLint CLI
```bash
# Download SonarLint CLI
curl -L -o sonarlint-cli.zip https://binaries.sonarsource.com/Distribution/sonarlint-cli/sonarlint-cli-10.0.0.77647.zip
unzip sonarlint-cli.zip
export PATH=$PATH:$(pwd)/sonarlint-cli-10.0.0.77647/bin
```

#### 2.2 Create SonarLint Configuration
Create `.sonarlintrc` in project root:
```json
{
  "sonarCloudOrganization": "your-org-key",
  "projectKey": "your-project-key",
  "serverId": "sonarcloud"
}
```

#### 2.3 Configure SonarLint User Token
Create `~/.sonarlint/conf/global.json`:
```json
{
  "servers": [
    {
      "id": "sonarcloud",
      "url": "https://sonarcloud.io",
      "token": "your-sonarcloud-token"
    }
  ]
}
```

### 3. AI Agent Workflow

#### 3.1 Pre-Code Generation
Before writing any code, the AI agent should:
```bash
# Analyze current state
sonarlint --analyze src/

# Store baseline issues
sonarlint --analyze src/ --output baseline.json
```

#### 3.2 Post-Code Generation
After making changes:
```bash
# Analyze modified files
sonarlint --analyze src/path/to/modified/file.js

# Compare with baseline
sonarlint --analyze src/ --output current.json
# Then compare baseline.json with current.json
```

#### 3.3 AI Agent Rules

1. **Never introduce new SonarCloud issues**
   - Run analysis before and after changes
   - Reject changes that introduce new issues

2. **Fix existing issues when touching code**
   - If modifying a file with existing issues, fix them
   - Document any issues that cannot be fixed

3. **Follow SonarCloud's severity levels**
   - BLOCKER/CRITICAL: Must fix immediately
   - MAJOR: Fix if touching the code
   - MINOR/INFO: Fix opportunistically

### 4. Implementation in AI Agent Behavior

#### 4.1 CLAUDE.md Configuration
Add to your project's CLAUDE.md:
```markdown
## Code Quality Standards

This project uses SonarCloud for code quality. Before making any code changes:

1. Run: `sonarlint --analyze <file>` on files you plan to modify
2. After changes, run the analysis again
3. Ensure no new issues are introduced
4. Fix existing issues in modified code when possible

SonarCloud project: [your-project-url]
Quality Gate: Must pass
```

#### 4.2 AI Agent Commands
Create wrapper scripts for the AI agent:

**scripts/check-quality.sh**:
```bash
#!/bin/bash
# Check code quality before changes
sonarlint --analyze "$1" --output "before-$1.json"
```

**scripts/verify-quality.sh**:
```bash
#!/bin/bash
# Verify no new issues after changes
sonarlint --analyze "$1" --output "after-$1.json"
# Compare and ensure no new issues
```

### 5. Alternative: SonarCloud Web API Integration

If SonarLint CLI is not suitable, use SonarCloud's Web API:

#### 5.1 API Commands for AI Agent
```bash
# Get project rules
curl -u YOUR_TOKEN: "https://sonarcloud.io/api/rules/search?languages=js,ts&ps=500&organization=YOUR_ORG"

# Get current issues
curl -u YOUR_TOKEN: "https://sonarcloud.io/api/issues/search?componentKeys=YOUR_PROJECT_KEY&resolved=false"

# Check specific file
curl -u YOUR_TOKEN: "https://sonarcloud.io/api/sources/lines?key=YOUR_PROJECT_KEY:src/app.js"
```

#### 5.2 AI Agent Logic
1. Fetch active rules from SonarCloud
2. Parse rule descriptions and examples
3. Apply rules during code generation
4. Validate changes against known patterns

### 6. Practical Integration Steps

#### 6.1 For the AI Agent
The AI agent should:

1. **Before any code modification**:
   ```bash
   # Check current quality status
   sonarlint --analyze <target-file>
   ```

2. **During code writing**:
   - Follow SonarCloud patterns from existing code
   - Avoid known anti-patterns from your ruleset
   - Use consistent style with analyzed code

3. **After code modification**:
   ```bash
   # Verify quality maintained
   sonarlint --analyze <target-file>
   # If issues found, fix them before proceeding
   ```

#### 6.2 Quality Checkpoints
Create quality checkpoints in your workflow:

1. **Pre-commit**: Run SonarLint on changed files
2. **Post-generation**: Verify no new issues
3. **PR creation**: Include quality report

### 7. Configuration File for AI Agent

Create `.ai-agent-config.json`:
```json
{
  "codeQuality": {
    "tool": "sonarlint",
    "mode": "connected",
    "sonarCloudProject": "your-project-key",
    "rules": {
      "enforceOnNewCode": true,
      "fixExistingInModifiedFiles": true,
      "blockOnCritical": true
    },
    "preflightCommands": [
      "sonarlint --analyze ${file} --output pre-analysis.json"
    ],
    "postflightCommands": [
      "sonarlint --analyze ${file} --output post-analysis.json",
      "diff pre-analysis.json post-analysis.json"
    ]
  }
}
```

### 8. Benefits of This Approach

1. **Single Source of Truth**: SonarCloud rules are the only rules
2. **Consistency**: Same analysis locally and in CI/CD
3. **Real-time Feedback**: AI agent knows immediately if code meets standards
4. **Automatic Updates**: Rule changes in SonarCloud automatically apply locally

### 9. Monitoring and Reporting

Track AI agent compliance:
```bash
# Daily summary
sonarlint --analyze src/ --output daily-$(date +%Y%m%d).json

# Track improvement
echo "$(date): $(sonarlint --analyze src/ | grep 'issues found' | awk '{print $1}')" >> quality-trend.log
```

### 10. Quick Start Commands

For immediate use by your AI agent:

```bash
# 1. Install SonarLint CLI (one-time)
npm install -g sonarlint-cli

# 2. Configure connection (one-time)
sonarlint --connect --server-url https://sonarcloud.io --token YOUR_TOKEN

# 3. Before making changes
sonarlint --analyze path/to/file.js

# 4. After making changes
sonarlint --analyze path/to/file.js --fail-on-issues

# 5. Analyze entire source
sonarlint --analyze src/
```

## Summary

This approach allows your AI agent to directly use your SonarCloud ruleset without maintaining separate local linting tools. The agent can check code quality in real-time and ensure all generated code meets your SonarCloud standards.