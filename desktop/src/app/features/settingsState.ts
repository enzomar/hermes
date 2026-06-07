/**
 * Shared settings state — module-level state used by mcpSettings, llmProfiles, and settings.
 *
 * Extracted from app.ts to allow multiple feature modules to share the config snapshot
 * without circular dependencies.
 */

/** Cached copy of the full config from /api/config, refreshed on populateSettings(). */
export let settingsConfigSnapshot: Record<string, any> = {};

export function setSettingsConfigSnapshot(config: Record<string, any>): void {
  settingsConfigSnapshot = config;
}
