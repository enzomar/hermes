import type { HermesState } from "../types";
import { escapeHtml } from "../utils";

export function renderOnboarding(state: HermesState): string {
  const hasServers = state.servers.length > 0;
  const hasTools = state.tools.length > 0;
  const hasModel = state.ui.modelConfigured || false;
  const allReady = hasServers && hasTools && hasModel;

  return `
    <div class="onboarding-header">
      <h1>Welcome to Hermes</h1>
      <p class="onboarding-subtitle">Your AI workspace with connected tools</p>
    </div>

    <div class="onboarding-content">
      <section class="onboarding-section">
        <h2>What is Hermes?</h2>
        <p>Hermes is a developer-focused AI workbench that connects large language models with tools through the Model Context Protocol (MCP). Unlike standard chat interfaces, Hermes gives you:</p>
        <ul class="onboarding-list">
          <li><strong>Tool connections</strong> - Execute filesystem operations, run shell commands, query databases, and more</li>
          <li><strong>Manual tool execution</strong> - Test and run tools independently of the LLM</li>
          <li><strong>Full observability</strong> - Inspect every request, response, and tool call</li>
          <li><strong>Any LLM provider</strong> - OpenAI, Anthropic, local models, or custom endpoints</li>
        </ul>
      </section>

      <section class="onboarding-section">
        <h2>Setup Checklist</h2>
        <div class="onboarding-checklist">
          <div class="checklist-item ${hasModel ? "completed" : ""}">
            <span class="checklist-icon">${hasModel ? "✓" : "1"}</span>
            <div class="checklist-content">
              <strong>Configure AI Model</strong>
              <p>Set up your LLM provider (OpenAI, Anthropic, local, etc.)</p>
              <button type="button" class="inline-action" data-action="open-settings" data-settings-tab="ai">Configure AI →</button>
            </div>
          </div>

          <div class="checklist-item ${hasServers ? "completed" : ""}">
            <span class="checklist-icon">${hasServers ? "✓" : "2"}</span>
            <div class="checklist-content">
              <strong>Connect Tools</strong>
              <p>Add MCP servers to give Hermes capabilities (filesystem, shell, etc.)</p>
              <button type="button" class="inline-action" data-action="open-mcp-settings">Connect Tools →</button>
            </div>
          </div>

          <div class="checklist-item ${allReady ? "completed" : ""}">
            <span class="checklist-icon">${allReady ? "✓" : "3"}</span>
            <div class="checklist-content">
              <strong>Start Chatting</strong>
              <p>${allReady ? "You're all set! Start a conversation below." : "Complete steps 1 & 2, then start chatting."}</p>
              ${allReady ? '<button type="button" class="primary-button" data-action="close-onboarding">Get Started →</button>' : ""}
            </div>
          </div>
        </div>
      </section>

      ${hasServers && hasTools ? `
        <section class="onboarding-section">
          <h3>Quick Tour</h3>
          <div class="onboarding-features">
            <div class="feature-card">
              <span class="feature-icon">💬</span>
              <strong>Chat</strong>
              <p>Main workspace for AI conversations with tool access</p>
            </div>
            <div class="feature-card">
              <span class="feature-icon">⚙</span>
              <strong>Settings</strong>
              <p>Configure AI profiles, review connected tools, and tune workspace behavior</p>
              <button type="button" class="inline-action" data-action="open-settings" data-settings-tab="ai">Open Settings</button>
            </div>
            <div class="feature-card">
              <span class="feature-icon">⌘K</span>
              <strong>Command Palette</strong>
              <p>Quick access to all actions via keyboard</p>
              <button type="button" class="inline-action" data-action="open-command-palette">Try it</button>
            </div>
          </div>
        </section>
      ` : ""}

      <section class="onboarding-section">
        <h3>Example: Filesystem Tool</h3>
        <div class="onboarding-example">
          <p>Once you connect a filesystem server, you can ask:</p>
          <div class="example-prompt">"List all TypeScript files in the src directory"</div>
          <div class="example-prompt">"Read the contents of README.md"</div>
          <div class="example-prompt">"Create a new file called notes.txt with 'Hello World'"</div>
          <p class="onboarding-hint">The AI will use tools to complete these tasks automatically.</p>
        </div>
      </section>
    </div>

    <div class="onboarding-footer">
      <button type="button" class="secondary-button" data-action="skip-onboarding">Skip for now</button>
      ${allReady ? '<button type="button" class="primary-button" data-action="close-onboarding">Start Using Hermes</button>' : ""}
    </div>
  `;
}

export function shouldShowOnboarding(state: HermesState): boolean {
  // Show onboarding if:
  // 1. User hasn't dismissed it (stored in localStorage)
  // 2. No servers configured yet, OR
  // 3. First session and less than 3 messages sent

  const dismissed = localStorage.getItem("hermes-onboarding-dismissed");
  if (dismissed === "true") return false;

  // If no servers, definitely show
  if (state.servers.length === 0) return true;

  // If less than 5 total events across all sessions, show
  const totalEvents = state.events.length;
  if (totalEvents < 5) return true;

  return false;
}

export function dismissOnboarding(): void {
  localStorage.setItem("hermes-onboarding-dismissed", "true");
}
