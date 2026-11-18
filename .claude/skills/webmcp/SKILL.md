---
name: webmcp
description: Add or change WebMCP tools (page actions exposed to in-browser AI agents) in src/js/webmcp.js. Use when asked about WebMCP, agent-ready pages or modelContext.
---

# webmcp

WebMCP lets a page register tools for browser AI agents. The API is experimental and has been renamed between Chrome versions (`navigator.modelContext` -> `document.modelContext`). Before editing, check current Chrome docs for the exact API and flags.

Rules:
- Always feature-detect; the page must work fully without it.
- Tools need a clear `name`, `description`, JSON `inputSchema` and an `execute` handler returning `{ content: [{ type: 'text', text }] }`.
- Expose safe actions (summaries, navigation, prefilling). Anything that submits data or has side effects must require explicit user confirmation.
- Keep tools few and well described; the existing set is in `src/js/webmcp.js`.
- Test in Chrome with the WebMCP flags enabled and inspect registered tools in DevTools.

Separate from this: Chrome DevTools MCP (`.mcp.json`) is a development tool for Claude, not a page feature.
