/**
 * Lab section root component — coordinates Lab sub-panel navigation.
 *
 * The Lab section is primarily rendered by app.ts which owns the sidebar + panel
 * dispatching. This module re-exports the panel renderers for use by external
 * consumers and provides a unified entry point for the Lab feature.
 */

export { renderLabDatasets } from "./lab-datasets";
export { renderLabExperiments } from "./lab-experiments";
export { renderLabRunMonitor } from "./lab-run-monitor";
export { renderLabDashboard } from "./lab-dashboard";
export { renderLabTraceDiff } from "./lab-trace-diff";
