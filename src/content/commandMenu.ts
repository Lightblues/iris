import { COMMANDS, type CommandItem, type CommandId, type CommandResultMessage } from '../lib/types';

let menuContainer: HTMLDivElement | null = null;
let selectedIndex = 0;
let filteredCommands: CommandItem[] = [...COMMANDS];
let savedSelection: Range | null = null;

/** Save the current page selection before opening the menu */
function saveSelection(): void {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    savedSelection = sel.getRangeAt(0).cloneRange();
  } else {
    savedSelection = null;
  }
}

/** Restore the saved selection (so selection-dependent commands work) */
function restoreSelection(): void {
  if (!savedSelection) return;
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(savedSelection);
  }
}

export function showCommandMenu(): void {
  if (menuContainer) {
    hideCommandMenu();
    return; // Toggle behavior
  }

  // Save selection before menu steals focus
  saveSelection();

  // Create overlay
  menuContainer = document.createElement('div');
  menuContainer.id = 'iris-command-menu-overlay';
  menuContainer.innerHTML = `
    <div class="iris-command-menu">
      <input type="text" class="iris-command-input" placeholder="Type a command..." autofocus />
      <div class="iris-command-list"></div>
    </div>
  `;

  document.body.appendChild(menuContainer);

  const input = menuContainer.querySelector('.iris-command-input') as HTMLInputElement;
  const listEl = menuContainer.querySelector('.iris-command-list') as HTMLDivElement;

  // Initialize
  selectedIndex = 0;
  filteredCommands = [...COMMANDS];
  renderCommands(listEl);

  // Focus input
  setTimeout(() => input?.focus(), 0);

  // Event listeners
  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    filteredCommands = COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
    );
    selectedIndex = 0;
    renderCommands(listEl);
  });

  input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % Math.max(filteredCommands.length, 1);
        renderCommands(listEl);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + filteredCommands.length) % Math.max(filteredCommands.length, 1);
        renderCommands(listEl);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        hideCommandMenu();
        break;
    }
  });

  // Click outside to close
  menuContainer.addEventListener('click', (e) => {
    if (e.target === menuContainer) {
      hideCommandMenu();
    }
  });

  // Event delegation for command clicks (more reliable)
  listEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.iris-command-item') as HTMLElement;
    if (item) {
      const commandId = item.getAttribute('data-command-id');
      if (commandId) {
        executeCommand(commandId as CommandId);
      }
    }
  });

  // Event delegation for hover
  listEl.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.iris-command-item') as HTMLElement;
    if (item) {
      const items = Array.from(listEl.querySelectorAll('.iris-command-item'));
      const idx = items.indexOf(item);
      if (idx !== -1 && idx !== selectedIndex) {
        selectedIndex = idx;
        renderCommands(listEl);
      }
    }
  });
}

function renderCommands(listEl: HTMLDivElement): void {
  if (filteredCommands.length === 0) {
    listEl.innerHTML = '<div class="iris-command-empty">No matching commands</div>';
    return;
  }

  listEl.innerHTML = filteredCommands
    .map(
      (cmd, idx) => `
      <div class="iris-command-item ${idx === selectedIndex ? 'iris-command-selected' : ''}" data-command-id="${cmd.id}">
        <span class="iris-command-icon">${cmd.icon}</span>
        <div class="iris-command-text">
          <div class="iris-command-label">${cmd.label}</div>
          <div class="iris-command-desc">${cmd.description}</div>
        </div>
      </div>
    `
    )
    .join('');
  // Event listeners are handled via delegation on listEl (see showCommandMenu)
}

async function executeCommand(commandId: CommandId): Promise<void> {
  // Restore selection before hiding menu (so selection-dependent commands work)
  restoreSelection();
  hideCommandMenu();

  const pageInfo = {
    url: window.location.href,
    title: document.title,
  };

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'execute-command',
      commandId,
      pageInfo,
    }) as CommandResultMessage;

    showToast(response.message, response.success ? 'success' : 'error');
  } catch (error: any) {
    showToast(error.message || 'Command failed', 'error');
  }
}

export function hideCommandMenu(): void {
  if (menuContainer) {
    menuContainer.classList.add('iris-command-menu-closing');
    setTimeout(() => {
      menuContainer?.remove();
      menuContainer = null;
    }, 150);
  }
  savedSelection = null;
}

function showToast(message: string, type: 'success' | 'error'): void {
  const toast = document.createElement('div');
  toast.className = `iris-toast iris-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('iris-toast-visible'), 10);

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove('iris-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
