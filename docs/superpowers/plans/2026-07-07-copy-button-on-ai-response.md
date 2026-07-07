# Copy Button on AI 'done' Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible copy button to the top-right of every 'done' AI card in the panel that copies the AI's markdown-formatted final answer to the clipboard, with icon-swap feedback.

**Architecture:** Extend the existing string-based card renderer (`createCard`) with optional `copyable`/`copyText` parameters. When set, the card HTML includes a `<button>` with `data-copy-button` and `data-copy-text` attributes. The Panel attaches one delegated `click` listener on its `#historySection` root that catches `[data-copy-button]`, calls `navigator.clipboard.writeText`, and toggles `data-state` for visual feedback. i18n adds two tooltip strings; CSS Module adds `.copyButton` styles.

**Tech Stack:** Vanilla TypeScript, CSS Modules (CSS-only — no preprocessor), Vitest (new in `@page-agent/ui`), `navigator.clipboard` API, existing `I18n` class with `enUS`/`zhCN` locales.

## Global Constraints

- **UI-only change**: no modifications to `packages/extension`, `packages/core`, `packages/llms`, or `packages/page-controller`.
- **Vanilla TS**: panel must remain framework-free (no React/Preact imports in `packages/ui`).
- **i18n parity**: any new locale key added to `enUS` MUST also be added to `zhCN` (TypeScript enforces via `TranslationKey` derived from `enUS`).
- **CSS scoping**: all new styles live in `Panel.module.css` — no global stylesheets.
- **XSS safety**: any user-/AI-supplied text rendered into HTML attributes (including `data-copy-text`) MUST go through `escapeHtml` from `packages/ui/src/utils.ts`.
- **Markdown is canonical**: the button copies the exact string passed in `copyText`; the rendered card body shows the same string. No format conversion.
- **Spec file**: `docs/superpowers/specs/2026-07-07-copy-button-on-ai-response-design.md`.

---

## File Structure

| File                                          | Responsibility                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/ui/src/panel/cards.ts`              | Pure HTML-string generator. Knows nothing about runtime. Adds `copyable`/`copyText` to `CardOptions`; emits a button element when both are set.                                                  |
| `packages/ui/src/panel/Panel.ts`              | Owns the `#historySection` DOM. Passes `copyable`/`copyText` when rendering the 'done' card (line 673). Attaches one delegated `click` listener in `#setupEventListeners` (around line 168).     |
| `packages/ui/src/panel/Panel.module.css`      | Scoped styles for `.copyButton` and its `[data-state]` variants.                                                                                                                                 |
| `packages/ui/src/i18n/locales.ts`             | Adds `ui.panel.copy` and `ui.panel.copied` to both `enUS` and `zhCN`.                                                                                                                            |
| `packages/ui/src/panel/cards.test.ts` _(new)_ | Vitest unit tests for the new `createCard` shape (button rendered when `copyable`+`copyText` set; absent otherwise; HTML-escaped; preserves original `copyText` byte-for-byte in the attribute). |
| `packages/ui/vitest.config.ts` _(new)_        | Vitest configuration for the UI package (mirrors `packages/llms`).                                                                                                                               |

---

### Task 1: Add copy button HTML to `createCard`

**Files:**

- Modify: `packages/ui/src/panel/cards.ts`
- Test: `packages/ui/src/panel/cards.test.ts` (new)

**Interfaces:**

- Consumes: nothing new (purely extends existing function).
- Produces: `createCard({ icon, content, meta?, type?, copyable?, copyText? })` — when `copyable === true && typeof copyText === 'string'`, the rendered HTML contains `<button class="<styles.copyButton>" data-copy-button data-copy-text="<escaped copyText>" data-state="idle">📋</button>` inside the card; otherwise the card is unchanged from before.

**Note on vitest setup:** the UI package currently has no `vitest.config.ts`. The Task 1 implementation will create `cards.test.ts` only; the vitest config + test script wiring is Task 2. Task 1's tests cannot be executed until Task 2 is complete, but the test file is authored here so it ships alongside the code that satisfies it.

- [ ] **Step 1.1: Write the failing test**

