import type { HermesState, PaletteCommand } from "../types";
import { clamp, escapeHtml } from "../utils";

export function renderCommandPalette(state: HermesState, commands: PaletteCommand[], paletteShortcut: string): void {
  const overlay = document.querySelector<HTMLElement>("#command-palette");
  const input = document.querySelector<HTMLInputElement>("#command-input");
  const results = document.querySelector<HTMLElement>("#command-results");
  const help = document.querySelector<HTMLElement>("#palette-help");
  if (!overlay || !input || !results || !help) {
    return;
  }

  if (!state.ui.paletteOpen) {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    results.innerHTML = "";
    return;
  }

  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  input.value = state.ui.paletteQuery;
  help.textContent = `Enter run • Esc close • ${paletteShortcut} reopen`;

  results.innerHTML = commands.length
    ? commands
        .map(
          (command, index) => `
            <button
              type="button"
              class="command-item${index === state.ui.paletteIndex ? " active" : ""}"
              data-action="palette-command"
              data-command-id="${escapeHtml(command.id)}"
              role="option"
              aria-selected="${index === state.ui.paletteIndex ? "true" : "false"}"
            >
              <span class="command-copy">
                <strong>${escapeHtml(command.title)}</strong>
                <span>${escapeHtml(command.subtitle)}</span>
              </span>
              <span class="command-meta">${command.shortcut ? `<span class="command-shortcut">${escapeHtml(command.shortcut)}</span>` : ""}</span>
            </button>
          `,
        )
        .join("")
    : `<p class="empty small-empty">No commands match your search.</p>`;
}

export function renderContextMenu(state: HermesState): void {
  const menu = document.querySelector<HTMLElement>("#context-menu");
  if (!menu) {
    return;
  }

  if (!state.ui.contextMenu) {
    menu.hidden = true;
    menu.innerHTML = "";
    return;
  }

  const left = clamp(state.ui.contextMenu.x, 12, window.innerWidth - 248);
  const top = clamp(state.ui.contextMenu.y, 12, window.innerHeight - 280);

  menu.hidden = false;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.innerHTML = state.ui.contextMenu.items
    .map(
      (item) => `
        <button
          type="button"
          class="context-item"
          role="menuitem"
          data-action="${escapeHtml(item.action)}"
          ${item.sessionId ? `data-session-id="${escapeHtml(item.sessionId)}"` : ""}
          ${item.eventId ? `data-event-id="${escapeHtml(item.eventId)}"` : ""}
          ${item.profileId ? `data-profile-id="${escapeHtml(item.profileId)}"` : ""}
          ${item.serverName ? `data-server-name="${escapeHtml(item.serverName)}"` : ""}
          ${item.benchmarkSide ? `data-benchmark-side="${escapeHtml(item.benchmarkSide)}"` : ""}
        >
          <span>${escapeHtml(item.label)}</span>
          ${item.shortcut ? `<span class="context-shortcut">${escapeHtml(item.shortcut)}</span>` : ""}
        </button>
      `,
    )
    .join("");
}