# Extension `maxRetries` Migration on Load — Design

**Date:** 2026-07-14
**Status:** Draft (pending user review)
**Scope:** `packages/extension` (config load path), depends on library default from `packages/llms`.

## Problem

Commit `85b0087 fix(llms): raise default maxRetries from 2 to 10` bumped the library-level default `maxRetries` in `packages/llms/src/index.ts:104` from 2 → 10. The intent was to give each agent step up to **11 total LLM calls** (1 initial + 10 retries) so transient network failures don't halt the agent.

In practice, existing extension users still see `Retrying (1/2)...` in the activity badge. Root cause: the extension persists its LLM config to `chrome.storage.local` via `useAgent.ts:97` (`result.llmConfig ?? DEMO_CONFIG`). Stored configs from before the bump contain `maxRetries: 2`, which wins over the library default because `parseLLMConfig` only falls back when the field is `undefined` (`packages/llms/src/index.ts:104`).

This is a **failure-mode trap**: users hit transient LLM failures, the agent retries once (so 2 total attempts), then throws. The whole task halts at the first bad call.

## Goal

Existing extension users, on next reload, get `maxRetries: 10` (= 11 calls per step) automatically — without losing any other field of their stored config, without UI changes, without a library bump.

## Non-Goals

- No change to `packages/llms` (library default is already 10; no need to repeat the bump).
- No UI for `maxRetries` (e.g. not adding it to `AdvancedConfig`). Spec lives in `packages/extension/src/agent/`.
- No change to `DEMO_CONFIG` or new user flow — fresh installs already get the library default 10.
- No automatic coupling to future library default bumps (e.g. if library goes to 15 tomorrow, extension does not auto-follow — this is intentional, see "Magic number" below).
- No general config-migration framework. Just one focused helper, consistent with the existing `migrateLegacyEndpoint` pattern.

## Architecture

### Files touched (2)

| File                                        | Change                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension/src/agent/constants.ts` | Add `migrateMaxRetries(config: LLMConfig): LLMConfig` — pure function returning a new object with `maxRetries` removed if its value is `< 10` and `< 11`.                       |
| `packages/extension/src/agent/useAgent.ts`  | In the storage-load `useEffect`, apply `migrateMaxRetries` after `migrateLegacyEndpoint`. If the result differs, re-write to `chrome.storage.local` (same pattern as existing). |

### `migrateMaxRetries` semantics

```ts
// packages/extension/src/agent/constants.ts
const MAX_RETRIES_TARGET = 10 // matches library default in packages/llms/src/index.ts:104