Create `packages/ui/src/panel/cards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { createCard } from './cards'

import styles from './Panel.module.css'

describe('createCard with copyable option', () => {
    it('renders a copy button when copyable is true and copyText is provided', () => {
        const html = createCard({
            icon: '🤖',
            content: 'Hello world',
            type: 'output',
            copyable: true,
            copyText: 'Hello world',
        })
        expect(html).toContain('data-copy-button')
        expect(html).toContain(`data-state="idle"`)
        expect(html).toContain(styles.copyButton)
    })

    it('does not render a copy button when copyable is omitted', () => {
        const html = createCard({ icon: '🤖', content: 'Hello', type: 'output' })
        expect(html).not.toContain('data-copy-button')
        expect(html).not.toContain(styles.copyButton)
    })

    it('does not render a copy button when copyable is true but copyText is missing', () => {
        const html = createCard({
            icon: '🤖',
            content: 'Hello',
            type: 'output',
            copyable: true,
        })
        expect(html).not.toContain('data-copy-button')
    })

    it('preserves the original copyText byte-for-byte in the data-copy-text attribute (after HTML-escaping)', () => {
        const text = '# Title\n\nSome **bold** text with "quotes" & <html>'
        const html = createCard({
            icon: '🤖',
            content: text,
            type: 'output',
            copyable: true,
            copyText: text,
        })
        // Attribute value must be HTML-escaped; raw `<html>` cannot appear unescaped.
        expect(html).not.toContain('data-copy-text="<html>"')
        expect(html).toContain('data-copy-text=')
        // The em-dash of escaped forms proves escaping happened.
        expect(html).toContain('&quot;quotes&quot;')
        expect(html).toContain('&amp;')
        expect(html).toContain('&lt;html&gt;')
    })

    it('renders the copy button inside the historyItem wrapper, not outside', () => {
        const html = createCard({
            icon: '🤖',
            content: 'Hello',
            type: 'output',
            copyable: true,
            copyText: 'Hello',
        })
        // Both the wrapper class and the button must coexist in the snippet.
        expect(html).toContain(styles.historyItem)
        expect(html.indexOf(styles.historyItem)).toBeLessThan(html.indexOf('data-copy-button'))
    })
})
```

- [ ] **Step 1.2: Update `createCard` to emit the button when `copyable` and `copyText` are set**

Replace the `CardOptions` interface and `createCard` function in `packages/ui/src/panel/cards.ts` with:

