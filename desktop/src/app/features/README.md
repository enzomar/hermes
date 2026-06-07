# Feature Modules — Extraction Guide

## Status

The `features/` directory is set up with the action router pattern ready.
The monolithic `app.ts` needs to be decomposed into these modules.

## Extraction Order (safest first)

### 1. `attachments.ts` (~50 lines)
Functions: `readPendingAttachment`, `normalizeAttachmentContent`, `looksTextAttachment`, `guessAttachmentMimeType`
Constants: `MAX_ATTACHMENT_BYTES`, `TEXT_ATTACHMENT_EXTENSIONS`, `MAX_CHAT_ATTACHMENTS`
Dependencies: Only `PendingAttachment` type from types.ts

### 2. `sessions.ts` (~200 lines)
Functions: `createSession`, `deleteSession`, `switchSession`, `switchRelativeSession`, `duplicateSession`, `shareSession`, `saveInlineSessionRename`, `cancelInlineSessionRename`, `beginInlineSessionRename`
Dependencies: `state`, `requestJson`, `refreshBootstrap`, `setFeedback`, `render`, `persistWorkspaceState`

### 3. `commandPalette.ts` (~150 lines)
Functions: `openCommandPalette`, `closeCommandPalette`, `getFilteredPaletteCommands`, `getPaletteCommands`
Dependencies: `state`, `renderCommandPalette`

### 4. `mcpSettings.ts` (~300 lines)
Functions: `addMcpServer`, `deleteMcpServer`, `toggleMcpServer`, `editMcpServer`, `clearMcpServerForm`, `handleTransportToggle`, `renderSettingsMcpList`, `renderSettingsMcpFormState`
Dependencies: `state`, `requestJson`, `setSettingsFeedback`, `settingsConfigSnapshot`

### 5. `mcpInspector.ts` (~200 lines)
Functions: `selectMcpInspectorTool`, `runMcpInspectorTool`, `resetMcpRunnerArgs`, `renderMcpInspectorView`, `syncToolRunnerState`
Dependencies: `state`, `requestJson`, `setMcpRunnerFeedback`

### 6. `benchmark.ts` (~400 lines)
Functions: `openBenchmark`, `closeBenchmark`, `runBenchmark`, `openBenchmarkReport`, `refreshBenchmarkReport`, `renderBenchmarkWorkspace`, `renderBenchmarkSplitView`, `renderBenchmarkReportOverlay`
Dependencies: `state`, `requestJson`, `setFeedback`

### 7. `llmProfiles.ts` (~500 lines, most complex)
Functions: `hydrateLlmProfiles`, `createLlmProfileDraft`, `renderSettingsLlmProfiles`, `syncSelectedLlmProfileDraft`, `populateSelectedLlmProfileForm`, `serializeLlmProfile`, `validateLlmProfileCollection`, `buildLlmConfigPayload`, `ensureLlmProfileSelection`, all profile CRUD
Dependencies: `state`, `settingsLlmState` (module-level), most other settings functions

### 8. `settings.ts` (~300 lines)
Functions: `openSettings`, `closeSettings`, `populateSettings`, `saveSettings`, `testLlm`, `saveGeneralSettings`, `renderSettingsUI`, `renderSettingsOverview`
Dependencies: Almost everything (orchestrates other modules)

### 9. `chat.ts` (~300 lines)
Functions: `handleSubmit`, `handleBenchmarkSubmit`, `buildChatRequestPayload`, `connectSocket`, `applyBootstrap`, `applyEvent`, `render`
Dependencies: `state`, WebSocket, all render functions

### 10. `lab.ts` (~100 lines)
Functions: Lab panel rendering and navigation

## How to Extract

For each module:
1. Create `features/<name>.ts`
2. Move functions + their module-level dependencies
3. Import shared deps: `import { state } from "../state"`
4. Re-export from `app.ts`: `export { fn1, fn2 } from "./features/<name>"`
5. Run `npm run build` to verify
6. Test the feature in the browser

## Key Challenge

The `settingsLlmState` object and `settingsConfigSnapshot` are module-level state
shared across settings, llmProfiles, and mcpSettings. These need to be moved to
a `features/settingsState.ts` shared module before extracting those features.