export function migrateMaxRetries(config: LLMConfig): LLMConfig {
    if (config.maxRetries !== undefined && config.maxRetries < MAX_RETRIES_TARGET) {
        const { maxRetries, ...rest } = config
        return rest as LLMConfig
    }
    return config
}
```

Returns the **same object reference** when no migration is needed — caller uses `===` check to decide whether to persist.

### Behavior matrix

| Stored `maxRetries` | Library default | After migration  | UI shows             |
| ------------------- | --------------- | ---------------- | -------------------- |
| `undefined`         | 10              | unchanged        | `Retrying (1/10)` ✅ |
| `2`                 | 10              | stripped         | `Retrying (1/10)` ✅ |
| `5`                 | 10              | stripped         | `Retrying (1/10)` ✅ |
| `10`                | 10              | unchanged        | `Retrying (1/10)` ✅ |
| `15`                | 10              | unchanged (≥ 10) | `Retrying (1/15)` ✅ |
| `50`                | 10              | unchanged (≥ 10) | `Retrying (1/50)` ✅ |

### Call site change in `useAgent.ts`

Current (`useAgent.ts:96-113`):

```ts
chrome.storage.local.get(['llmConfig', 'language', 'advancedConfig']).then((result) => {
    let llmConfig = (result.llmConfig as LLMConfig) ?? DEMO_CONFIG
    // ... language, advancedConfig ...

    // Auto-migrate legacy testing endpoints
    const migrated = migrateLegacyEndpoint(llmConfig)
    if (migrated !== llmConfig) {
        llmConfig = migrated
        chrome.storage.local.set({ llmConfig: migrated })
    } else if (!result.llmConfig) {
        chrome.storage.local.set({ llmConfig: DEMO_CONFIG })
    }
    // ...
})
```

After:

```ts
chrome.storage.local.get(['llmConfig', 'language', 'advancedConfig']).then((result) => {
    let llmConfig = (result.llmConfig as LLMConfig) ?? DEMO_CONFIG
    // ... language, advancedConfig ...

    // Auto-migrate legacy testing endpoints
    llmConfig = migrateLegacyEndpoint(llmConfig)

    // Auto-migrate stale maxRetries (library default bumped from 2 → 10)
    llmConfig = migrateMaxRetries(llmConfig)

    if (llmConfig !== result.llmConfig) {
        chrome.storage.local.set({ llmConfig })
    }
    if (!result.llmConfig) {
        // ... unchanged ...
    }
    // ...
})
```

Note: the second `if (!result.llmConfig)` branch becomes dead code when both migrations apply to a fresh install (since `DEMO_CONFIG` has no `maxRetries`, no endpoint migration needed). Left unchanged to keep diff minimal.

## Magic number rationale

`MAX_RETRIES_TARGET = 10` is **hard-coded** in `constants.ts`, mirroring the library default at the time this spec is written. Trade-off:

- **Pro:** Zero coupling between extension and an internal library export. Simple, deterministic. If the library bumps the default again, the extension's migration does not silently re-trigger on existing users — predictable.
- **Con:** If the library bumps to 15 next month, extension still enforces "≥ 10 is fine". Users with `maxRetries: 11` from a future library bump would not get bumped by this code.

This is acceptable per the user's explicit choice: "Magic number 10, hard-coded". If/when the library bumps again, a new extension-side migration (or a general versioned migration registry) can be added as a follow-up spec.

## Data flow

```
chrome.storage.local.get(['llmConfig', ...])
  → raw llmConfig
  → migrateLegacyEndpoint(raw)            // existing
  → migrateMaxRetries(previous)            // NEW
  → if (final !== raw) chrome.storage.local.set({ llmConfig: final })  // existing pattern, widened
  → setConfig / setupAgent
```

No message-passing, no async coordination beyond `chrome.storage.local` (which is single-tab-scoped per origin). Race with another tab loading the same extension is benign — last-write-wins, both tabs converge.

## Error handling

- `migrateMaxRetries` is a pure function — cannot throw under any `LLMConfig` shape (destructure on `undefined` field returns `{}`, no spread error).
- If `chrome.storage.local.set` rejects, the existing call already wraps in `.catch(console.error)` downstream — same error path applies here.

## Testing

**No automated test.** Extension package has no Vitest setup (`packages/extension/` contains zero `*.test.ts`). Adding one for a 6-line pure function is out of scope per "Non-Goals". The function is small, side-effect-free, and easy to verify manually:

1. Open `chrome://extensions` → load unpacked extension → DevTools → Application → Storage → `chrome.storage.local`.
2. Manually set `llmConfig = { baseURL: '...', model: '...', maxRetries: 2 }`.
3. Reload the extension.
4. Inspect storage: `maxRetries` should be gone.
5. Trigger a task that fails the LLM call once → activity badge should read `Retrying (1/10)...`.

If a future spec adds Vitest to the extension, this function is a clean first test target.

## Risk

| Risk                                                          | Likelihood | Mitigation                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored config has only `maxRetries` field, nothing else valid | Low        | `parseLLMConfig` requires `baseURL` and `model`; if missing, library throws early. Unrelated to this migration.                                                                              |
| Multiple tabs race on load                                    | Low        | `chrome.storage.local` is atomic per operation. Both tabs converge to the migrated shape.                                                                                                    |
| Future library default bump to e.g. 15                        | Medium     | Acceptable per user's choice. Follow-up spec can extend migration or move to a versioned registry.                                                                                           |
| User explicitly wants low `maxRetries` (e.g. 3)               | Low        | They re-save through `configure()` (UI). The migration runs again next load and strips 3 → undefined → default 10. Same behavior as today for legacy users; document if it becomes an issue. |

## Out-of-scope follow-ups (not part of this spec)

1. UI setting for `maxRetries` in extension options.
2. General versioned migration registry for `LLMConfig` (would be the right place to add bumping-from-default logic if this becomes a recurring need).
3. Vitest setup in `packages/extension`.

## Verification

Manual proof per "Testing" section above. Build verification:

- `npm run typecheck -w extension` (or root `npm run typecheck`) passes.
- `npm run lint` passes for the modified files.
- `npm run build:ext` produces a working extension ZIP.