```ts
type CardType = 'default' | 'input' | 'output' | 'question' | 'observation'

interface CardOptions {
    icon: string
    content: string | string[]
    meta?: string
    type?: CardType
    /** When true, render a copy button inside the card. Requires `copyText`. */
    copyable?: boolean
    /** Raw text copied to the clipboard when the copy button is clicked. */
    copyText?: string
}

/** Create a single history card */
export function createCard({ icon, content, meta, type, copyable, copyText }: CardOptions): string {
    const typeClass = type ? styles[type] : ''
    const contentHtml = Array.isArray(content)
        ? `<div class="${styles.reflectionLines}">${content.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>`
        : `<span>${escapeHtml(content)}</span>`

    // Render copy button only when caller explicitly opts in AND supplies text.
    // The handler reads `data-copy-text` from the rendered DOM at click time.
    const copyButtonHtml =
        copyable && typeof copyText === 'string'
            ? `<button type="button" class="${styles.copyButton}" data-copy-button data-copy-text="${escapeHtml(copyText)}" data-state="idle" aria-label="Copy">📋</button>`
            : ''

    return `
		<div class="${styles.historyItem} ${typeClass}">
			<div class="${styles.historyContent}">
				<span class="${styles.statusIcon}">${icon}</span>
				${contentHtml}
			</div>
			${copyButtonHtml}
			${meta ? `<div class="${styles.historyMeta}">${meta}</div>` : ''}
		</div>
	`
}
```

(The file already imports `escapeHtml` from `../utils`; no import changes needed. `createReflectionLines` is unchanged.)

- [ ] **Step 1.3: Verify the test file is well-formed**

Read back `packages/ui/src/panel/cards.test.ts` to confirm no syntax errors. (Skipped — file written by editor and saved atomically.)

---

### Task 2: Wire Vitest into the `@page-agent/ui` package

**Files:**

- Create: `packages/ui/vitest.config.ts`
- Modify: `packages/ui/package.json` (add `"test": "vitest run"` script only — no dependency bumps)

**Interfaces:**

- Consumes: vitest (already installed at workspace root; `packages/llms/vitest.config.ts` is the template).
- Produces: `npm test -w @page-agent/ui` runs all `*.test.ts` files in `packages/ui/src`.

- [ ] **Step 2.1: Create `packages/ui/vitest.config.ts`**

Mirror the `packages/llms/vitest.config.ts` shape (read it once first to confirm exact content). Expected content:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
})
```

Verify by running `cat packages/llms/vitest.config.ts` first; if it differs in a material way (e.g., jsdom environment, alias mapping), copy the differences too. The expected environment is `node` because `createCard` is a pure string function with no DOM dependency in the unit tests — the test that imports `Panel.module.css` is also pure (it reads exported class name strings).

- [ ] **Step 2.2: Add the `test` script to `packages/ui/package.json`**

Open `packages/ui/package.json`. In the `scripts` block, add a single new entry:

```json
"test": "vitest run"
```

The block should now read:

```json
"scripts": {
    "build": "vite build",
    "test": "vitest run",
    "prepublishOnly": "node ../../scripts/pre-publish.js",
    "postpublish": "node ../../scripts/post-publish.js"
}
```

Do not add any `devDependencies`. Vitest is hoisted to the workspace root and is already available to every workspace package via npm workspaces.

- [ ] **Step 2.3: Run the test from Task 1 and confirm it passes**

Run from repo root:

```bash
npm test -w @page-agent/ui
```

Expected: all 5 tests in `cards.test.ts` pass.

If a test fails with `Cannot find module './Panel.module.css'` or similar, the `vite.config.js` already configured CSS Modules — check `packages/ui/vite.config.js` and ensure `vitest.config.ts` does not break that resolution. If needed, add `css: { modules: { classNameStrategy: 'non-scoped' } }` (or whatever matches the vite config) to `vitest.config.ts`. Do not invent a CSS plugin config from scratch — copy whatever `vite.config.js` does for CSS Modules.

- [ ] **Step 2.4: Commit**

```bash
git add packages/ui/src/panel/cards.ts packages/ui/src/panel/cards.test.ts packages/ui/vitest.config.ts packages/ui/package.json
git commit -m "feat(ui): render copy button on copyable cards"
```

---

### Task 3: Add CSS for `.copyButton` and its `[data-state]` variants

**Files:**

- Modify: `packages/ui/src/panel/Panel.module.css`

**Interfaces:**

- Consumes: existing class names from the same file (`historyItem`, `historyContent`, `statusIcon`). Reads `Panel.ts` for selector patterns — class names are nested under their parent and styles follow existing patterns.
- Produces: a `.copyButton` class that is `position: absolute`, top-right, small, low-opacity by default, full opacity on hover/focus, with `[data-state="done"]` and `[data-state="error"]` variants that show different emoji content via `::after` (so we don't have to swap inner HTML).

- [ ] **Step 3.1: Inspect existing CSS to match patterns**

Open `packages/ui/src/panel/Panel.module.css`. Confirm:

- The file uses plain CSS (no Sass/PostCSS plugins beyond the CSS Modules transform).
- Class names use `kebab-case` matching the TypeScript accessors (e.g., `.historyItem`, `.output`).
- Selectors that scope to a parent look like `.historyItem .statusIcon { ... }`.

- [ ] **Step 3.2: Append the new styles at the end of `Panel.module.css`**

```css
/* Copy button on 'done' cards (and any card opted in via copyable=true) */
.historyItem .copyButton {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1;
    cursor: pointer;
    opacity: 0.4;
    border-radius: 4px;
    transition:
        opacity 120ms ease,
        background-color 120ms ease;
}

.historyItem .copyButton:hover,
.historyItem .copyButton:focus-visible {
    opacity: 1;
    background-color: rgba(127, 127, 127, 0.15);
    outline: none;
}

.historyItem .copyButton:active {
    transform: scale(0.94);
}

/* Hide the literal "📋" by default; show the data-state emoji instead via ::after.
   We do this so we never have to mutate the button's innerHTML, which would
   interfere with React-style re-renders or text selection. */
