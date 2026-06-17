---
description: Deep semantic recall across the whole vault via the brain service
---

The user wants a deep recall query answered from the brain index. Steps:

1. Call the `recall` MCP tool (server `mind-lint-brain`) with the user's query (pass `$ARGUMENTS` as the query).
2. If the tool is unavailable, tell the user the brain service is not running and how to start it (`cd ~/.claude/brain && npm run serve`), then stop.
3. From the returned evidence chunks, write a synthesized answer that cites each claim by its `sourcePath`.
4. End with a short "Gaps" section: what is missing, stale, or thin in the vault on this topic.
Do not assert anything the evidence does not support.
