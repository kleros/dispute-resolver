#!/bin/bash

# Quality check script for AI agent to validate SonarCloud compliance
# This script helps the AI agent understand current code quality status

set -e

echo "🔍 Checking SonarCloud compliance for dispute-resolver..."
echo "========================================="

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: Must be run from project root directory"
    exit 1
fi

# Function to check if file exists and has content
check_file() {
    local file="$1"
    if [[ -f "$file" ]]; then
        echo "✅ $file exists"
        return 0
    else
        echo "⚠️  $file not found"
        return 1
    fi
}

# Check project structure
echo "📁 Project Structure Check:"
check_file "src/app.js"
check_file "src/index.js"
check_file "package.json"

# Check if SonarQube extension is working (via IDE diagnostics)
echo ""
echo "🔧 SonarCloud Integration:"
echo "✅ SonarQube extension should be active in your IDE"
echo "✅ Check VS Code Problems panel for SonarCloud issues"
echo "✅ Look for 'SonarLint' annotations in your code"

# Check for common quality issues in key files
echo ""
echo "📋 Quick Quality Check:"

# Check for console.log statements (should be avoided in production)
if grep -r "console\.log" src/ --include="*.js" --include="*.jsx" >/dev/null 2>&1; then
    echo "⚠️  Found console.log statements - consider using console.debug or removing"
    grep -r "console\.log" src/ --include="*.js" --include="*.jsx" | head -3
else
    echo "✅ No console.log statements found"
fi

# Check for TODO comments
if grep -r "TODO\|FIXME\|XXX" src/ --include="*.js" --include="*.jsx" >/dev/null 2>&1; then
    echo "📝 Found TODO/FIXME comments:"
    grep -r "TODO\|FIXME\|XXX" src/ --include="*.js" --include="*.jsx" | head -3
else
    echo "✅ No TODO/FIXME comments found"
fi

# Check for unused imports (basic check)
echo ""
echo "🔍 Basic Code Quality Checks:"

# Check for potential security issues
if grep -r "eval\|innerHTML\|document\.write" src/ --include="*.js" --include="*.jsx" >/dev/null 2>&1; then
    echo "⚠️  Potential security issues found:"
    grep -r "eval\|innerHTML\|document\.write" src/ --include="*.js" --include="*.jsx" | head -3
else
    echo "✅ No obvious security issues found"
fi

# Check for proper error handling in async functions
echo ""
echo "🔄 Async/Await Pattern Check:"
if grep -r "async.*{" src/ --include="*.js" --include="*.jsx" | grep -v "try\|catch" | head -1 >/dev/null 2>&1; then
    echo "⚠️  Some async functions might need better error handling"
else
    echo "✅ Async functions appear to have error handling"
fi

echo ""
echo "📊 Summary:"
echo "✅ Use your IDE's SonarQube extension for real-time feedback"
echo "✅ Check VS Code Problems panel for SonarCloud issues"
echo "✅ Follow the patterns established in existing code"
echo "✅ Fix any issues in files you modify"

echo ""
echo "🎯 Next Steps for AI Agent:"
echo "1. Check IDE diagnostics before making changes"
echo "2. Follow SonarCloud rules while coding"
echo "3. Verify no new issues after changes"
echo "4. Fix existing issues when touching files"

echo ""
echo "✅ Quality check complete!"