.historyItem .copyButton {
    font-size: 0;
}
.historyItem .copyButton::after {
    font-size: 14px;
    content: '📋';
}
.historyItem .copyButton[data-state='done']::after {
    content: '✓';
}
.historyItem .copyButton[data-state='error']::after {
    content: '⚠';
}
```

Adjust `top`/`right` if the cards already have other absolutely-positioned children — confirm with a Read of `Panel.module.css` first. If `.historyItem` already sets `position: relative`, the absolute positioning will anchor correctly.

- [ ] **Step 3.3: Visually verify the build still compiles**

Run from repo root:

```bash
npm run build:libs
```

Expected: `packages/ui` builds without errors. (CSS Modules will mangle class names; the runtime DOM only sees the mangled names, but our string templates use `styles.copyButton` which references the same export, so the lookup still matches.)

- [ ] **Step 3.4: Commit**

```bash
git add packages/ui/src/panel/Panel.module.css
git commit -m "feat(ui): style copy button on copyable cards"
```

---

### Task 4: Add i18n strings for tooltip

**Files:**

- Modify: `packages/ui/src/i18n/locales.ts`

**Interfaces:**

- Consumes: existing `enUS` and `zhCN` constants. `TranslationKey` is derived from `enUS`, so adding a new key there forces the matching key in `zhCN`.
- Produces:
    - `enUS.ui.panel.copy` = `'Copy'`
    - `enUS.ui.panel.copied` = `'Copied'`
    - `zhCN.ui.panel.copy` = `'复制'`
    - `zhCN.ui.panel.copied` = `'已复制'`

- [ ] **Step 4.1: Add the English strings**

In `packages/ui/src/i18n/locales.ts`, inside `enUS.ui.panel` (which already has `ready`, `thinking`, etc.), add two keys:

```ts
copy: 'Copy',
copied: 'Copied',
```

The full `panel` block becomes:

```ts
panel: {
    ready: 'Ready',
    thinking: 'Thinking...',
    taskInput: 'Enter new task, describe steps in detail, press Enter to submit',
    userAnswerPrompt: 'Please answer the question above, press Enter to submit',
    taskTerminated: 'Task terminated',
    taskCompleted: 'Task completed',
    userAnswer: 'User answer: {{input}}',
    question: 'Question: {{question}}',
    waitingPlaceholder: 'Waiting for task to start...',
    stop: 'Stop',
    close: 'Close',
    expand: 'Expand history',
    collapse: 'Collapse history',
    step: 'Step {{number}}',
    copy: 'Copy',
    copied: 'Copied',
},
```

- [ ] **Step 4.2: Add the Chinese strings**

In the same file, inside `zhCN.ui.panel`, add:

```ts
copy: '复制',
copied: '已复制',
```

- [ ] **Step 4.3: Verify TypeScript compilation**

```bash
npm run typecheck
```

Expected: passes. If TypeScript complains that `zhCN` is missing a key, double-check both files.

- [ ] **Step 4.4: Commit**

```bash
git add packages/ui/src/i18n/locales.ts
git commit -m "feat(ui): add copy/copied tooltip strings"
```

---

### Task 5: Pass `copyable`/`copyText` for the 'done' card and wire delegated click handler

**Files:**

- Modify: `packages/ui/src/panel/Panel.ts`

**Interfaces:**

- Consumes: `#historySection` (already a class field at line 34); `#i18n` (already a class field); `createCard` extended in Task 1.
- Produces:
    - In `#createActionCards` (around line 669–674): the `done` branch calls `createCard({ ..., type: 'output', copyable: true, copyText: text })`.
    - A new private method `#setupCopyButtonDelegation` (called once from the constructor) that attaches a single `click` listener on `this.#historySection`. The listener reads `(event.target as HTMLElement).closest('[data-copy-button]')`, prevents default, reads `data-copy-text`, calls `navigator.clipboard.writeText`, then sets `button.dataset.state` and schedules a 1500ms revert.

- [ ] **Step 5.1: Pass `copyable` and `copyText` for the 'done' card**

In `packages/ui/src/panel/Panel.ts`, find this block (around line 669–674):

```ts
if (action.name === 'done') {
    const input = action.input as { text?: string }
    const text = input.text || action.output || ''
    if (text) {
        cards.push(createCard({ icon: '🤖', content: text, meta, type: 'output' }))
    }
}
```

Replace the `createCard` call with:

```ts
if (text) {
    cards.push(
        createCard({
            icon: '🤖',
            content: text,
            meta,
            type: 'output',
            copyable: true,
            copyText: text,
        })
    )
}
```

