# Extension `maxRetries` Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Existing extension users, on next reload, get `maxRetries: 10` (= 11 LLM calls per step) automatically — by stripping a stale `maxRetries < 10` value from `chrome.storage.local.llmConfig` and letting the library's `parseLLMConfig` fall back to its 10 default.

**Architecture:** One pure function (`migrateMaxRetries` in `packages/extension/src/agent/constants.ts`) mirrors the existing `migrateLegacyEndpoint` shape — returns the same object reference when no migration is needed, returns a new object with `maxRetries` removed when it is `< 10`. `useAgent.ts` calls the helper after the existing legacy-endpoint migration and re-writes `llmConfig` to `chrome.storage.local` when the reference changes.

**Tech Stack:** TypeScript (extension), Vitest (new minimal config for `packages/extension`), `chrome.storage.local` API. No library changes; no UI changes; no new dependencies.

## Global Constraints

- **Scope:** `packages/extension` only. No changes to `packages/llms`, `packages/core`, `packages/ui`, or `packages/page-controller`.
- **No new dependencies** — the library default `maxRetries: 10` is already in place (`packages/llms/src/index.ts:104`).
- **Magic number 10** is hard-coded in `migrateMaxRetries`. It mirrors the current library default. If the library default changes, a follow-up spec extends this migration (or moves to a versioned registry).
- **Pure function** — `migrateMaxRetries` does not touch `chrome.storage.local`; the caller decides whether to persist based on reference identity.
- **Reference-identity check** — caller uses `if (migrated !== original)` to detect change. Function returns the same object when no migration is needed, a new object when it is.
- **Vitest setup is in scope** for this plan because we are adding a pure helper that warrants a unit test. Setup is minimal (one `vitest.config.ts`, one `"test"` script in `package.json`).
- **Spec file:** `docs/superpowers/specs/2026-07-14-extension-maxretries-migration-design.md` (commit `6ca3ae3`).
- **No UI changes** — no `AdvancedConfig` field, no `DataInput` form field, no i18n string.

---

## File Structure

| File                                                     | Responsibility                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/extension/src/agent/constants.ts`              | Add `migrateMaxRetries(config: LLMConfig): LLMConfig` — pure, returns same reference when no migration is needed, otherwise returns a new object without `maxRetries`.   |
| `packages/extension/src/agent/useAgent.ts`               | In the storage-load `useEffect` (around line 96), call `migrateMaxRetries` after `migrateLegacyEndpoint`. Widen the existing `set` call to fire on any reference change. |
| `packages/extension/src/agent/constants.test.ts` _(new)_ | Vitest unit tests for `migrateMaxRetries`: stripping at boundary values, no-op for `undefined` / `>= 10`, reference identity preserved when no change.                   |
| `packages/extension/vitest.config.ts` _(new)_            | Minimal Vitest config mirroring `packages/llms/vitest.config.ts`. Runs only the new test file (no workspace-wide run from extension).                                    |
| `packages/extension/package.json`                        | Add `"test": "vitest run"` script.                                                                                                                                       |

---

### Task 1: Add Vitest setup to `packages/extension`

**Files:**

- Create: `packages/extension/vitest.config.ts`
- Modify: `packages/extension/package.json` (add `"test"` script)

**Interfaces:**

- Consumes: nothing.
- Produces: `npm test -w @page-agent/extension` (or `cd packages/extension && npx vitest run`) executes Vitest and exits with a clear summary. The config does not interfere with WXT's build pipeline.

- [ ] **Step 1.1: Inspect `packages/llms/vitest.config.ts` for the pattern**

Run: `cat packages/llms/vitest.config.ts`
Expected: minimal config (likely `defineConfig({ test: { environment: 'node' } })` or similar).

- [ ] **Step 1.2: Create `packages/extension/vitest.config.ts`**

Mirror the `llms` config exactly, e.g.:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
})
```

- [ ] **Step 1.3: Add `test` script to `packages/extension/package.json`**

Locate the `"scripts"` block in `packages/extension/package.json`. Add `"test": "vitest run"` next to the other scripts (do not reorder, do not touch unrelated fields). Match the exact script name and command used by the `llms` package so the root `npm test` `--workspaces --if-present` loop picks it up consistently.

- [ ] **Step 1.4: Verify the script is wired**

