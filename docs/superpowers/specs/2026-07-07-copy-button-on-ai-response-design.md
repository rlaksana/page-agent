# Copy Button on AI 'done' Cards — Design

**Date:** 2026-07-07
**Status:** Draft (pending user review)
**Scope:** `packages/ui` (panel rendering), used by the browser extension.

## Problem

When the page-agent completes a task, the final AI response appears as a 'done' card in the panel history (icon 🤖, type `output`). Users want a copy button on that card so they can paste the AI's final answer into notes, chat, or other tools without manually selecting text.

## Goal

Add a small, always-visible copy button to the top-right of every 'done' AI card. The button copies the AI's markdown-formatted response text to the system clipboard. Click feedback is self-contained (icon swaps to ✓ for ~1.5s).

## Non-Goals

- No copy button on reflection, observation, or input cards. Only the final 'done' card.
- No "copy as plain text" toggle — markdown is the source of truth, what you see is what you copy.
- No keyboard shortcut, no context-menu fallback. Button only.
- No toast/sonner notification — self-contained icon swap is enough.
- No changes to `packages/extension`'s React side, no changes to `packages/core`, no changes to `packages/llms`. This is a UI-only change.

## Architecture

### Files touched (4)

| File                                     | Change                                                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/panel/cards.ts`         | Extend `CardOptions` with optional `copyable` and `copyText`. When set, render a button inside the card with `data-copy-button` and `data-copy-text`.                   |
| `packages/ui/src/panel/Panel.ts`         | Pass `copyable: true, copyText: <output>` when creating the 'done' card. Attach one delegated click listener on the history root.                                       |
| `packages/ui/src/panel/Panel.module.css` | New `.copyButton` class — absolute-positioned, top-right, small, hover/focus states, and `.copyButton[data-state="done"]` / `.copyButton[data-state="error"]` variants. |
| `packages/ui/src/i18n/locales.ts`        | New strings under `ui.panel`: `copy` ("Copy" / "复制"), `copied` ("Copied" / "已复制"). Used as `title` tooltips on the button.                                         |

### Module boundaries

- `createCard` stays generic. It does not know what the text means; it only knows "render a copy button when told to."
- The Panel owns the click delegation and the `navigator.clipboard` call. The button HTML is dumb markup.
- CSS Module keeps icon styling scoped to the panel.

## Data Flow

1. AI finishes a step → adapter emits a 'done' tool result with `output` (markdown text).
2. Panel renders the card:
    ```ts
    createCard({
        icon: '🤖',
        content: output,
        type: 'output',
        copyable: true,
        copyText: output,
    })
    ```
3. Rendered HTML contains, inside the card, a `<button class="copyButton" data-copy-button data-copy-text="…">📋</button>` positioned at top-right.
4. User clicks the button → delegated handler:
    - Reads `data-copy-text` from the button.
    - Calls `await navigator.clipboard.writeText(text)`.
    - On success: sets `button.dataset.state = 'done'` (icon swaps to ✓), schedules `setTimeout(() => { button.dataset.state = 'idle' }, 1500)`.
    - On failure: sets `button.dataset.state = 'error'` (icon swaps to ⚠), schedules revert after 1500ms, logs `console.warn` for devs.

## UI Behavior

- **Position:** top-right of the card, vertically aligned with the icon row.
- **Size:** matches the existing card icon scale (compact).
- **Default state:** 📋 icon, low-opacity until hover/focus.
- **Hover/focus:** full opacity, subtle background highlight.
- **Done state (after click):** ✓ icon, brief highlight, auto-reverts after 1500ms.
- **Error state:** ⚠ icon, brief highlight, auto-reverts after 1500ms.
- **Tooltip:** `title` attribute (i18n string `ui.panel.copy` / `ui.panel.copied`).

## Error Handling

- **Clipboard API unavailable / rejected** (e.g., insecure context, denied permission): show ⚠ for 1500ms, `console.warn` for devs, no user-blocking error. Copy is non-essential — graceful degradation.
- **Empty `copyText`:** button still renders for layout consistency; click is a no-op.
- **Re-render during icon-swap window (1500ms):** the new HTML resets to idle. Acceptable — the next click still works correctly.
- **Long content:** `data-copy-text` carries the full markdown string. No truncation, no truncation policy needed.

## Implementation Notes

- Use `navigator.clipboard.writeText`. This is supported in all evergreen browsers and in extension contexts.
- The click delegation attaches to the existing history root element (the parent of all `.historyItem` cards). One listener total — no per-button binding.
- The icon is rendered as a Unicode emoji inside the button. No SVG/icon font dependency added. Matches the existing card icon style.
- The new CSS class lives in `Panel.module.css` to stay scoped. CSS uses CSS Modules `composes`/nesting only if needed; otherwise plain class selectors with `data-state` attribute.

## Testing

| Case                         | How                                                                          | Expected                                        |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| Copy works on 'done' card    | Run a real task to completion in extension, click copy, paste in text editor | Markdown-formatted AI answer is in clipboard    |
| Button absent on other cards | Trigger a task with reflection/observation steps; inspect history            | Only the 'done' card has a copy button          |
| Hover/focus shows tooltip    | Hover the copy button                                                        | Browser-native tooltip with i18n string         |
| Clipboard failure path       | Open dev server over plain HTTP (non-secure context), trigger copy           | ⚠ icon appears for ~1.5s, `console.warn` logged |
| Language switch              | Switch UI to zh-CN, hover copy button                                        | Tooltip reads "复制" / "已复制"                 |
| Re-render during feedback    | Click copy, immediately trigger a re-render (e.g., run another step)         | New card renders with default icon — no stale ✓ |

## Verification

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build:libs` succeeds.
- Manual smoke: load extension in dev mode, run a real task end-to-end, confirm copy behavior.