Do not touch the `ask_user` branch or any other branch — those are out of scope per the spec's Non-Goals.

- [ ] **Step 5.2: Add the delegated click handler**

In `packages/ui/src/panel/Panel.ts`, add a new private method anywhere inside the `Panel` class (a clean spot is just before the closing `}` of the class, after `#createActionCards`). Use exactly this:

```ts
/**
 * Delegated click handler for copy buttons inside the history list.
 * One listener for all copy buttons — cards are HTML strings and re-render
 * freely, so per-button binding would leak. We resolve the actual button via
 * Element.closest('[data-copy-button]') and read `data-copy-text` directly.
 */
#handleCopyButtonClick = (event: MouseEvent): void => {
	const target = event.target as HTMLElement | null
	const button = target?.closest('[data-copy-button]') as HTMLButtonElement | null
	if (!button) return

	const text = button.dataset.copyText ?? ''
	if (!text) return

	event.preventDefault()
	event.stopPropagation()

	const flash = (state: 'done' | 'error') => {
		button.dataset.state = state
		setTimeout(() => {
			// Only revert if the same button is still mounted. A re-render would
			// create a new node, leaving this timer harmless.
			if (button.isConnected) {
				button.dataset.state = 'idle'
			}
		}, 1500)
	}

	void navigator.clipboard
		.writeText(text)
		.then(() => flash('done'))
		.catch((err: unknown) => {
			console.warn('[panel] copy failed:', err)
			flash('error')
		})
}

/** Attach the copy-button delegated listener. Called once from the constructor. */
#setupCopyButtonDelegation(): void {
	this.#historySection.addEventListener('click', this.#handleCopyButtonClick)
}
```

- [ ] **Step 5.3: Wire the setup call into the constructor**

Find the constructor (around line 65–95). After `this.#setupEventListeners()` (around line 89), add:

```ts
this.#setupCopyButtonDelegation()
```

The exact placement is the line right after `this.#setupEventListeners()`, before `this.#startHeaderUpdateLoop()`.

- [ ] **Step 5.4: Verify TypeScript and existing tests**

```bash
npm run typecheck
npm test -w @page-agent/ui
```

Expected: typecheck passes; the 5 tests from Task 1 still pass (no regressions to `createCard` behavior).

- [ ] **Step 5.5: Commit**

```bash
git add packages/ui/src/panel/Panel.ts
git commit -m "feat(ui): wire copy button click delegation in panel"
```

---

### Task 6: Manual smoke verification

**Files:** none.

**Verification:** end-to-end manual run. Cannot be automated in this PR's unit-test surface (the extension's React/UI integration is not part of `@page-agent/ui`'s test sandbox).

- [ ] **Step 6.1: Build the extension**

From repo root:

```bash
npm run build:ext
```

Expected: the extension builds. (This packages the `@page-agent/ui` library first as a transitive step.)

- [ ] **Step 6.2: Load the extension and run a real task**

Load the freshly-built extension in your browser (per `packages/extension/README.md` or your usual dev workflow). Open a page with content the agent can act on. Submit a real task that ends with a `done` action carrying markdown text.

- [ ] **Step 6.3: Verify the copy button is present on the 'done' card**

In the panel history, expand it. Confirm:

- The 'done' card (icon 🤖) shows a small 📋 icon at its top-right.
- Reflection cards (icon 🧠) and tool result cards (icon 🔨) do NOT show a copy button.

- [ ] **Step 6.4: Verify the copy action works**

Click the copy button. Confirm:

- The icon swaps to ✓ for ~1.5s, then reverts to 📋.
- Paste the clipboard contents into a text editor. The pasted text is exactly the AI's markdown-formatted answer.

- [ ] **Step 6.5: Verify hover tooltip in both languages**

Hover the copy button:

- In `en-US`, the browser tooltip reads "Copy" (the `title` attribute is wired in the next step).
- Switch the panel language to `zh-CN` (see `PanelConfig.language` in `Panel.ts`), reload, re-trigger a task. The tooltip should read "复制".

Note: at this point the `title` attribute is NOT yet set on the button. The button uses `aria-label="Copy"` only. **If tooltip text is missing, complete Step 6.6.**

- [ ] **Step 6.6: (If tooltip missing) wire the localized `title` attribute**