Run: `npm test -w @page-agent/extension`
Expected: Vitest reports "No test files found" (or equivalent) and exits 0 — the runner starts, finds no `*.test.ts` yet, and passes. This proves the script works without false positives.

- [ ] **Step 1.5: Commit**

```bash
git add packages/extension/vitest.config.ts packages/extension/package.json
git commit -m "test(extension): scaffold vitest for unit tests

Mirror packages/llms/vitest.config.ts. Adds the 'test' script so
npm test -w @page-agent/extension is wired (it currently finds no
test files and passes). No new dependencies."
```

---

### Task 2: Add `migrateMaxRetries` pure function with failing tests first

**Files:**

- Modify: `packages/extension/src/agent/constants.ts`
- Test: `packages/extension/src/agent/constants.test.ts` (new)

**Interfaces:**

- Consumes: nothing (pure function over an `LLMConfig` shape).
- Produces:

```ts
export function migrateMaxRetries(config: LLMConfig): LLMConfig
```

- Returns the **same** object reference when no migration is needed (i.e. `config.maxRetries === undefined` OR `config.maxRetries >= 10`).
- Otherwise returns a **new** object without the `maxRetries` key (cast to `LLMConfig`). The rest of the object is preserved byte-for-byte.

Behavior matrix this function must satisfy:

| Input `maxRetries` | Output                           |
| ------------------ | -------------------------------- |
| `undefined`        | same reference                   |
| `0`                | new object, `maxRetries` removed |
| `2`                | new object, `maxRetries` removed |
| `9`                | new object, `maxRetries` removed |
| `10`               | same reference                   |
| `15`               | same reference                   |
| `50`               | same reference                   |

The threshold constant lives in the file as `MAX_RETRIES_TARGET = 10` (mirrors `packages/llms/src/index.ts:104`). A short comment must point to that library line so a future reader knows where the magic number came from.

- [ ] **Step 2.1: Write the failing tests**

Create `packages/extension/src/agent/constants.test.ts`:

```ts
import type { LLMConfig } from '@page-agent/llms'
import { describe, expect, it } from 'vitest'

import { migrateMaxRetries } from './constants'

const baseConfig: LLMConfig = {
    baseURL: 'https://example.com/v1',
    model: 'some-model',
    apiKey: 'test-key',
}

describe('migrateMaxRetries', () => {
    it('returns the same reference when maxRetries is undefined', () => {
        const input: LLMConfig = { ...baseConfig }
        expect(migrateMaxRetries(input)).toBe(input)
    })

    it('returns the same reference when maxRetries >= 10', () => {
        const at10: LLMConfig = { ...baseConfig, maxRetries: 10 }
        const at15: LLMConfig = { ...baseConfig, maxRetries: 15 }
        const at50: LLMConfig = { ...baseConfig, maxRetries: 50 }
        expect(migrateMaxRetries(at10)).toBe(at10)
        expect(migrateMaxRetries(at15)).toBe(at15)
        expect(migrateMaxRetries(at50)).toBe(at50)
    })

    it('strips maxRetries when it is below 10', () => {
        const cases: Array<LLMConfig['maxRetries']> = [0, 1, 2, 5, 9]
        for (const value of cases) {
            const input: LLMConfig = { ...baseConfig, maxRetries: value }
            const result = migrateMaxRetries(input)
            expect(result).not.toBe(input)
            expect(result).not.toHaveProperty('maxRetries')
            expect(result.baseURL).toBe(baseConfig.baseURL)
            expect(result.model).toBe(baseConfig.model)
            expect(result.apiKey).toBe(baseConfig.apiKey)
        }
    })

    it('does not mutate the input object', () => {
        const input: LLMConfig = { ...baseConfig, maxRetries: 2 }
        const snapshot = { ...input }
        migrateMaxRetries(input)
        expect(input).toEqual(snapshot)
    })
})
```

- [ ] **Step 2.2: Run the test to verify it fails**

Run: `npm test -w @page-agent/extension`
Expected: FAIL with "migrateMaxRetries is not a function" (or "Cannot find module './constants'" until the export is added).

- [ ] **Step 2.3: Implement `migrateMaxRetries`**

Append the following to `packages/extension/src/agent/constants.ts` (preserve all existing exports — only add to the file, do not reorder or reformat existing code):

