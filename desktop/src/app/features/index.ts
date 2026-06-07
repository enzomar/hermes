/**
 * Feature modules barrel export.
 * 
 * Each feature module encapsulates a domain of functionality
 * extracted from the monolithic app.ts.
 * 
 * Extraction order (safest first):
 * 1. actionRouter — decouples action dispatch
 * 2. sessions — session CRUD (minimal deps)
 * 3. attachments — file handling (no deps on other features)
 * 4. commandPalette — palette logic (self-contained)
 * 5. mcpSettings — MCP server CRUD
 * 6. mcpInspector — MCP tool runner
 * 7. benchmark — benchmark panel
 * 8. llmProfiles — profile management
 * 9. settings — settings panel orchestration
 * 10. chat — message compose/submit (most deps)
 * 11. lab — lab panels
 */

export { routeAction, registerActions } from "./actionRouter";
export {
  initSessions,
  createSession,
  deleteSession,
  duplicateSession,
  shareSession,
  switchRelativeSession,
  startInlineSessionRename,
  cancelInlineSessionRename,
  saveInlineSessionRename,
  persistSessionTitle,
  clearInlineSessionRename,
} from "./sessions";
export {
  initCommandPalette,
  openCommandPalette,
  closeCommandPalette,
  getFilteredPaletteCommands,
  getPaletteCommands,
} from "./commandPalette";
export {
  settingsConfigSnapshot,
  setSettingsConfigSnapshot,
} from "./settingsState";
export {
  initMcpSettings,
  addMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  editMcpServer,
  clearMcpServerForm,
  handleTransportToggle,
  renderSettingsMcpList,
  renderSettingsMcpFormState,
  renderMcpConnectionCard,
  getMcpConnectionTarget,
  getMcpConnectionStatus,
} from "./mcpSettings";
