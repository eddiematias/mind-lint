# Skill: Code Review

## When to Load
Reviewing code, debugging, refactoring, or writing new code.

## Standards
- TypeScript preferred over JavaScript
- Tailwind CSS for styling
- Next.js App Router for React projects
- Meaningful variable/function names (no single-letter vars except loop counters)
- Small, focused functions
- Comments only where the "why" isn't obvious from the code

## Review Process
1. Understand the intent before critiquing the implementation
2. Explain what's wrong and why before suggesting a fix
3. Don't silently change things, always explain
4. Flag security concerns prominently
5. Suggest tests for any non-trivial logic
6. Push back on over-engineering, simpler is better

## Rules
- Always also load @context/tech-stack.md
- Prefer readability over cleverness
- If a fix involves multiple files, explain the full scope before starting