```ts
// Matches the library default in packages/llms/src/index.ts:104.
// Bump in lockstep with that default or extend this helper if the
// library default changes again.
const MAX_RETRIES_TARGET = 10

/**
 * Strip a stale `maxRetries` value (< MAX_RETRIES_TARGET) from a stored
 * LLMConfig so it falls back to the library default. Pure function:
 * returns the same object reference when no migration is needed, a new
 * object without the field when it is.
 */
export function migrateMaxRetries(config: LLMConfig): LLMConfig {
    if (config.maxRetries !== undefined && config.maxRetries < MAX_RETRIES_TARGET) {
        const { maxRetries: _drop, ...rest } = config
        return rest as LLMConfig
    }
    return config
}
```

- [ ] **Step 2.4: Run the test to verify it passes**

Run: `npm test -w @page-agent/extension`
Expected: all 4 tests pass. The unused-variable lint rule may flag `_drop` — if so, switch to `const { maxRetries, ...rest } = config; void maxRetries; return rest as LLMConfig` (still pure, just consumes the binding).

- [ ] **Step 2.5: Lint the new code**

Run: `npm run lint -- packages/extension/src/agent/constants.ts packages/extension/src/agent/constants.test.ts`
Expected: clean exit. If the only complaint is the destructured `maxRetries` name, apply the `void maxRetries` fix from Step 2.4.

- [ ] **Step 2.6: Commit**

```bash
git add packages/extension/src/agent/constants.ts packages/extension/src/agent/constants.test.ts
git commit -m "feat(extension): add migrateMaxRetries helper

Pure function: returns the same LLMConfig reference when no migration
is needed, otherwise a new object without the maxRetries field. Mirrors
the existing migrateLegacyEndpoint shape. Magic number 10 mirrors the
library default in packages/llms/src/index.ts:104."
```

---

### Task 3: Wire `migrateMaxRetries` into `useAgent.ts` storage load

**Files:**

- Modify: `packages/extension/src/agent/useAgent.ts` (around lines 96-113)

**Interfaces:**

- Consumes: `migrateMaxRetries(config: LLMConfig): LLMConfig` (from Task 2).
- Produces: same external `UseAgentResult` shape. Internal: the stored `chrome.storage.local.llmConfig` is rewritten to the migrated form on next load, the second `set({ llmConfig: DEMO_CONFIG })` branch becomes effectively dead for fresh installs (kept for diff minimality per the spec).

- [ ] **Step 3.1: Read the current load block**

Read `packages/extension/src/agent/useAgent.ts` lines 95-120. Confirm the `useEffect` shape and the existing `migrateLegacyEndpoint` call. The current code is:

```ts
useEffect(() => {
    chrome.storage.local.get(['llmConfig', 'language', 'advancedConfig']).then((result) => {
        let llmConfig = (result.llmConfig as LLMConfig) ?? DEMO_CONFIG
        const language = (result.language as SupportedLanguage) || undefined
        const advancedConfig = (result.advancedConfig as AdvancedConfig) ?? {}

        // Auto-migrate legacy testing endpoints
        const migrated = migrateLegacyEndpoint(llmConfig)
        if (migrated !== llmConfig) {
            llmConfig = migrated
            chrome.storage.local.set({ llmConfig: migrated })
        } else if (!result.llmConfig) {
            chrome.storage.local.set({ llmConfig: DEMO_CONFIG })
        }

        const initialConfig = { ...llmConfig, ...advancedConfig, language }
        setConfig(initialConfig)
        setupAgent(initialConfig)
    })
    // ...
}, [setupAgent])
```

- [ ] **Step 3.2: Update the import line**

Change the import near the top of `useAgent.ts`:

```ts
import { DEMO_CONFIG, migrateLegacyEndpoint, migrateMaxRetries } from './constants'
```

- [ ] **Step 3.3: Replace the migration block**

Replace the legacy-endpoint migration block with the following. Match indentation (tabs) and trailing-comma style to the existing file:

```ts
// Auto-migrate legacy testing endpoints
let migrated = migrateLegacyEndpoint(llmConfig)
if (migrated !== llmConfig) {
    llmConfig = migrated
}

// Auto-migrate stale maxRetries (library default bumped from 2 → 10)
migrated = migrateMaxRetries(llmConfig)
if (migrated !== llmConfig) {
    llmConfig = migrated
}

if (llmConfig !== (result.llmConfig as LLMConfig | undefined)) {
    chrome.storage.local.set({ llmConfig })
}
if (!result.llmConfig) {
    chrome.storage.local.set({ llmConfig: DEMO_CONFIG })
}
```