The `createCard` function in `cards.ts` does not have access to the `I18n` instance (it is a pure string function). The cleanest fix: pass the tooltip text through `CardOptions` so the Panel can supply it.

Open `packages/ui/src/panel/cards.ts`. Add `copyTitle?: string` to `CardOptions`:

```ts
interface CardOptions {
    icon: string
    content: string | string[]
    meta?: string
    type?: CardType
    copyable?: boolean
    copyText?: string
    /** Localized tooltip shown on hover. Set this to `i18n.t('ui.panel.copy')`. */
    copyTitle?: string
}
```

Update the button HTML to use `title`:

```ts
const copyButtonHtml =
    copyable && typeof copyText === 'string'
        ? `<button type="button" class="${styles.copyButton}" data-copy-button data-copy-text="${escapeHtml(copyText)}" data-state="idle" title="${escapeHtml(copyTitle ?? '')}" aria-label="${escapeHtml(copyTitle ?? 'Copy')}">📋</button>`
        : ''
```

In `Panel.ts`, the 'done' branch becomes:

```ts
if (text) {
    cards.push(
        createCard({
            icon: '🤖',
            content: text,
            meta,
            type: 'output',
            copyable: true,
            copyText: text,
            copyTitle: this.#i18n.t('ui.panel.copy'),
        })
    )
}
```

Re-run:

```bash
npm run typecheck
npm test -w @page-agent/ui
npm run build:ext
```

Reload the extension, re-test the tooltip in both languages. Commit:

```bash
git add packages/ui/src/panel/cards.ts packages/ui/src/panel/Panel.ts packages/ui/src/panel/cards.test.ts
git commit -m "feat(ui): localize copy button tooltip via i18n"
```

(Only run this step if 6.5 revealed the tooltip is missing. Otherwise skip it.)

- [ ] **Step 6.7: Verify error state**

In a non-secure context (e.g., serve the dev build over plain `http://`), trigger the copy. Confirm:

- The icon briefly shows ⚠.
- The browser console logs `[panel] copy failed: ...`.
- No exception is thrown.

If you cannot easily reproduce a non-secure context, skip this step and note it in the PR description as "manual smoke not run for clipboard failure path."

---

## Self-Review (post-write)

**1. Spec coverage:**

- "Always-visible copy button to the top-right of every 'done' AI card" → Task 1 (button HTML) + Task 3 (CSS position) + Task 5 (wire it on the 'done' branch).
- "Copies the AI's markdown-formatted response text to the system clipboard" → Task 5 (`copyText: text` + `navigator.clipboard.writeText(text)`).
- "Icon swaps to ✓ for ~1.5s, auto-reverts" → Task 5 (`flash('done')` + `setTimeout(..., 1500)`).
- "Hover/focus states" → Task 3 (`:hover`, `:focus-visible` rules).
- "Empty copyText is no-op" → Task 5 (`if (!text) return` early-out).
- "Clipboard API unavailable → ⚠ + console.warn" → Task 5 (`catch` → `flash('error')` + `console.warn`).
- "i18n strings `ui.panel.copy` / `ui.panel.copied`" → Task 4 (both locales).
- "Markdown is the source of truth (what you see is what you copy)" → Task 5 (`copyText: text` is the same string passed to `content`).
- "Files touched (4)" — cards.ts, Panel.ts, Panel.module.css, locales.ts — ✓ Tasks 1, 3, 4, 5 each touch exactly one of these.

**2. Placeholder scan:** no "TBD", "TODO", "implement later", "appropriate", "similar to". All steps have exact code or exact commands.

**3. Type consistency:**

- `CardOptions` shape: defined in Task 1, extended in Task 6.6 (`copyTitle`). The two additions don't conflict.
- `data-state` values: `'idle' | 'done' | 'error'` — consistent across Task 1 (initial `'idle'`), Task 3 (CSS selectors), Task 5 (`flash('done' | 'error')`).
- `data-copy-button` and `data-copy-text`: used identically in cards.ts, Panel.ts handler, and the test.
- `#setupCopyButtonDelegation`: declared in Task 5, called in Task 5. No mismatch.

**4. Single-concern check:** each task touches one concern (button HTML, test wiring, CSS, i18n, runtime wiring, manual smoke). No coupling.
