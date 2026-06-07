/**
 * Action Router — maps data-action attribute strings to handler functions.
 * 
 * This module will progressively replace the monolithic switch statement
 * in app.ts as feature modules are extracted.
 * 
 * Usage: Import and call `routeAction(action, payload)` from app.ts event handlers.
 * Returns true if the action was handled, false if it should fall through to app.ts.
 */

import type { ActionPayload } from "../types";

type ActionHandler = (payload: ActionPayload) => Promise<void> | void;

const ACTION_MAP: Record<string, ActionHandler> = {
  // Populated as features are extracted from app.ts
  // Example:
  // "create-session": sessions.createSession,
  // "open-settings": settings.openSettings,
};

/**
 * Attempt to route an action. Returns true if handled.
 */
export async function routeAction(action: string, payload: ActionPayload = {}): Promise<boolean> {
  const handler = ACTION_MAP[action];
  if (!handler) return false;
  await handler(payload);
  return true;
}

/**
 * Register action handlers from a feature module.
 */
export function registerActions(actions: Record<string, ActionHandler>): void {
  Object.assign(ACTION_MAP, actions);
}
