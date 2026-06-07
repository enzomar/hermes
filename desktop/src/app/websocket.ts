/**
 * WebSocket connection manager.
 * Handles connection, reconnection with exponential backoff,
 * and message dispatch.
 */

import { WS_URL } from "./config";

export type WsMessageHandler = (envelope: { type: string; payload: any }) => void;
export type WsStatusHandler = (status: "connected" | "disconnected" | "reconnecting", detail?: string) => void;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

export class HermesSocket {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private onMessage: WsMessageHandler,
    private onStatus: WsStatusHandler,
  ) {}

  /** Connect (or reconnect) to the backend WebSocket. */
  connect(): void {
    this.cleanup();
    if (this.destroyed) return;

    const socket = new WebSocket(WS_URL);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.onStatus("connected");
    };

    socket.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        this.onMessage(envelope);
      } catch (err) {
        console.error("[ws] Failed to parse message:", err);
      }
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onclose = (event) => {
      this.socket = null;
      if (this.destroyed) return;
      if (event.code === 1000) {
        this.onStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    };
  }

  /** Send a raw JSON message (rarely used — most comms are HTTP). */
  send(data: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  /** Permanently close the connection without reconnecting. */
  destroy(): void {
    this.destroyed = true;
    this.cleanup();
  }

  /** Whether the socket is currently open. */
  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** The raw WebSocket instance (for backward compat). */
  get raw(): WebSocket | null {
    return this.socket;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try { this.socket.close(); } catch { /* ignore */ }
      this.socket = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY,
    );
    this.reconnectAttempts++;
    this.onStatus("reconnecting", `attempt ${this.reconnectAttempts}`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
