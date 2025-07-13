#!/bin/bash

# Pre-change quality check for AI agent
# Run this before making any code changes to understand current state

FILE="$1"

if [[ -z "$FILE" ]]; then
    echo "Usage: $0 <file-to-check>"
    echo "Example: $0 src/app.js"
    exit 1
fi

if [[ ! -f "$FILE" ]]; then
    echo "❌ File not found: $FILE"
    exit 1
fi

echo "🔍 Pre-change analysis for: $FILE"
echo "================================"

# Check if file has common issues
echo "📋 Current Issues Check:"

# Check for console statements
if grep -n "console\." "$FILE" >/dev/null 2>&1; then
    echo "⚠️  Console statements found:"
    grep -n "console\." "$FILE" | head -3
else
    echo "✅ No console statements"
fi

# Check for TODO comments
if grep -n "TODO\|FIXME\|XXX" "$FILE" >/dev/null 2>&1; then
    echo "📝 TODO/FIXME comments:"
    grep -n "TODO\|FIXME\|XXX" "$FILE"
else
    echo "✅ No TODO/FIXME comments"
fi

# Check for complexity indicators
echo ""
echo "🔧 Complexity Indicators:"

# Count lines
LINE_COUNT=$(wc -l < "$FILE")
echo "📏 Lines of code: $LINE_COUNT"

if [[ $LINE_COUNT -gt 300 ]]; then
    echo "⚠️  File is quite large (>300 lines) - consider refactoring"
elif [[ $LINE_COUNT -gt 200 ]]; then
    echo "ℹ️  File is moderately large (>200 lines)"
else
    echo "✅ File size is reasonable"
fi

# Check for nested functions (basic check)
FUNCTION_COUNT=$(grep -c "function\|=>" "$FILE" || echo "0")
echo "🔧 Function count: $FUNCTION_COUNT"

# Check for async/await patterns
if grep -n "async\|await" "$FILE" >/dev/null 2>&1; then
    echo "⚡ Contains async operations"
    
    # Check for proper error handling
    if grep -n "try\|catch" "$FILE" >/dev/null 2>&1; then
        echo "✅ Has error handling"
    else
        echo "⚠️  Async operations might need error handling"
    fi
else
    echo "ℹ️  No async operations detected"
fi

echo ""
echo "🎯 SonarCloud Reminders:"
echo "• Check your IDE's Problems panel for SonarCloud issues"
echo "• Look for SonarLint annotations in the code"
echo "• Follow established patterns in the codebase"
echo "• Fix any existing issues when modifying this file"

echo ""
echo "✅ Pre-change analysis complete for $FILE"