Note: the second `if (!result.llmConfig)` block remains dead code for fresh installs (no field gets stripped from `DEMO_CONFIG`). Kept intentionally per spec ("kept for diff minimality").

- [ ] **Step 3.4: Typecheck**

Run: `npm run typecheck`
Expected: passes. If the unused `let migrated` causes an ESLint warning, switch to two `const` lines:

```ts
const legacyMigrated = migrateLegacyEndpoint(llmConfig)
if (legacyMigrated !== llmConfig) {
    llmConfig = legacyMigrated
}

const retriesMigrated = migrateMaxRetries(llmConfig)
if (retriesMigrated !== llmConfig) {
    llmConfig = retriesMigrated
}
```

- [ ] **Step 3.5: Lint the modified file**

Run: `npm run lint -- packages/extension/src/agent/useAgent.ts`
Expected: clean exit. Apply the `const`-rename fix from Step 3.4 only if a real lint rule fires.

- [ ] **Step 3.6: Re-run unit tests**

Run: `npm test -w @page-agent/extension`
Expected: still 4 tests pass. `useAgent.ts` is not under test (no test infra for React hooks yet, and adding one is out of scope per the spec).

- [ ] **Step 3.7: Commit**

```bash
git add packages/extension/src/agent/useAgent.ts
git commit -m "feat(extension): auto-migrate stale maxRetries on load

Existing users with chrome.storage.local.llmConfig.maxRetries: 2
(legacy default) now get stripped on next reload so parseLLMConfig
falls back to the library default of 10 (= 11 calls per step).
Reference-identity check is widened to fire on any migration
(legacy endpoint OR maxRetries)."
```

---

## Self-Review

**1. Spec coverage**

- [x] Goal "existing users get maxRetries: 10 on next reload" → Task 3 (rewrites stored config when helper strips it).
- [x] Goal "without losing any other field" → Task 2 (only `maxRetries` is destructured out; `...rest` keeps everything else).
- [x] Non-Goal "no library change" → no Task touches `packages/llms`.
- [x] Non-Goal "no UI" → no Task touches UI files.
- [x] Non-Goal "magic number 10 hard-coded" → Task 2 has `MAX_RETRIES_TARGET = 10` constant with a comment pointing to the library line.
- [x] Non-Goal "consistent with migrateLegacyEndpoint" → Task 3 uses identical reference-identity pattern.
- [x] Data flow → Task 3 reflects it in the code block.
- [x] Error handling → `migrateMaxRetries` is pure; cannot throw. `chrome.storage.local.set` rejection is downstream (existing pattern). Covered.
- [x] Behavior matrix → Task 2 tests cover the boundary cases.
- [x] Out-of-scope follow-ups (UI setting, versioned registry, Vitest for the rest) → not included.

**2. Placeholder scan**

- No "TBD", "TODO", "fill in details" in any step.
- No "similar to Task N" — every code block is self-contained.
- No "add appropriate error handling" / "handle edge cases" hand-waves — pure function by construction, error handling explicitly out of scope in spec.

**3. Type consistency**

- `migrateMaxRetries(config: LLMConfig): LLMConfig` declared in Task 2, consumed in Task 3, imported in Task 3 — consistent.
- Reference identity semantics declared in Task 2 (`same reference when no change, new object when migrate`) and exercised in Task 2 tests with `.toBe(input)` (reference) and `.not.toBe(input)` (new object). Task 3 uses `!==` comparison accordingly. Consistent.

No issues found.

## Verification

- `npm test -w @page-agent/extension` — passes (4 tests).
- `npm run typecheck` — passes.
- `npm run lint -- packages/extension/src/agent/` — clean.
- Manual smoke (out of scope for plan execution, documented in spec):
    1. Set `chrome.storage.local.llmConfig = { baseURL, model, maxRetries: 2 }`.
    2. Reload extension.
    3. Inspect storage: `maxRetries` gone.
    4. Trigger failing LLM task → activity badge shows `Retrying (1/10)...`.
