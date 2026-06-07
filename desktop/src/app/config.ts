type HermesImportMetaEnv = ImportMetaEnv & {
	readonly VITE_HERMES_API_BASE?: string;
	readonly VITE_HERMES_WS_URL?: string;
	readonly VITE_HERMES_PAYPAL_URL?: string;
	readonly VITE_HERMES_FORMSPREE_ENDPOINT?: string;
};

const env = import.meta.env as HermesImportMetaEnv;

export const API_BASE = env.VITE_HERMES_API_BASE || "http://127.0.0.1:8765";
export const WS_URL = env.VITE_HERMES_WS_URL || "ws://127.0.0.1:8765/ws";
export const PAYPAL_URL = env.VITE_HERMES_PAYPAL_URL || "https://www.paypal.com/donate/?hosted_button_id=YOUR_BUTTON_ID";
export const FORMSPREE_ENDPOINT = env.VITE_HERMES_FORMSPREE_ENDPOINT || "https://formspree.io/f/your-form-id";
export const PAYPAL_CONFIGURED = !PAYPAL_URL.includes("YOUR_BUTTON_ID");
export const FORMSPREE_CONFIGURED = !FORMSPREE_ENDPOINT.endsWith("/your-form-id");
export const STORAGE_KEY = "hermes.desktop.workspace.v3";
export const MAX_RECENT_SESSIONS = 6;