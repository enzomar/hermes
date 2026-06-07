import { FORMSPREE_CONFIGURED, PAYPAL_CONFIGURED } from "./config";

export function renderAppLayout(root: HTMLDivElement): void {
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" aria-label="Application navigation">
        <div class="sidebar-inner">
          <!-- Brand -->
          <div class="sidebar-brand">
            <button class="brand-button" data-action="toggle-sidebar" title="Toggle sidebar">
              <span class="brand-mark" aria-hidden="true">H</span>
              <span class="brand-copy"><strong>Hermes</strong></span>
            </button>
          </div>

          <!-- Mode Navigation (vertical) -->
          <nav class="sidebar-nav" role="tablist" aria-label="Application mode">
            <button class="sidebar-nav-item active" data-action="set-app-mode" data-mode="chat" role="tab" aria-selected="true">
              <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span class="sidebar-nav-label">Chat</span>
            </button>
            <button class="sidebar-nav-item" data-action="set-app-mode" data-mode="mcp-inspect" role="tab" aria-selected="false">
              <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              <span class="sidebar-nav-label">MCP</span>
            </button>
            <button class="sidebar-nav-item" data-action="set-app-mode" data-mode="benchmark" role="tab" aria-selected="false">
              <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="9" height="9" rx="1"/><rect x="14" y="1" width="9" height="9" rx="1"/><rect x="1" y="14" width="9" height="9" rx="1"/><rect x="14" y="14" width="9" height="9" rx="1"/></svg>
              <span class="sidebar-nav-label">Compare</span>
            </button>
            <button class="sidebar-nav-item" data-action="set-app-mode" data-mode="debug-timeline" role="tab" aria-selected="false">
              <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="sidebar-nav-label">Timeline</span>
            </button>
            <button class="sidebar-nav-item" data-action="set-app-mode" data-mode="lab" role="tab" aria-selected="false">
              <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v7l4 9H5l4-9V3z"/><path d="M9 3h6"/></svg>
              <span class="sidebar-nav-label">Lab</span>
            </button>
            <button class="sidebar-nav-item" data-action="set-app-mode" data-mode="debug-api" role="tab" aria-selected="false">
              <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              <span class="sidebar-nav-label">Debug</span>
            </button>
          </nav>

          <!-- Spacer -->
          <div class="sidebar-spacer"></div>

          <!-- Settings (bottom) -->
          <div class="sidebar-footer">
            <button class="sidebar-nav-item" data-action="open-settings">
              <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 9 3.17V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span class="sidebar-nav-label">Settings</span>
            </button>
          </div>
        </div>
      </aside>

      <div class="main-content">
        <header class="app-topbar" aria-label="Application toolbar">
          <div class="app-topbar-left">
            <span id="app-topbar-mode" class="app-topbar-mode"></span>
          </div>
          <div class="app-topbar-right">
            <button type="button" class="topbar-icon-btn" data-action="open-help" aria-label="Help" title="Help &amp; Documentation">
              <span aria-hidden="true">?</span>
            </button>
            <button type="button" class="topbar-icon-btn" data-action="open-support" aria-label="Support Hermes" title="Support Hermes">
              <span aria-hidden="true">♡</span>
            </button>
            <button type="button" class="topbar-icon-btn" data-action="open-contact" aria-label="Contact" title="Contact the author">
              <span aria-hidden="true">✉</span>
            </button>
          </div>
        </header>
        <main class="workspace" aria-label="Workspace main">
          <div id="workspace-main" class="workspace-main">
          <section id="home-view" class="home-view workspace-view" hidden>
            <div class="home-container">
              <div class="home-hero">
                <img src="/hermes-logo.png" alt="Hermes" class="home-logo" onerror="this.style.display='none'" />
                <h1 class="home-title">Hermes</h1>
                <p class="home-tagline">MCP Experimentation &amp; Observability Lab</p>
              </div>
              <div class="home-grid">
                <button type="button" class="home-card" data-action="set-app-mode" data-mode="chat">
                  <strong>Chat</strong>
                  <span>Conversational AI with MCP tool integration</span>
                </button>
                <button type="button" class="home-card" data-action="set-app-mode" data-mode="mcp-inspect">
                  <strong>MCP Inspector</strong>
                  <span>Test and debug MCP tools directly</span>
                </button>
                <button type="button" class="home-card" data-action="set-app-mode" data-mode="benchmark">
                  <strong>Compare</strong>
                  <span>Run the same prompt against multiple models</span>
                </button>
                <button type="button" class="home-card" data-action="set-app-mode" data-mode="lab">
                  <strong>Lab</strong>
                  <span>Experiment, benchmark, and detect regressions</span>
                </button>
              </div>
              <div class="home-about">
                <p>Hermes is a controlled experimentation environment for MCP-based agent systems. Define datasets, register tool versions, run matrix experiments, and compare results across model and tool variants.</p>
              </div>
            </div>
          </section>

          <section id="chat-view" class="chat-view workspace-view">
            <div class="workspace-split">
              <aside class="workspace-split-sidebar">
                <div class="workspace-split-sidebar-header">
                  <span class="workspace-split-sidebar-label">Conversations</span>
                  <button type="button" class="workspace-split-action" data-action="create-session" title="New Chat">+</button>
                </div>
                <div class="workspace-split-sidebar-search">
                  <input
                    id="conversation-search"
                    type="search"
                    placeholder="Search…"
                    autocomplete="off"
                    spellcheck="false"
                    aria-label="Filter conversations"
                  />
                </div>
                <div id="session-list" class="workspace-split-sidebar-list conversation-list" aria-live="polite"></div>
              </aside>
              <div class="workspace-split-main" style="display:flex;flex-direction:column;">
                <header class="workspace-header">
                  <div class="workspace-heading">
                    <div class="conversation-title-heading">
                      <button
                        type="button"
                        id="conversation-title-trigger"
                        class="conversation-title-trigger"
                        data-action="begin-inline-rename"
                        aria-label="Rename conversation"
                      >
                        <h1 id="conversation-title">New conversation</h1>
                      </button>
                      <form id="conversation-title-editor" class="conversation-title-editor" hidden>
                        <input
                          id="conversation-title-input"
                          class="conversation-title-input"
                          type="text"
                          autocomplete="off"
                          spellcheck="false"
                          aria-label="Conversation title"
                        />
                        <div class="conversation-title-editor-actions">
                          <button type="submit" class="inline-action">Save</button>
                          <button type="button" class="inline-action" data-action="cancel-inline-rename">Cancel</button>
                        </div>
                      </form>
                    </div>
                  </div>
                  <div class="workspace-actions">
                    <span id="workspace-status" class="status-pill" data-tone="idle"></span>
                    <div class="model-switcher">
                      <button type="button" class="model-trigger" data-action="open-llm-profile-menu">
                        <strong id="active-model-chip">Choose AI</strong>
                      </button>
                    </div>
                    <div class="model-switcher">
                      <button type="button" class="model-trigger" data-action="open-mcp-server-menu" title="MCP Tools">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                        <strong id="active-mcp-chip">Tools</strong>
                      </button>
                    </div>
                    <button type="button" class="topbar-icon-btn" data-action="toggle-trace-panel" aria-label="Toggle trace panel" title="Trace Timeline">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </button>
                  </div>
                </header>

                <div class="chat-body-with-trace">
                  <!-- Chat main area -->
                  <div class="chat-main-col" style="display:flex;flex-direction:column;flex:1;min-width:0;">
                    <div style="flex:1;overflow-y:auto;min-height:0;">
                      <section id="timeline" class="timeline" tabindex="0" aria-label="Conversation timeline"></section>
                      <section id="benchmark-compare" class="benchmark-compare" hidden></section>
                    </div>

                    <section class="composer-shell" style="flex-shrink:0;">
                      <div id="composer-attachments" class="composer-attachments" hidden></div>
                      <form id="composer-form" class="composer-form">
                        <div class="composer-input-wrap">
                          <textarea id="composer-input" placeholder="Ask Hermes to help with a task..." aria-label="Prompt composer"></textarea>
                          <button type="submit" class="send-button" title="Send prompt">
                            ↑
                          </button>
                        </div>
                        <div class="composer-toolbar">
                          <button type="button" class="composer-tool" data-action="attach-files">Attach files</button>
                          <span id="session-token-usage" class="session-token-usage"></span>
                          <p id="feedback-banner" class="feedback-banner" data-tone="idle" aria-live="polite"></p>
                        </div>
                      </form>
                    </section>
                  </div>

                  <!-- Collapsible Trace Panel (right sidebar) -->
                  <aside id="chat-trace-panel" class="chat-trace-panel" hidden>
                    <div class="chat-trace-header">
                      <span class="chat-trace-title">Trace</span>
                      <button type="button" class="chat-trace-close" data-action="toggle-trace-panel">×</button>
                    </div>
                    <div class="chat-trace-metrics">
                      <div class="chat-trace-metric"><span>Duration</span><strong id="chat-trace-duration">—</strong></div>
                      <div class="chat-trace-metric"><span>Tokens</span><strong id="chat-trace-tokens">—</strong></div>
                      <div class="chat-trace-metric"><span>Tools</span><strong id="chat-trace-tools">—</strong></div>
                    </div>
                    <div class="chat-trace-tree-header">
                      <span class="chat-trace-col-name">Span</span>
                      <span class="chat-trace-col-dur">Duration</span>
                      <span class="chat-trace-col-bar">Timeline</span>
                    </div>
                    <div class="chat-trace-tree-body" id="chat-trace-tree-body">
                      <p class="chat-trace-empty">Send a message to see the trace.</p>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </section>

          <section id="benchmark-split-view" class="benchmark-split-view workspace-view" hidden>
            <div class="workspace-split">
              <aside class="workspace-split-sidebar">
                <div class="workspace-split-sidebar-header">
                  <span class="workspace-split-sidebar-label">Comparisons</span>
                  <button type="button" class="workspace-split-action" data-action="create-session" title="New Comparison">+</button>
                </div>
                <div id="benchmark-session-list" class="workspace-split-sidebar-list"></div>
              </aside>
              <div class="workspace-split-main" style="display:flex;flex-direction:column;">
                <header class="workspace-header benchmark-header">
                  <div class="workspace-actions">
                    <button type="button" class="header-button" data-action="open-benchmark-report">View Report</button>
                  </div>
                </header>

                <div class="benchmark-container" style="flex:1;overflow-y:auto;">
                  <section class="benchmark-chat" aria-label="Benchmark left pane">
                    <div class="benchmark-chat-header">
                      <div class="benchmark-header-left">
                        <span class="benchmark-model-label">Profile A</span>
                      </div>
                      <div class="model-switcher benchmark-model-switcher">
                        <button type="button" class="model-trigger" data-action="open-benchmark-model-menu" data-benchmark-side="left">
                          <span class="model-trigger-label">Profile</span>
                          <strong id="benchmark-model-left">Choose profile</strong>
                        </button>
                      </div>
                    </div>
                    <section class="timeline" id="benchmark-timeline-left" tabindex="0" aria-label="Model A timeline"></section>
                    <div class="benchmark-metrics" id="benchmark-metrics-left">
                      <div class="metric-item">
                        <span class="metric-label">Tokens</span>
                        <span class="metric-value" id="benchmark-tokens-left">—</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">Latency</span>
                        <span class="metric-value" id="benchmark-latency-left">—</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">Tools</span>
                        <span class="metric-value" id="benchmark-tools-left">—</span>
                      </div>
                    </div>
                  </section>

                  <div class="benchmark-divider" aria-hidden="true"></div>

                  <section class="benchmark-chat" aria-label="Benchmark right pane">
                    <div class="benchmark-chat-header">
                      <div class="benchmark-header-left">
                        <span class="benchmark-model-label">Profile B</span>
                      </div>
                      <div class="model-switcher benchmark-model-switcher">
                        <button type="button" class="model-trigger" data-action="open-benchmark-model-menu" data-benchmark-side="right">
                          <span class="model-trigger-label">Profile</span>
                          <strong id="benchmark-model-right">Choose profile</strong>
                        </button>
                      </div>
                    </div>
                    <section class="timeline" id="benchmark-timeline-right" tabindex="0" aria-label="Model B timeline"></section>
                    <div class="benchmark-metrics" id="benchmark-metrics-right">
                      <div class="metric-item">
                        <span class="metric-label">Tokens</span>
                        <span class="metric-value" id="benchmark-tokens-right">—</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">Latency</span>
                        <span class="metric-value" id="benchmark-latency-right">—</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">Tools</span>
                        <span class="metric-value" id="benchmark-tools-right">—</span>
                      </div>
                    </div>
                  </section>
                </div>

                <section class="composer-shell benchmark-composer" style="flex-shrink:0;">
                  <form id="benchmark-composer-form" class="composer-form">
                    <div class="composer-input-wrap">
                      <textarea id="benchmark-composer-input" placeholder="Send to both models..." aria-label="Benchmark prompt"></textarea>
                      <button type="submit" class="send-button" title="Send to both">↑</button>
                    </div>
                    <div class="composer-toolbar">
                      <span class="composer-tool-label">⚡ Sending to both profiles simultaneously</span>
                      <p id="benchmark-feedback" class="feedback-banner" data-tone="idle" aria-live="polite"></p>
                    </div>
                  </form>
                </section>
              </div>
            </div>
          </section>

          <section id="mcp-inspect-view" class="mcp-inspect-view workspace-view" hidden>
            <div class="workspace-split">
              <aside class="workspace-split-sidebar">
                <div class="workspace-split-sidebar-header">
                  <span class="workspace-split-sidebar-label">Tools</span>
                  <button type="button" class="workspace-split-action" data-action="refresh-mcp-inspector" title="Refresh">↻</button>
                </div>
                <div class="workspace-split-sidebar-search">
                  <input id="mcp-sidebar-search" type="search" placeholder="Filter…" aria-label="Filter tools" autocomplete="off" spellcheck="false" />
                </div>
                <div id="sidebar-mcp-list" class="workspace-split-sidebar-list"></div>
              </aside>
              <div class="workspace-split-main">
                <div class="workspace-body">
                  <div id="mcp-runner-empty" class="mcp-runner-empty">
                    <p>Select a tool from the sidebar to get started.</p>
                  </div>

                  <div id="mcp-runner-form-wrap" class="mcp-runner-form-wrap" hidden>
                    <div class="mcp-runner-tool-header">
                      <div>
                        <h2 id="mcp-runner-tool-name" class="mcp-runner-tool-name"></h2>
                        <p id="mcp-runner-tool-desc" class="mcp-runner-tool-desc"></p>
                      </div>
                      <span id="mcp-runner-tool-server-badge" class="mcp-runner-server-badge"></span>
                    </div>

                    <details id="mcp-runner-schema-details" class="mcp-runner-schema-details">
                      <summary>Input Schema</summary>
                      <div id="mcp-runner-schema-body" class="mcp-runner-schema-body"></div>
                    </details>

                    <div class="mcp-runner-io-split">
                      <!-- INPUT column -->
                      <div class="mcp-runner-io-col mcp-runner-io-input">
                        <div class="mcp-runner-args-section">
                          <div class="mcp-runner-args-header">
                            <p class="mcp-runner-label">Arguments</p>
                            <div class="mcp-runner-args-mode-toggle">
                              <button type="button" class="mcp-runner-mode-btn active" data-action="mcp-runner-mode-form" id="mcp-runner-mode-form-btn">Form</button>
                              <button type="button" class="mcp-runner-mode-btn" data-action="mcp-runner-mode-json" id="mcp-runner-mode-json-btn">JSON</button>
                            </div>
                            <button type="button" class="mcp-runner-btn-ghost" data-action="mcp-runner-reset-args">Reset</button>
                          </div>
                          <div id="mcp-runner-form-fields" class="mcp-runner-form-fields"></div>
                          <textarea
                            id="mcp-runner-args"
                            class="mcp-runner-args-editor"
                            spellcheck="false"
                            autocomplete="off"
                            rows="8"
                            aria-label="Tool arguments as JSON"
                            hidden
                          >{}</textarea>
                          <p id="mcp-runner-args-error" class="mcp-runner-args-error" hidden></p>
                        </div>

                        <div class="mcp-runner-run-row">
                          <button type="button" class="mcp-runner-run-btn" id="mcp-runner-run-btn" data-action="mcp-runner-run">Run Tool</button>
                          <p id="mcp-runner-feedback" class="mcp-runner-feedback" data-tone="idle" aria-live="polite"></p>
                        </div>
                      </div>

                      <!-- OUTPUT column -->
                      <div class="mcp-runner-io-col mcp-runner-io-output">
                        <div id="mcp-runner-result-wrap" class="mcp-runner-result-wrap" hidden>
                          <div class="mcp-runner-result-header">
                            <p class="mcp-runner-label">Response</p>
                            <div class="mcp-runner-result-meta">
                              <span id="mcp-runner-latency" class="mcp-runner-latency"></span>
                              <button type="button" class="mcp-runner-btn-ghost" data-action="mcp-runner-copy-result">Copy</button>
                              <button type="button" class="mcp-runner-btn-ghost" data-action="mcp-runner-clear-result">Clear</button>
                            </div>
                          </div>
                          <pre id="mcp-runner-result" class="mcp-runner-result json-view"></pre>
                        </div>
                        <div id="mcp-runner-result-empty" class="mcp-runner-result-placeholder">
                          <p>Run the tool to see results here.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="debug-timeline-view" class="debug-timeline-view workspace-view" hidden>
            <!-- Summary metrics bar -->
            <div class="trace-metrics-bar" id="trace-metrics-bar">
              <div class="trace-metric"><span class="trace-metric-label">Duration</span><strong id="trace-metric-duration">—</strong></div>
              <div class="trace-metric"><span class="trace-metric-label">Tokens</span><strong id="trace-metric-tokens">—</strong></div>
              <div class="trace-metric"><span class="trace-metric-label">Cost</span><strong id="trace-metric-cost">—</strong></div>
              <div class="trace-metric"><span class="trace-metric-label">MCP Calls</span><strong id="trace-metric-mcp">—</strong></div>
              <div class="trace-metric"><span class="trace-metric-label">Errors</span><strong id="trace-metric-errors">—</strong></div>
            </div>

            <!-- 3-panel layout -->
            <div class="trace-panels">
              <!-- LEFT: Session tree -->
              <aside class="trace-panel-left">
                <div class="trace-panel-header">
                  <span class="trace-panel-title">Sessions</span>
                </div>
                <div id="debug-session-list" class="trace-session-list"></div>
              </aside>

              <!-- CENTER: Trace tree with spans -->
              <div class="trace-panel-center">
                <div class="trace-tree-header">
                  <span class="trace-tree-col trace-tree-col-name">Span</span>
                  <span class="trace-tree-col trace-tree-col-duration">Duration</span>
                  <span class="trace-tree-col trace-tree-col-waterfall">Timeline</span>
                </div>
                <div class="trace-tree-body" id="trace-tree-body">
                  <p class="trace-tree-empty">Select a session to view its trace tree.</p>
                </div>
              </div>

              <!-- RIGHT: Detail inspector -->
              <aside class="trace-panel-right" id="trace-panel-right" hidden>
                <div class="trace-panel-header">
                  <span class="trace-panel-title" id="trace-detail-title">Detail</span>
                  <button type="button" class="trace-panel-close" data-action="close-trace-detail">×</button>
                </div>
                <div class="trace-detail-tabs">
                  <button class="trace-detail-tab active" data-trace-tab="output">Output</button>
                  <button class="trace-detail-tab" data-trace-tab="input">Input</button>
                  <button class="trace-detail-tab" data-trace-tab="metadata">Metadata</button>
                  <button class="trace-detail-tab" data-trace-tab="raw">Raw JSON</button>
                </div>
                <div class="trace-detail-content" id="trace-detail-body">
                  <p class="trace-detail-empty">Click a span to inspect it.</p>
                </div>
              </aside>
            </div>
          </section>

          <section id="lab-view" class="lab-view workspace-view" hidden>
            <div class="workspace-split">
              <aside class="workspace-split-sidebar">
                <div class="workspace-split-sidebar-header">
                  <span class="workspace-split-sidebar-label">Lab</span>
                </div>
                <nav class="workspace-split-sidebar-list lab-sidebar-nav">
                  <button type="button" class="workspace-split-nav-item active" data-action="lab-nav" data-lab-panel="experiments">Experiments</button>
                  <button type="button" class="workspace-split-nav-item" data-action="lab-nav" data-lab-panel="datasets">Datasets</button>
                  <button type="button" class="workspace-split-nav-item" data-action="lab-nav" data-lab-panel="models">Model Configs</button>
                  <button type="button" class="workspace-split-nav-item" data-action="lab-nav" data-lab-panel="mcp-versions">MCP Versions</button>
                  <button type="button" class="workspace-split-nav-item" data-action="lab-nav" data-lab-panel="workflows">Workflows</button>
                  <button type="button" class="workspace-split-nav-item" data-action="lab-nav" data-lab-panel="fixtures">Mock Fixtures</button>
                </nav>
              </aside>
              <div class="workspace-split-main">
                <div id="lab-content" class="lab-panel"></div>
              </div>
            </div>
          </section>

          <section id="debug-api-view" class="debug-api-view workspace-view" hidden>
            <div class="debug-api-layout">
              <div class="debug-api-input-panel">
                <div class="debug-api-row">
                  <div class="debug-api-section debug-api-method-section">
                    <label class="debug-api-label" for="debug-api-method">Method</label>
                    <select id="debug-api-method" class="debug-api-select">
                      <option value="GET">GET</option>
                      <option value="POST" selected>POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div class="debug-api-section debug-api-url-section">
                    <label class="debug-api-label" for="debug-api-url">Endpoint</label>
                    <select id="debug-api-url" class="debug-api-select debug-api-endpoint-select">
                      <optgroup label="Config &amp; Health">
                        <option value="GET /api/health" data-method="GET">GET /api/health</option>
                        <option value="GET /api/bootstrap" data-method="GET">GET /api/bootstrap</option>
                        <option value="GET /api/config" data-method="GET">GET /api/config</option>
                        <option value="PUT /api/config" data-method="PUT">PUT /api/config</option>
                        <option value="POST /api/config/test/llm" data-method="POST" selected>POST /api/config/test/llm</option>
                        <option value="POST /api/config/test/mcp" data-method="POST">POST /api/config/test/mcp</option>
                      </optgroup>
                      <optgroup label="MCP Servers">
                        <option value="POST /api/config/mcp-server" data-method="POST">POST /api/config/mcp-server</option>
                        <option value="DELETE /api/config/mcp-server/{name}" data-method="DELETE">DELETE /api/config/mcp-server/{name}</option>
                        <option value="PATCH /api/config/mcp-server/{name}" data-method="PATCH">PATCH /api/config/mcp-server/{name}</option>
                        <option value="POST /api/mcp/refresh" data-method="POST">POST /api/mcp/refresh</option>
                      </optgroup>
                      <optgroup label="Sessions">
                        <option value="POST /api/sessions" data-method="POST">POST /api/sessions</option>
                        <option value="GET /api/sessions/{id}/events" data-method="GET">GET /api/sessions/{id}/events</option>
                        <option value="PATCH /api/sessions/{id}" data-method="PATCH">PATCH /api/sessions/{id}</option>
                        <option value="DELETE /api/sessions/{id}" data-method="DELETE">DELETE /api/sessions/{id}</option>
                        <option value="POST /api/sessions/{id}/duplicate" data-method="POST">POST /api/sessions/{id}/duplicate</option>
                      </optgroup>
                      <optgroup label="Chat &amp; Tools">
                        <option value="POST /api/chat" data-method="POST">POST /api/chat</option>
                        <option value="POST /api/tools/run" data-method="POST">POST /api/tools/run</option>
                      </optgroup>
                      <optgroup label="Benchmarks">
                        <option value="POST /api/benchmarks/run" data-method="POST">POST /api/benchmarks/run</option>
                        <option value="GET /api/benchmarks/report" data-method="GET">GET /api/benchmarks/report</option>
                      </optgroup>
                      <optgroup label="Replay">
                        <option value="POST /api/replay/branch" data-method="POST">POST /api/replay/branch</option>
                        <option value="GET /api/replay/step" data-method="GET">GET /api/replay/step</option>
                        <option value="POST /api/replay/tool" data-method="POST">POST /api/replay/tool</option>
                      </optgroup>
                      <optgroup label="Lab: Datasets">
                        <option value="GET /api/lab/datasets" data-method="GET">GET /api/lab/datasets</option>
                        <option value="POST /api/lab/datasets" data-method="POST">POST /api/lab/datasets</option>
                        <option value="POST /api/lab/datasets/import" data-method="POST">POST /api/lab/datasets/import</option>
                      </optgroup>
                      <optgroup label="Lab: Experiments">
                        <option value="GET /api/lab/experiments" data-method="GET">GET /api/lab/experiments</option>
                        <option value="POST /api/lab/experiments" data-method="POST">POST /api/lab/experiments</option>
                        <option value="POST /api/lab/experiments/{id}/run" data-method="POST">POST /api/lab/experiments/{id}/run</option>
                      </optgroup>
                      <optgroup label="Lab: Models &amp; Workflows">
                        <option value="GET /api/lab/model-configs" data-method="GET">GET /api/lab/model-configs</option>
                        <option value="POST /api/lab/model-configs" data-method="POST">POST /api/lab/model-configs</option>
                        <option value="GET /api/lab/workflow-configs" data-method="GET">GET /api/lab/workflow-configs</option>
                        <option value="POST /api/lab/workflow-configs" data-method="POST">POST /api/lab/workflow-configs</option>
                      </optgroup>
                      <optgroup label="Lab: MCP Versions">
                        <option value="GET /api/lab/mcp-versions" data-method="GET">GET /api/lab/mcp-versions</option>
                        <option value="POST /api/lab/mcp-versions" data-method="POST">POST /api/lab/mcp-versions</option>
                      </optgroup>
                      <optgroup label="Lab: Mock Fixtures">
                        <option value="GET /api/lab/mock-fixtures" data-method="GET">GET /api/lab/mock-fixtures</option>
                        <option value="POST /api/lab/mock-fixtures" data-method="POST">POST /api/lab/mock-fixtures</option>
                      </optgroup>
                      <optgroup label="Keystore (Secrets)">
                        <option value="GET /api/keystore" data-method="GET">GET /api/keystore</option>
                        <option value="POST /api/keystore" data-method="POST">POST /api/keystore</option>
                        <option value="DELETE /api/keystore/{name}" data-method="DELETE">DELETE /api/keystore/{name}</option>
                        <option value="GET /api/keystore/{name}/check" data-method="GET">GET /api/keystore/{name}/check</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
                <div class="debug-api-section debug-api-body-section">
                  <div class="debug-api-body-header">
                    <label class="debug-api-label">Request Body</label>
                    <div class="mcp-runner-args-mode-toggle">
                      <button type="button" class="mcp-runner-mode-btn" data-action="debug-api-mode-form" id="debug-api-mode-form-btn">Form</button>
                      <button type="button" class="mcp-runner-mode-btn active" data-action="debug-api-mode-json" id="debug-api-mode-json-btn">JSON</button>
                    </div>
                  </div>
                  <div id="debug-api-form-fields" class="debug-api-form-fields" hidden></div>
                  <textarea id="debug-api-body" class="debug-api-editor" rows="14" spellcheck="false" autocomplete="off">{
  "llm": {
    "provider": "github-copilot",
    "model": "gpt-4o",
    "api_key_env": "GITHUB_TOKEN",
    "temperature": 0.2,
    "max_tokens": 2048,
    "timeout_seconds": 20
  }
}</textarea>
                </div>
                <div class="debug-api-actions">
                  <button type="button" class="mcp-runner-run-btn" data-action="debug-api-send">Send Request</button>
                  <span id="debug-api-status" class="debug-api-status"></span>
                </div>
              </div>
              <div class="debug-api-output-panel">
                <div class="debug-api-output-header">
                  <span class="debug-api-label">Response</span>
                  <span id="debug-api-latency" class="debug-api-latency"></span>
                  <button type="button" class="mcp-runner-btn-ghost" data-action="debug-api-copy">Copy</button>
                  <button type="button" class="mcp-runner-btn-ghost" data-action="debug-api-clear">Clear</button>
                </div>
                <pre id="debug-api-response" class="debug-api-response json-view">Send a request to see the response here.</pre>
              </div>
            </div>
          </section>
        </div>

        <footer id="workspace-footer" class="workspace-footer" aria-label="Workspace footer">
          <div class="workspace-footer-panel"></div>
          <div id="benchmark-footer-controls" class="benchmark-footer-controls" hidden>
            <div class="benchmark-footer-main">
              <div class="benchmark-profile-summary-shell">
                <div>
                  <p class="settings-ai-default-kicker">Selected benchmark profiles</p>
                  <p class="settings-note">Use the profile switcher at the top of each split pane. Hermes will reuse that profile's provider, model, prompt, and advanced tuning.</p>
                </div>
                <div id="benchmark-profile-summary" class="benchmark-profile-summary"></div>
              </div>
            </div>
            <div class="benchmark-footer-actions">
              <button type="button" class="settings-action" data-action="close-benchmark">Exit Benchmark</button>
              <button type="button" class="settings-action primary" data-action="run-benchmark">Run Benchmark</button>
            </div>
          </div>
        </footer>
        </main>

        <footer class="app-footer" aria-label="Application footer">
          <div class="app-footer-section">
            <span class="app-footer-label">Status</span>
            <span id="app-footer-status" class="app-footer-value">Ready</span>
          </div>
          <div class="app-footer-section">
            <span class="app-footer-label">Events</span>
            <span id="app-footer-events" class="app-footer-value">0</span>
          </div>
          <div class="app-footer-section">
            <span class="app-footer-label">MCP</span>
            <span id="app-footer-tools" class="app-footer-value">0</span>
          </div>
          <div class="app-footer-section app-footer-expand">
            <button type="button" class="app-footer-button" data-action="toggle-footer-logs" title="Toggle logs">
              <span aria-hidden="true">📋</span>
              <span>Logs</span>
            </button>
          </div>
        </footer>
      </div>
    </div>

    <div id="tool-list" hidden></div>

    <input id="composer-file-input" type="file" multiple hidden />

    <div id="command-palette" class="command-palette" hidden aria-hidden="true">
      <div id="command-palette-panel" class="command-palette-panel" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="command-palette-header">
          <input id="command-input" type="text" placeholder="Search actions, sessions, and tools..." autocomplete="off" spellcheck="false" />
        </div>
        <div id="command-results" class="command-results" role="listbox" aria-label="Results"></div>
      </div>
    </div>

    <div id="context-menu" class="context-menu" hidden role="menu" aria-label="Context menu"></div>

    <div id="support-overlay" class="utility-overlay" hidden aria-hidden="true">
      <div class="utility-modal" role="dialog" aria-modal="true" aria-label="Support Hermes">
        <header class="utility-modal-header">
          <div>
            <h2>Support Hermes</h2>
            <p class="settings-hint">If Hermes saves you time, you can back ongoing polish, performance work, and MCP integrations with a PayPal contribution.</p>
          </div>
          <button type="button" class="icon-button" data-action="close-support" aria-label="Close support dialog">×</button>
        </header>
        <div class="utility-modal-body">
          <p class="utility-modal-copy">Support goes straight through PayPal so the flow stays simple. Wire your hosted donation link once and this modal is ready for production.</p>
          <p class="settings-note">${PAYPAL_CONFIGURED ? "PayPal support is configured." : "Set VITE_HERMES_PAYPAL_URL to your hosted PayPal donation link to enable the button."}</p>
          <div class="utility-modal-actions">
            <button type="button" class="settings-action" data-action="close-support">Close</button>
            <button type="button" class="settings-action primary" data-action="open-paypal-support" ${PAYPAL_CONFIGURED ? "" : "disabled"}>Donate with PayPal</button>
          </div>
        </div>
      </div>
    </div>

    <div id="contact-overlay" class="utility-overlay" hidden aria-hidden="true">
      <div class="utility-modal" role="dialog" aria-modal="true" aria-label="Contact the author">
        <header class="utility-modal-header">
          <div>
            <h2>Contact the Author</h2>
            <p class="settings-hint">Send feedback, partnership ideas, or bug reports straight from Hermes with a Formspree-backed contact form.</p>
          </div>
          <button type="button" class="icon-button" data-action="close-contact" aria-label="Close contact dialog">×</button>
        </header>
        <form id="author-contact-form" class="utility-modal-body utility-contact-form">
          <div class="utility-contact-grid">
            <label class="settings-field" for="contact-name">
              <span>Name</span>
              <input id="contact-name" name="name" type="text" placeholder="Your name" />
            </label>
            <label class="settings-field" for="contact-email">
              <span>Email</span>
              <input id="contact-email" name="email" type="email" placeholder="you@example.com" required />
            </label>
          </div>
          <label class="settings-field" for="contact-subject">
            <span>Subject</span>
            <input id="contact-subject" name="subject" type="text" placeholder="What would you like to talk about?" />
          </label>
          <label class="settings-field" for="contact-message">
            <span>Message</span>
            <textarea id="contact-message" name="message" rows="6" placeholder="Share your note, idea, or bug report." required></textarea>
          </label>
          <p class="settings-note">${FORMSPREE_CONFIGURED ? "Messages are sent through the configured Formspree endpoint." : "Set VITE_HERMES_FORMSPREE_ENDPOINT to your Formspree form endpoint to enable this form."}</p>
          <p id="contact-feedback" class="settings-feedback" data-tone="idle">${FORMSPREE_CONFIGURED ? "Send a note directly from Hermes." : "Contact form is not configured yet."}</p>
          <div class="utility-modal-actions">
            <button type="button" class="settings-action" data-action="close-contact">Close</button>
            <button type="submit" class="settings-action primary" ${FORMSPREE_CONFIGURED ? "" : "disabled"}>Send Message</button>
          </div>
        </form>
      </div>
    </div>

    <div id="benchmark-report-modal" class="utility-overlay" hidden aria-hidden="true">
      <div class="utility-modal benchmark-report-modal" role="dialog" aria-modal="true" aria-label="Benchmark Report">
        <header class="utility-modal-header">
          <div>
            <h2>Benchmark Comparison Report</h2>
            <p class="settings-hint">Detailed performance metrics and analysis comparing both AI models</p>
          </div>
          <button type="button" class="icon-button" data-action="close-benchmark-report" aria-label="Close report">×</button>
        </header>
        <div class="utility-modal-body benchmark-report-body">
          <!-- Summary Cards -->
          <div class="benchmark-report-summary">
            <div class="benchmark-summary-card">
              <div class="benchmark-summary-header">
                <span class="benchmark-summary-label">Model A</span>
                <strong id="report-model-left-name" class="benchmark-summary-model">GPT-4</strong>
              </div>
              <div class="benchmark-summary-metrics">
                <div class="summary-metric">
                  <span class="summary-metric-label">Total Tokens</span>
                  <strong id="report-tokens-left" class="summary-metric-value">1,234</strong>
                </div>
                <div class="summary-metric">
                  <span class="summary-metric-label">Avg Latency</span>
                  <strong id="report-latency-left" class="summary-metric-value">1.2s</strong>
                </div>
                <div class="summary-metric">
                  <span class="summary-metric-label">Tool Calls</span>
                  <strong id="report-tools-left" class="summary-metric-value">5</strong>
                </div>
                <div class="summary-metric">
                  <span class="summary-metric-label">Messages</span>
                  <strong id="report-messages-left" class="summary-metric-value">8</strong>
                </div>
              </div>
            </div>

            <div class="benchmark-summary-divider">
              <span class="benchmark-vs">VS</span>
            </div>

            <div class="benchmark-summary-card">
              <div class="benchmark-summary-header">
                <span class="benchmark-summary-label">Model B</span>
                <strong id="report-model-right-name" class="benchmark-summary-model">Claude Sonnet</strong>
              </div>
              <div class="benchmark-summary-metrics">
                <div class="summary-metric">
                  <span class="summary-metric-label">Total Tokens</span>
                  <strong id="report-tokens-right" class="summary-metric-value">1,456</strong>
                </div>
                <div class="summary-metric">
                  <span class="summary-metric-label">Avg Latency</span>
                  <strong id="report-latency-right" class="summary-metric-value">0.9s</strong>
                </div>
                <div class="summary-metric">
                  <span class="summary-metric-label">Tool Calls</span>
                  <strong id="report-tools-right" class="summary-metric-value">7</strong>
                </div>
                <div class="summary-metric">
                  <span class="summary-metric-label">Messages</span>
                  <strong id="report-messages-right" class="summary-metric-value">8</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Detailed Breakdown -->
          <div class="benchmark-report-section">
            <h3>Performance Breakdown</h3>
            <div class="benchmark-comparison-table">
              <div class="comparison-row comparison-header">
                <span class="comparison-metric">Metric</span>
                <span class="comparison-left">Model A</span>
                <span class="comparison-right">Model B</span>
                <span class="comparison-winner">Winner</span>
              </div>
              <div class="comparison-row">
                <span class="comparison-metric">Response Speed</span>
                <span class="comparison-left" id="compare-speed-left">1.2s</span>
                <span class="comparison-right" id="compare-speed-right">0.9s</span>
                <span class="comparison-winner" id="compare-speed-winner">Model B</span>
              </div>
              <div class="comparison-row">
                <span class="comparison-metric">Token Efficiency</span>
                <span class="comparison-left" id="compare-tokens-left">1,234</span>
                <span class="comparison-right" id="compare-tokens-right">1,456</span>
                <span class="comparison-winner" id="compare-tokens-winner">Model A</span>
              </div>
              <div class="comparison-row">
                <span class="comparison-metric">Tool Usage</span>
                <span class="comparison-left" id="compare-tools-left">5 calls</span>
                <span class="comparison-right" id="compare-tools-right">7 calls</span>
                <span class="comparison-winner" id="compare-tools-winner">—</span>
              </div>
              <div class="comparison-row">
                <span class="comparison-metric">Error Rate</span>
                <span class="comparison-left" id="compare-errors-left">0%</span>
                <span class="comparison-right" id="compare-errors-right">0%</span>
                <span class="comparison-winner" id="compare-errors-winner">Tie</span>
              </div>
            </div>
          </div>

          <!-- Tool Interaction Details -->
          <div class="benchmark-report-section">
            <h3>Tool Interactions</h3>
            <div class="tool-interactions-grid">
              <div class="tool-interaction-panel">
                <h4>Model A Tools</h4>
                <div id="report-tool-list-left" class="tool-list">
                  <div class="tool-list-item">
                    <span class="tool-name">read_file</span>
                    <span class="tool-count">3×</span>
                  </div>
                  <div class="tool-list-item">
                    <span class="tool-name">search</span>
                    <span class="tool-count">2×</span>
                  </div>
                </div>
              </div>
              <div class="tool-interaction-panel">
                <h4>Model B Tools</h4>
                <div id="report-tool-list-right" class="tool-list">
                  <div class="tool-list-item">
                    <span class="tool-name">read_file</span>
                    <span class="tool-count">4×</span>
                  </div>
                  <div class="tool-list-item">
                    <span class="tool-name">search</span>
                    <span class="tool-count">2×</span>
                  </div>
                  <div class="tool-list-item">
                    <span class="tool-name">write_file</span>
                    <span class="tool-count">1×</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="utility-modal-actions">
            <button type="button" class="settings-action" data-action="export-benchmark-report">Export Report</button>
            <button type="button" class="settings-action" data-action="close-benchmark-report">Close</button>
          </div>
        </div>
      </div>
    </div>

    <div id="benchmark-report-overlay" class="benchmark-overlay" hidden aria-hidden="true">
      <div class="benchmark-panel benchmark-report-panel" role="dialog" aria-modal="true" aria-label="Benchmark report">
        <header class="benchmark-panel-header">
          <div>
            <h2>Benchmark Report</h2>
            <p class="settings-hint">Compare response quality proxies, token usage, latency, and errors across the cloned sessions.</p>
          </div>
          <button type="button" class="icon-button" data-action="close-benchmark-report" aria-label="Close benchmark report">×</button>
        </header>
        <div class="benchmark-panel-body benchmark-report-body">
          <div class="benchmark-report-toolbar">
            <label class="settings-field" for="benchmark-sort">
              <span>Sort By</span>
              <select id="benchmark-sort">
                <option value="latency">Latency</option>
                <option value="tokens">Tokens</option>
                <option value="errors">Errors</option>
                <option value="model">Model</option>
              </select>
            </label>
          </div>
          <div id="benchmark-report-content" class="benchmark-report-content"></div>
        </div>
      </div>
    </div>

    <div id="settings-overlay" class="settings-overlay" hidden aria-hidden="true">
      <div class="settings-panel">
        <div class="settings-page-tabs" role="tablist" aria-label="Settings sections">
          <button type="button" class="settings-tab active" data-action="set-settings-tab" data-settings-tab="ai" aria-selected="true">
            AI Profiles
          </button>
          <button type="button" class="settings-tab" data-action="set-settings-tab" data-settings-tab="mcp" aria-selected="false">
            MCP Connectors
          </button>
          <button type="button" class="settings-tab" data-action="set-settings-tab" data-settings-tab="general" aria-selected="false">
            General
          </button>
          <div class="settings-tabs-spacer"></div>
          <button type="button" class="topbar-icon-btn" data-action="close-settings" aria-label="Close settings" title="Close settings">×</button>
        </div>
        <div class="settings-tab-panels">
          <section class="settings-workspace-panel settings-tab-panel" data-settings-panel="ai">
            <div class="settings-body settings-ai-body">
              <nav class="settings-tabs" aria-label="AI profiles">
                <div class="settings-ai-profile-nav">
                  <div class="settings-rail-heading-compact">
                    <h4>Profiles</h4>
                  </div>
                  <div id="settings-llm-profile-list" class="settings-llm-profile-nav-list"></div>
                  <div class="settings-rail-footer">
                    <button type="button" class="settings-rail-add-button" data-action="add-llm-profile">
                      <span aria-hidden="true">+</span>
                      <span>Add Profile</span>
                    </button>
                  </div>
                </div>
              </nav>
              <div class="settings-content">
                <div class="settings-profile-editor">
                  <!-- Error banner (replaces raw errors) -->
                  <div id="settings-ai-error-banner" class="settings-error-banner" hidden>
                    <div class="settings-error-banner-main">
                      <strong id="settings-ai-error-title">Cannot connect</strong>
                      <p id="settings-ai-error-detail"></p>
                    </div>
                    <div class="settings-error-banner-actions">
                      <button type="button" class="settings-error-action" id="settings-ai-error-cta" data-action="open-settings" data-settings-tab="ai">Fix</button>
                    </div>
                  </div>

                  <!-- Section A: Profile Identity (Hero) -->
                  <section class="settings-card settings-card-hero">
                    <div class="settings-card-header">
                      <h3>Profile</h3>
                      <div id="settings-selected-profile-actions" class="settings-inline-actions"></div>
                    </div>
                    <div class="settings-card-body">
                      <div class="settings-field">
                        <label for="settings-llm-profile-name">Name</label>
                        <input id="settings-llm-profile-name" type="text" placeholder="e.g. Fast Coder" />
                      </div>
                      <div class="settings-field">
                        <label for="settings-provider">Provider</label>
                        <select id="settings-provider">
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="groq">Groq</option>
                          <option value="mistral">Mistral AI</option>
                          <option value="together">Together AI</option>
                          <option value="perplexity">Perplexity</option>
                          <option value="openrouter">OpenRouter</option>
                          <option value="google">Google Gemini</option>
                          <option value="cohere">Cohere</option>
                          <option value="fireworks">Fireworks AI</option>
                          <option value="deepseek">DeepSeek</option>
                          <option value="github-copilot">GitHub Models</option>
                          <option value="local">Local API (Ollama, LM Studio)</option>
                          <option value="local-cli">Local CLI</option>
                        </select>
                      </div>
                      <div class="settings-field">
                        <label id="settings-model-label" for="settings-model">Model</label>
                        <input id="settings-model" type="text" list="settings-model-list" placeholder="e.g. openai/gpt-4.1-mini" />
                        <datalist id="settings-model-list"></datalist>
                        <p id="settings-model-mode-note" class="settings-field-hint" hidden></p>
                      </div>
                    </div>
                  </section>

                  <!-- Connection (contextual based on provider) -->
                  <section class="settings-card">
                    <div class="settings-card-header">
                      <h3>Connection</h3>
                    </div>
                    <div class="settings-card-body">
                      <p id="settings-llm-provider-hint" class="settings-card-hint"></p>
                      <div data-llm-provider-mode="api">
                        <div class="settings-field" id="settings-api-base-field">
                          <label id="settings-api-base-label" for="settings-llm-api-base">API Endpoint</label>
                          <input id="settings-llm-api-base" type="text" placeholder="https://api.openai.com/v1" />
                        </div>
                        <div class="settings-field" id="settings-github-endpoint-field" hidden>
                          <label for="settings-github-endpoint">Endpoint</label>
                          <input id="settings-github-endpoint" type="text" value="https://models.github.ai/inference" readonly />
                        </div>
                        <div class="settings-field" id="settings-api-key-field">
                          <label id="settings-api-key-label" for="settings-api-key-env">API Key</label>
                          <input id="settings-api-key-env" type="password" placeholder="Paste key or enter a name (e.g. GITHUB_TOKEN)" />
                          <p class="settings-field-hint">Paste your key directly, or enter a reference name. When saving, raw keys are automatically encrypted and stored in the secure keystore.</p>
                        </div>
                      </div>
                      <div data-llm-provider-mode="cli" hidden>
                        <div class="settings-field">
                          <label for="settings-cli-command">CLI Command</label>
                          <input id="settings-cli-command" type="text" placeholder="llama-cli" />
                        </div>
                        <div class="settings-field">
                          <label for="settings-cli-args">Arguments (one per line)</label>
                          <textarea id="settings-cli-args" class="settings-code-field" rows="3" placeholder="--model&#10;llama3.1"></textarea>
                        </div>
                      </div>
                      <p id="settings-provider-mode-note" class="settings-card-hint"></p>
                    </div>
                  </section>

                  <!-- Section B: Behavior (simple controls) -->
                  <section class="settings-card">
                    <div class="settings-card-header">
                      <h3>Behavior</h3>
                    </div>
                    <div class="settings-card-body" data-llm-provider-mode="sampling">
                      <div class="settings-field">
                        <label for="settings-system-prompt">System Instructions</label>
                        <textarea id="settings-system-prompt" rows="2" placeholder="Custom instructions for this profile..."></textarea>
                        <p class="settings-field-hint">Tell the AI how to behave — keep it concise.</p>
                      </div>
                      <div class="settings-range-group">
                        <div class="settings-range-field">
                          <label for="settings-temperature">Creativity</label>
                          <div class="settings-range-row">
                            <span class="settings-range-label-left">Precise</span>
                            <input id="settings-temperature" type="range" min="0" max="2" step="0.1" value="0.2" />
                            <span class="settings-range-label-right">Creative</span>
                            <output id="settings-temperature-output" class="settings-range-output">0.2</output>
                          </div>
                        </div>
                        <div class="settings-range-field">
                          <label for="settings-max-tokens">Response Length</label>
                          <div class="settings-range-row">
                            <span class="settings-range-label-left">Short</span>
                            <input id="settings-max-tokens" type="range" min="256" max="32000" step="256" value="2048" />
                            <span class="settings-range-label-right">Long</span>
                            <output id="settings-max-tokens-output" class="settings-range-output">2048</output>
                          </div>
                        </div>
                      </div>
                      <div class="settings-field settings-field-checkbox">
                        <label class="settings-checkbox-label">
                          <input id="settings-disable-tools" type="checkbox" />
                          <span>Disable MCP tools</span>
                        </label>
                        <p class="settings-field-hint">Turn off tool calling for this profile. Useful for models with small context windows (e.g., GitHub Models free tier).</p>
                      </div>
                    </div>
                  </section>

                  <!-- Section C: Advanced (collapsed) -->
                  <details class="settings-card settings-card-advanced">
                    <summary class="settings-card-header settings-card-toggle">
                      <h3>Advanced Parameters</h3>
                      <span class="settings-toggle-hint">For power users</span>
                    </summary>
                    <div class="settings-card-body" data-llm-provider-mode="sampling">
                      <div class="settings-grid settings-grid-three">
                        <div class="settings-field">
                          <label for="settings-top-p">Top P</label>
                          <input id="settings-top-p" type="number" min="0" max="1" step="0.05" placeholder="0.9" />
                        </div>
                        <div class="settings-field">
                          <label for="settings-presence-penalty">Presence Penalty</label>
                          <input id="settings-presence-penalty" type="number" min="-2" max="2" step="0.1" placeholder="0.0" />
                        </div>
                        <div class="settings-field">
                          <label for="settings-frequency-penalty">Frequency Penalty</label>
                          <input id="settings-frequency-penalty" type="number" min="-2" max="2" step="0.1" placeholder="0.0" />
                        </div>
                      </div>
                      <div class="settings-field">
                        <label for="settings-timeout-seconds">Request Timeout (seconds)</label>
                        <input id="settings-timeout-seconds" type="number" min="5" max="600" step="1" value="90" />
                      </div>
                    </div>
                  </details>
                </div>

                <!-- Footer actions -->
                <div class="settings-footer">
                  <p class="settings-feedback" data-settings-feedback data-tone="idle" aria-live="polite"></p>
                  <div class="settings-footer-actions">
                    <button type="button" id="settings-test-llm" class="settings-action" data-action="test-llm">Test Profile</button>
                    <button type="button" id="settings-save" class="settings-action primary" data-action="save-settings">Save All Profiles</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-workspace-panel settings-tab-panel" data-settings-panel="mcp" hidden>
            <div class="settings-body">
              <nav class="settings-tabs" aria-label="MCP connections">
                <div class="settings-rail-heading settings-rail-heading-compact">
                  <h3>Connections</h3>
                </div>
                <div id="settings-mcp-list" class="settings-mcp-list settings-mcp-nav-list"></div>
                <div class="settings-rail-footer">
                  <button type="button" class="settings-rail-add-button" data-action="cancel-edit-mcp-server">
                    <span aria-hidden="true">+</span>
                    <span>Add Connection</span>
                  </button>
                </div>
              </nav>
              <div class="settings-content">
                <section class="settings-section">
                  <div class="settings-page-header">
                    <div class="settings-page-copy">
                      <h3 id="settings-mcp-editor-title">New Connection</h3>
                      <p id="settings-mcp-editor-note" class="settings-hint">Connect an MCP server to extend Hermes with tools.</p>
                    </div>
                    <div id="settings-mcp-editor-actions" class="settings-inline-actions settings-selected-profile-actions"></div>
                  </div>

                  <div id="settings-mcp-connection-summary" class="settings-overview-grid settings-overview-grid-compact"></div>

                  <!-- Connection Identity -->
                  <section class="settings-card">
                    <div class="settings-card-header"><h3>Identity</h3></div>
                    <div class="settings-card-body">
                      <div class="settings-field">
                        <label for="settings-new-server-name">Server Name</label>
                        <input id="settings-new-server-name" type="text" placeholder="e.g. filesystem, weather-api, my-tools" />
                        <p class="settings-field-hint">Unique identifier for this connection.</p>
                      </div>
                      <div class="settings-field">
                        <label for="settings-new-server-transport">Transport</label>
                        <select id="settings-new-server-transport">
                          <option value="stdio">STDIO — Local subprocess</option>
                          <option value="streamable-http">Streamable HTTP — Remote endpoint (recommended)</option>
                          <option value="sse">SSE — Legacy HTTP+SSE</option>
                        </select>
                        <p class="settings-field-hint" id="settings-mcp-transport-hint">Launches a local process. Hermes communicates via stdin/stdout.</p>
                      </div>
                    </div>
                  </section>

                  <!-- STDIO Configuration -->
                  <section id="settings-new-server-stdio" class="settings-card mcp-transport-fields">
                    <div class="settings-card-header"><h3>Process</h3></div>
                    <div class="settings-card-body">
                      <div class="settings-field">
                        <label for="settings-new-server-command">Command</label>
                        <input id="settings-new-server-command" type="text" placeholder="npx, uvx, node, python, docker" />
                        <p class="settings-field-hint">The executable to launch.</p>
                      </div>
                      <div class="settings-field">
                        <label for="settings-new-server-args">Arguments</label>
                        <input id="settings-new-server-args" type="text" placeholder="-y @modelcontextprotocol/server-filesystem /path" />
                        <p class="settings-field-hint">Space-separated arguments passed to the command.</p>
                      </div>
                      <div class="settings-field">
                        <label for="settings-new-server-cwd">Working Directory</label>
                        <input id="settings-new-server-cwd" type="text" placeholder="/path/to/project (optional)" />
                      </div>
                      <div class="settings-field">
                        <label for="settings-new-server-env">Environment Variables</label>
                        <textarea id="settings-new-server-env" rows="2" placeholder="API_KEY=sk-xxx&#10;NODE_ENV=production"></textarea>
                        <p class="settings-field-hint">One KEY=value per line. Passed to the spawned process.</p>
                      </div>
                    </div>
                  </section>

                  <!-- Streamable HTTP Configuration -->
                  <section id="settings-new-server-streamable-http" class="settings-card mcp-transport-fields" hidden>
                    <div class="settings-card-header"><h3>Endpoint</h3></div>
                    <div class="settings-card-body">
                      <div class="settings-field">
                        <label for="settings-new-server-streamable-url">URL</label>
                        <input id="settings-new-server-streamable-url" type="text" placeholder="http://localhost:3000/mcp" />
                        <p class="settings-field-hint">The MCP endpoint that accepts POST (requests) and GET (SSE stream).</p>
                      </div>
                      <div class="settings-field">
                        <label for="settings-new-server-streamable-headers">Headers</label>
                        <textarea id="settings-new-server-streamable-headers" rows="2" placeholder="Authorization: Bearer sk-xxx&#10;X-Custom-Header: value"></textarea>
                        <p class="settings-field-hint">One Header: value per line. Used for authentication.</p>
                      </div>
                    </div>
                  </section>

                  <!-- SSE (Legacy) Configuration -->
                  <section id="settings-new-server-sse" class="settings-card mcp-transport-fields" hidden>
                    <div class="settings-card-header"><h3>SSE Endpoint (Legacy)</h3></div>
                    <div class="settings-card-body">
                      <div class="settings-field">
                        <label for="settings-new-server-url">URL</label>
                        <input id="settings-new-server-url" type="text" placeholder="http://localhost:8001/sse" />
                        <p class="settings-field-hint">The SSE endpoint that sends an initial "endpoint" event with the POST URL.</p>
                      </div>
                      <div class="settings-field">
                        <label for="settings-new-server-headers">Headers</label>
                        <textarea id="settings-new-server-headers" rows="2" placeholder="Authorization: Bearer token"></textarea>
                        <p class="settings-field-hint">Custom HTTP headers for authentication.</p>
                      </div>
                    </div>
                  </section>

                  <!-- Advanced -->
                  <details class="settings-card settings-card-advanced">
                    <summary class="settings-card-header settings-card-toggle">
                      <h3>Advanced</h3>
                      <span class="settings-toggle-hint">Timeout &amp; options</span>
                    </summary>
                    <div class="settings-card-body">
                      <div class="settings-field">
                        <label for="settings-new-server-timeout">Connection Timeout (seconds)</label>
                        <input id="settings-new-server-timeout" type="number" min="5" max="300" step="5" value="30" />
                        <p class="settings-field-hint">How long to wait for the server to respond during initialization.</p>
                      </div>
                    </div>
                  </details>
                </section>

                <div class="settings-footer">
                  <p class="settings-feedback" data-settings-feedback data-tone="idle" aria-live="polite">
                    Configure transport and connect.
                  </p>
                  <div class="settings-footer-actions">
                    <button type="button" id="settings-cancel-mcp" class="settings-action" data-action="cancel-edit-mcp-server" hidden>Cancel</button>
                    <button type="button" id="settings-test-mcp" class="settings-action" data-action="test-mcp">Test</button>
                    <button type="button" id="settings-save-mcp" class="settings-action primary" data-action="add-mcp-server">Connect</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- General Settings -->
          <section class="settings-workspace-panel settings-tab-panel" data-settings-panel="general" hidden>
            <div class="settings-body" style="padding: var(--space-6); max-width: 640px;">
              <section class="settings-card">
                <div class="settings-card-header"><h3>Network</h3></div>
                <div class="settings-card-body">
                  <div class="settings-field settings-field-checkbox">
                    <label class="settings-checkbox-label">
                      <input id="settings-skip-ssl" type="checkbox" />
                      <span>Skip SSL certificate verification</span>
                    </label>
                    <p class="settings-field-hint">Disable TLS verification for all outgoing requests. Required behind corporate proxies with self-signed certificates. Restart the backend after changing.</p>
                  </div>
                </div>
              </section>

              <section class="settings-card">
                <div class="settings-card-header"><h3>Application</h3></div>
                <div class="settings-card-body">
                  <div class="settings-field">
                    <label for="settings-app-theme">Theme</label>
                    <select id="settings-app-theme" disabled>
                      <option value="dark">Dark</option>
                    </select>
                    <p class="settings-field-hint">More themes coming soon.</p>
                  </div>
                </div>
              </section>

              <div class="settings-footer">
                <div class="settings-footer-actions">
                  <button type="button" class="settings-action primary" data-action="save-general-settings">Save</button>
                  <button type="button" class="settings-action" data-action="close-settings">Close</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div id="onboarding-overlay" class="onboarding-overlay" hidden aria-hidden="true">
      <div class="onboarding-panel">
        <button type="button" class="icon-button onboarding-close" data-action="skip-onboarding" aria-label="Close onboarding">×</button>
        <div id="onboarding-content" class="onboarding-scroll"></div>
      </div>
    </div>
  `;
}
