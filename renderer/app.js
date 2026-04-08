'use strict';

const { ipcRenderer } = require('electron');
const { Terminal } = require('xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { WebLinksAddon } = require('@xterm/addon-web-links');

// ═══════════════════════════════════════════════════════════════════════════
// THEMES
// ═══════════════════════════════════════════════════════════════════════════

const THEMES = {
  dark: {
    name: 'Dark',
    terminal: {
      background: '#141414', foreground: '#e2e2e2',
      cursor: '#ffffff', cursorAccent: '#141414',
      selectionBackground: 'rgba(255,255,255,0.18)',
      black: '#1a1a1a', brightBlack: '#555',
      red: '#ff5f57', brightRed: '#ff6e67',
      green: '#28ca42', brightGreen: '#5af78e',
      yellow: '#d4c100', brightYellow: '#f4f99d',
      blue: '#007aff', brightBlue: '#6871ff',
      magenta: '#c678dd', brightMagenta: '#ff92d0',
      cyan: '#56b6c2', brightCyan: '#60fbff',
      white: '#c8c8c8', brightWhite: '#e6e6e6',
    },
  },
  light: {
    name: 'Light',
    terminal: {
      background: '#ffffff', foreground: '#1a1a1a',
      cursor: '#000000', cursorAccent: '#ffffff',
      selectionBackground: 'rgba(0,0,0,0.15)',
      black: '#000000', brightBlack: '#666666',
      red: '#c91b00', brightRed: '#e74c3c',
      green: '#00a600', brightGreen: '#2ecc71',
      yellow: '#c7c400', brightYellow: '#f39c12',
      blue: '#0225c7', brightBlue: '#3498db',
      magenta: '#c930c7', brightMagenta: '#9b59b6',
      cyan: '#00c5c7', brightCyan: '#1abc9c',
      white: '#c7c7c7', brightWhite: '#ffffff',
    },
  },
  'solarized-dark': {
    name: 'Solarized Dark',
    terminal: {
      background: '#002b36', foreground: '#839496',
      cursor: '#93a1a1', cursorAccent: '#002b36',
      selectionBackground: 'rgba(147,161,161,0.2)',
      black: '#073642', brightBlack: '#586e75',
      red: '#dc322f', brightRed: '#cb4b16',
      green: '#859900', brightGreen: '#586e75',
      yellow: '#b58900', brightYellow: '#657b83',
      blue: '#268bd2', brightBlue: '#839496',
      magenta: '#d33682', brightMagenta: '#6c71c4',
      cyan: '#2aa198', brightCyan: '#93a1a1',
      white: '#eee8d5', brightWhite: '#fdf6e3',
    },
  },
  monokai: {
    name: 'Monokai',
    terminal: {
      background: '#272822', foreground: '#f8f8f2',
      cursor: '#f8f8f0', cursorAccent: '#272822',
      selectionBackground: 'rgba(248,248,242,0.15)',
      black: '#272822', brightBlack: '#75715e',
      red: '#f92672', brightRed: '#f92672',
      green: '#a6e22e', brightGreen: '#a6e22e',
      yellow: '#f4bf75', brightYellow: '#f4bf75',
      blue: '#66d9ef', brightBlue: '#66d9ef',
      magenta: '#ae81ff', brightMagenta: '#ae81ff',
      cyan: '#a1efe4', brightCyan: '#a1efe4',
      white: '#f8f8f2', brightWhite: '#f9f8f5',
    },
  },
};

let currentThemeId = localStorage.getItem('frybox-theme') || 'light';

function setTheme(themeId) {
  if (!THEMES[themeId]) return;
  currentThemeId = themeId;
  localStorage.setItem('frybox-theme', themeId);
  document.body.setAttribute('data-theme', themeId);
  document.getElementById('theme-select').value = themeId;

  // Update all existing terminals
  const theme = THEMES[themeId].terminal;
  panes.forEach(pane => {
    pane.terminal.options.theme = theme;
  });

  // Tell main process to update native menu radio buttons
  ipcRenderer.send('theme:changed', themeId);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════════════════════════════

const SESSION_COLORS = [
  '#FF6B6B', '#4ECDC4', '#A78BFA', '#FBBF24',
  '#34D399', '#60A5FA', '#F472B6', '#FB923C',
];

// Sessions: each is a tab, containing a layout tree of panes
const sessions = new Map(); // id -> { id, label, color, layout, wrapEl }

// Panes: each is a single terminal + PTY
const panes = new Map(); // id -> { id, sessionId, terminal, fitAddon, element }

let activeSessionId = null;
let focusedPaneId = null;
let sessionCounter = 0;
let colorIndex = 0;

// ═══════════════════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════════════════

const tabsScroll       = document.getElementById('tabs-scroll');
const terminalsEl      = document.getElementById('terminals');
const sessionNameText  = document.getElementById('session-name-text');
const sessionNameInput = document.getElementById('session-name-input');
const sessionNameDisp  = document.getElementById('session-name-display');
const sessionColorSw   = document.getElementById('session-color-swatch');
const sessionColorBar  = document.getElementById('session-color-bar');
const renameBtn        = document.getElementById('rename-btn');
const newSessionBtn    = document.getElementById('new-session-btn');
const splitVBtn        = document.getElementById('split-v-btn');
const splitHBtn        = document.getElementById('split-h-btn');
const themeSelect      = document.getElementById('theme-select');

// ═══════════════════════════════════════════════════════════════════════════
// PANE CREATION
// ═══════════════════════════════════════════════════════════════════════════

let paneCounter = 0;

async function createPane(sessionId, paneName) {
  const id = `p${Date.now()}-${++paneCounter}`;
  const label = paneName || `Pane ${paneCounter}`;

  const terminal = new Terminal({
    theme: THEMES[currentThemeId].terminal,
    fontFamily: 'Menlo, Monaco, "Cascadia Code", "Fira Code", "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.3,
    cursorBlink: true,
    allowTransparency: true,
    scrollback: 5000,
    macOptionIsMeta: true,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon((event, uri) => {
    event.preventDefault();
    require('electron').shell.openExternal(uri);
  }));

  // Create the pane DOM element (persists for the life of the pane)
  const element = document.createElement('div');
  element.className = 'pane';
  element.id = `pane-${id}`;

  // ── Pane header with editable name ──
  const header = document.createElement('div');
  header.className = 'pane-header';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'pane-name';
  nameSpan.textContent = label;
  nameSpan.title = 'Double-click to rename';

  const nameInput = document.createElement('input');
  nameInput.className = 'pane-name-input';
  nameInput.type = 'text';
  nameInput.spellcheck = false;
  nameInput.autocomplete = 'off';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'pane-close-btn';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close pane';

  header.appendChild(nameSpan);
  header.appendChild(nameInput);
  header.appendChild(closeBtn);
  element.appendChild(header);

  // Terminal container (below header)
  const termContainer = document.createElement('div');
  termContainer.className = 'pane-terminal';
  element.appendChild(termContainer);

  // Pane rename: double-click name
  nameSpan.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startPaneRename(id);
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commitPaneRename(id); }
    if (e.key === 'Escape') { e.preventDefault(); cancelPaneRename(id); }
  });
  nameInput.addEventListener('blur', () => commitPaneRename(id));

  // Close button
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    focusPane(id);
    closeFocusedPane();
  });

  // Drag-to-swap: mousedown on header (but not on close btn, name input, or name span during editing)
  header.addEventListener('mousedown', (e) => {
    if (e.target === closeBtn || e.target === nameInput) return;
    if (e.target === nameSpan && e.detail >= 2) return; // allow double-click for rename
    // Small delay to distinguish click from drag intent
    const startX = e.clientX;
    const startY = e.clientY;
    const onFirstMove = (moveEvt) => {
      const dx = Math.abs(moveEvt.clientX - startX);
      const dy = Math.abs(moveEvt.clientY - startY);
      if (dx > 4 || dy > 4) {
        document.removeEventListener('mousemove', onFirstMove);
        document.removeEventListener('mouseup', onFirstUp);
        initPaneDrag(id, moveEvt);
      }
    };
    const onFirstUp = () => {
      document.removeEventListener('mousemove', onFirstMove);
      document.removeEventListener('mouseup', onFirstUp);
    };
    document.addEventListener('mousemove', onFirstMove);
    document.addEventListener('mouseup', onFirstUp);
  });

  // Focus on click anywhere in pane
  element.addEventListener('mousedown', () => focusPane(id));
  element.addEventListener('focusin', () => focusPane(id));

  terminal.open(termContainer);

  // Fix: intercept wheel events so scrolling always moves the viewport
  // instead of being forwarded as arrow keys to the running application
  // (e.g. Claude Code interprets Up arrow as command history navigation)
  termContainer.addEventListener('wheel', (e) => {
    const buf = terminal.buffer.active;
    const hasScrollback = buf.baseY > 0;
    const atTop = buf.viewportY === 0;
    const atBottom = buf.viewportY === buf.baseY;
    const scrollingUp = e.deltaY < 0;
    const scrollingDown = e.deltaY > 0;

    // If there's scrollback content and we're not already at the boundary,
    // scroll the viewport instead of letting xterm forward to the app
    if (hasScrollback && !(scrollingUp && atTop) && !(scrollingDown && atBottom)) {
      e.preventDefault();
      e.stopPropagation();
      const lines = Math.ceil(Math.abs(e.deltaY) / 20);
      terminal.scrollLines(scrollingUp ? -lines : lines);
    }
  }, { capture: true });

  // Auto-refit terminal whenever its container is resized (splits, window resize, drag handle)
  let ptyCreated = false;
  const paneResizeObserver = new ResizeObserver(() => {
    try { fitAddon.fit(); } catch (_) {}
  });
  paneResizeObserver.observe(termContainer);

  const pane = { id, sessionId, label, terminal, fitAddon, element, header, nameSpan, nameInput, resizeObserver: paneResizeObserver };
  panes.set(id, pane);

  // Defer PTY creation until element is in DOM and has size
  // Use double-rAF to ensure CSS layout is computed after split rendering
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    fitAddon.fit();
    const { cols, rows } = terminal;
    const result = await ipcRenderer.invoke('pty:create', id, cols, rows);
    if (result && result.error) {
      terminal.writeln(`\x1b[31mFailed to start shell: ${result.error}\x1b[0m`);
    }
    ptyCreated = true;
  }));

  // PTY ↔ terminal wiring
  ipcRenderer.on(`pty:data:${id}`, (_, data) => terminal.write(data));
  ipcRenderer.on(`pty:exit:${id}`, (_, code) => {
    terminal.writeln(`\r\n\x1b[2m[Process exited with code ${code}]\x1b[0m`);
  });
  terminal.onData(data => ipcRenderer.send('pty:write', id, data));
  terminal.onResize(({ cols, rows }) => ipcRenderer.send('pty:resize', id, cols, rows));

  return id;
}

function destroyPane(id) {
  const pane = panes.get(id);
  if (!pane) return;
  if (pane.resizeObserver) pane.resizeObserver.disconnect();
  ipcRenderer.send('pty:kill', id);
  ipcRenderer.removeAllListeners(`pty:data:${id}`);
  ipcRenderer.removeAllListeners(`pty:exit:${id}`);
  pane.terminal.dispose();
  pane.element.remove();
  panes.delete(id);
}

function focusPane(id) {
  if (focusedPaneId === id) return;
  const pane = panes.get(id);
  if (!pane) return;

  // Remove focus from all panes in this session
  const session = sessions.get(pane.sessionId);
  if (session) {
    getAllPaneIds(session.layout).forEach(pid => {
      const p = panes.get(pid);
      if (p) p.element.classList.remove('focused');
    });
  }

  // Apply focus
  pane.element.classList.add('focused');
  const focusColor = session?.color || '#4ECDC4';
  pane.element.style.setProperty('--pane-focus-color', focusColor);
  pane.header.style.setProperty('--pane-header-accent', focusColor);
  focusedPaneId = id;

  pane.terminal.focus();
}

// ═══════════════════════════════════════════════════════════════════════════
// PANE RENAME
// ═══════════════════════════════════════════════════════════════════════════

function startPaneRename(paneId) {
  const pane = panes.get(paneId);
  if (!pane) return;
  pane.nameSpan.style.display = 'none';
  pane.nameInput.style.display = 'block';
  pane.nameInput.value = pane.label;
  pane.nameInput.focus();
  pane.nameInput.select();
}

function commitPaneRename(paneId) {
  const pane = panes.get(paneId);
  if (!pane) return;
  const newLabel = pane.nameInput.value.trim();
  if (newLabel) {
    pane.label = newLabel;
    pane.nameSpan.textContent = newLabel;
  }
  pane.nameInput.style.display = 'none';
  pane.nameSpan.style.display = '';
  pane.terminal.focus();
}

function cancelPaneRename(paneId) {
  const pane = panes.get(paneId);
  if (!pane) return;
  pane.nameInput.style.display = 'none';
  pane.nameSpan.style.display = '';
  pane.terminal.focus();
}

function renameFocusedPane() {
  if (focusedPaneId) startPaneRename(focusedPaneId);
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT TREE UTILITIES
//
// Layout node types:
//   { type: 'pane', paneId: string }
//   { type: 'split', direction: 'vertical'|'horizontal', ratio: 0.5, children: [node, node] }
// ═══════════════════════════════════════════════════════════════════════════

function getAllPaneIds(node) {
  if (!node) return [];
  if (node.type === 'pane') return [node.paneId];
  return [...getAllPaneIds(node.children[0]), ...getAllPaneIds(node.children[1])];
}

function findPaneInTree(node, paneId, parent, childIdx) {
  if (node.type === 'pane' && node.paneId === paneId) {
    return { node, parent: parent || null, childIdx: childIdx ?? -1 };
  }
  if (node.type === 'split') {
    for (let i = 0; i < node.children.length; i++) {
      const r = findPaneInTree(node.children[i], paneId, node, i);
      if (r) return r;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION CREATION
// ═══════════════════════════════════════════════════════════════════════════

async function createSession(name) {
  const id = `s${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const label = name || `Session ${++sessionCounter}`;
  const color = SESSION_COLORS[colorIndex++ % SESSION_COLORS.length];

  // Session wrapper element
  const wrapEl = document.createElement('div');
  wrapEl.className = 'session-wrap';
  wrapEl.id = `session-${id}`;
  terminalsEl.appendChild(wrapEl);

  // Create initial pane
  const paneId = await createPane(id);

  const session = {
    id, label, color,
    layout: { type: 'pane', paneId },
    wrapEl,
  };
  sessions.set(id, session);

  addTab(session);
  switchToSession(id);
  focusPane(paneId);

  return id;
}

function closeSession(id) {
  const session = sessions.get(id);
  if (!session) return;

  // Destroy all panes in this session
  getAllPaneIds(session.layout).forEach(destroyPane);

  // Clean up DOM
  session.wrapEl.remove();
  document.getElementById(`tab-${id}`)?.remove();
  sessions.delete(id);
  refreshTabIndices();

  if (activeSessionId === id) {
    const remaining = [...sessions.keys()];
    if (remaining.length > 0) {
      switchToSession(remaining[remaining.length - 1]);
    } else {
      activeSessionId = null;
      focusedPaneId = null;
      sessionNameText.textContent = '';
      sessionColorSw.style.backgroundColor = 'transparent';
      sessionColorBar.style.backgroundColor = 'transparent';
      ipcRenderer.send('session:title', null);
      ipcRenderer.send('app:quit');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function addTab(session) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.id = `tab-${session.id}`;
  tab.innerHTML = `
    <span class="tab-dot" style="background:${session.color}"></span>
    <span class="tab-name">${escHtml(session.label)}</span>
    <span class="tab-index"></span>
    <button class="tab-close" title="Close session">×</button>
  `;
  tab.addEventListener('click', e => {
    if (!e.target.classList.contains('tab-close')) switchToSession(session.id);
  });
  tab.querySelector('.tab-close').addEventListener('click', e => {
    e.stopPropagation();
    closeSession(session.id);
  });
  tabsScroll.appendChild(tab);
  refreshTabIndices();
}

function refreshTabIndices() {
  tabsScroll.querySelectorAll('.tab').forEach((tab, i) => {
    const idx = tab.querySelector('.tab-index');
    if (idx) idx.textContent = i + 1 <= 9 ? `⌘${i + 1}` : '';
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

function switchToSession(id) {
  const session = sessions.get(id);
  if (!session) return;

  // Hide all sessions
  sessions.forEach((s, sid) => {
    s.wrapEl.classList.remove('active');
    document.getElementById(`tab-${sid}`)?.classList.remove('active');
  });

  // Show this session
  session.wrapEl.classList.add('active');
  document.getElementById(`tab-${id}`)?.classList.add('active');
  activeSessionId = id;

  // Update titlebar
  sessionNameText.textContent = session.label;
  sessionColorSw.style.backgroundColor = session.color;
  sessionColorBar.style.backgroundColor = session.color;
  ipcRenderer.send('session:title', session.label);

  document.getElementById(`tab-${id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });

  // Render the layout and fit all panes
  renderSessionLayout(id);

  // Extra delayed fit to handle terminals opened while container was hidden
  // (terminal.open() on a zero-sized container needs a fit after layout settles)
  setTimeout(() => {
    getAllPaneIds(session.layout).forEach(pid => {
      const p = panes.get(pid);
      if (p) { try { p.fitAddon.fit(); } catch (_) {} }
    });
  }, 50);

  // Focus the previously focused pane in this session, or the first one
  const paneIds = getAllPaneIds(session.layout);
  if (paneIds.includes(focusedPaneId)) {
    focusPane(focusedPaneId);
  } else if (paneIds.length > 0) {
    focusPane(paneIds[0]);
  }
}

function switchSessionRelative(delta) {
  const ids = [...sessions.keys()];
  if (!ids.length) return;
  const cur = ids.indexOf(activeSessionId);
  const next = (cur + delta + ids.length) % ids.length;
  switchToSession(ids[next]);
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT RENDERING
//
// Recursively builds DOM from the layout tree, reusing pane elements.
// ═══════════════════════════════════════════════════════════════════════════

function renderSessionLayout(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Clear the wrapper but DON'T destroy pane elements (they're moved, not deleted)
  // Detach all pane elements first
  getAllPaneIds(session.layout).forEach(pid => {
    const p = panes.get(pid);
    if (p && p.element.parentNode) p.element.parentNode.removeChild(p.element);
  });

  session.wrapEl.innerHTML = '';
  buildLayoutDOM(session.layout, session.wrapEl);

  // Fit all panes after layout — use double-rAF to ensure CSS layout is fully
  // computed (especially when session wrapper just became visible via .active)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    getAllPaneIds(session.layout).forEach(pid => {
      const p = panes.get(pid);
      if (p) {
        try { p.fitAddon.fit(); } catch (_) {}
      }
    });
  }));
}

function buildLayoutDOM(node, container) {
  if (node.type === 'pane') {
    const pane = panes.get(node.paneId);
    if (pane) container.appendChild(pane.element);
    return;
  }

  const splitEl = document.createElement('div');
  splitEl.className = `split-container ${node.direction}`;

  const child1 = document.createElement('div');
  child1.className = 'split-child';

  const handle = document.createElement('div');
  handle.className = `split-handle ${node.direction}`;

  const child2 = document.createElement('div');
  child2.className = 'split-child';

  // Apply ratio
  applyRatio(node, child1, child2);

  buildLayoutDOM(node.children[0], child1);
  buildLayoutDOM(node.children[1], child2);

  // Handle dragging
  setupDragHandle(handle, node, child1, child2, splitEl);

  splitEl.appendChild(child1);
  splitEl.appendChild(handle);
  splitEl.appendChild(child2);
  container.appendChild(splitEl);
}

function applyRatio(node, child1, child2) {
  const r = node.ratio || 0.5;
  const handleSize = 3; // px
  if (node.direction === 'vertical') {
    child1.style.width = `calc(${r * 100}% - ${handleSize / 2}px)`;
    child1.style.flex = 'none';
    child2.style.flex = '1';
  } else {
    child1.style.height = `calc(${r * 100}% - ${handleSize / 2}px)`;
    child1.style.flex = 'none';
    child2.style.flex = '1';
  }
}

function setupDragHandle(handle, node, child1, child2, splitEl) {
  let dragging = false;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = node.direction === 'vertical' ? 'col-resize' : 'row-resize';
    // Prevent terminal from capturing mouse
    document.body.style.pointerEvents = 'none';
    handle.style.pointerEvents = 'auto';

    const onMove = (e) => {
      const rect = splitEl.getBoundingClientRect();
      let ratio;
      if (node.direction === 'vertical') {
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        ratio = (e.clientY - rect.top) / rect.height;
      }
      ratio = Math.max(0.1, Math.min(0.9, ratio));
      node.ratio = ratio;
      applyRatio(node, child1, child2);

      // Refit all panes in active session
      if (activeSessionId) {
        const session = sessions.get(activeSessionId);
        if (session) {
          getAllPaneIds(session.layout).forEach(pid => {
            const p = panes.get(pid);
            if (p) { try { p.fitAddon.fit(); } catch (_) {} }
          });
        }
      }
    };

    const onUp = () => {
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.pointerEvents = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT & CLOSE PANE
// ═══════════════════════════════════════════════════════════════════════════

async function splitFocusedPane(direction) {
  if (!focusedPaneId || !activeSessionId) return;

  const session = sessions.get(activeSessionId);
  if (!session) return;

  const result = findPaneInTree(session.layout, focusedPaneId);
  if (!result) return;

  const newPaneId = await createPane(activeSessionId);

  const newSplit = {
    type: 'split',
    direction,
    ratio: 0.5,
    children: [
      { ...result.node },
      { type: 'pane', paneId: newPaneId },
    ],
  };

  // Replace the node in the tree
  if (result.parent) {
    result.parent.children[result.childIdx] = newSplit;
  } else {
    session.layout = newSplit;
  }

  renderSessionLayout(activeSessionId);
  focusPane(newPaneId);
}

function closeFocusedPane() {
  if (!focusedPaneId || !activeSessionId) return;

  const session = sessions.get(activeSessionId);
  if (!session) return;

  const allPanes = getAllPaneIds(session.layout);
  if (allPanes.length <= 1) {
    // Last pane — close the session
    closeSession(activeSessionId);
    return;
  }

  const result = findPaneInTree(session.layout, focusedPaneId);
  if (!result) return;

  const paneIdToClose = focusedPaneId;

  if (!result.parent) {
    // Shouldn't happen if allPanes.length > 1, but just in case
    closeSession(activeSessionId);
    return;
  }

  // Replace parent split with sibling in-place
  const siblingIdx = result.childIdx === 0 ? 1 : 0;
  const sibling = result.parent.children[siblingIdx];

  // Copy sibling properties onto parent node (in-place replacement)
  const parentKeys = Object.keys(result.parent);
  parentKeys.forEach(k => delete result.parent[k]);
  Object.assign(result.parent, sibling);

  destroyPane(paneIdToClose);
  renderSessionLayout(activeSessionId);

  // Focus a remaining pane
  const remaining = getAllPaneIds(session.layout);
  if (remaining.length > 0) {
    focusPane(remaining[0]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PANE NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

function cyclePaneRelative(delta) {
  if (!activeSessionId) return;
  const session = sessions.get(activeSessionId);
  if (!session) return;

  const ids = getAllPaneIds(session.layout);
  if (ids.length <= 1) return;

  const cur = ids.indexOf(focusedPaneId);
  const next = (cur + delta + ids.length) % ids.length;
  focusPane(ids[next]);
}

// Shared helper: find nearest pane in a direction using bounding rects
function findPaneInDirection(dir, fromPaneId) {
  if (!activeSessionId) return null;
  const session = sessions.get(activeSessionId);
  if (!session) return null;

  const ids = getAllPaneIds(session.layout);
  if (ids.length <= 1) return null;

  const fromPane = panes.get(fromPaneId || focusedPaneId);
  if (!fromPane) return null;

  const currentRect = fromPane.element.getBoundingClientRect();
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  let bestId = null;
  let bestDist = Infinity;

  ids.forEach(pid => {
    if (pid === (fromPaneId || focusedPaneId)) return;
    const p = panes.get(pid);
    if (!p) return;
    const r = p.element.getBoundingClientRect();
    const px = r.left + r.width / 2;
    const py = r.top + r.height / 2;
    const dx = px - cx;
    const dy = py - cy;

    let valid = false;
    if (dir === 'left'  && dx < -10) valid = true;
    if (dir === 'right' && dx > 10)  valid = true;
    if (dir === 'up'    && dy < -10) valid = true;
    if (dir === 'down'  && dy > 10)  valid = true;

    if (valid) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = pid;
      }
    }
  });

  return bestId;
}

function focusDirection(dir) {
  const targetId = findPaneInDirection(dir);
  if (targetId) focusPane(targetId);
}

// ═══════════════════════════════════════════════════════════════════════════
// SWAP PANES
// ═══════════════════════════════════════════════════════════════════════════

function swapPanes(idA, idB) {
  if (!idA || !idB || idA === idB || !activeSessionId) return;
  const session = sessions.get(activeSessionId);
  if (!session) return;

  const resultA = findPaneInTree(session.layout, idA);
  const resultB = findPaneInTree(session.layout, idB);
  if (!resultA || !resultB) return;

  // Swap the paneId values in the layout tree leaf nodes
  resultA.node.paneId = idB;
  resultB.node.paneId = idA;

  // Re-render layout (moves DOM elements to new positions)
  renderSessionLayout(activeSessionId);

  // Keep focus on the originally focused pane
  if (focusedPaneId === idA || focusedPaneId === idB) {
    // Force re-apply focus since focusPane short-circuits if id matches
    const keepId = focusedPaneId;
    focusedPaneId = null;
    focusPane(keepId);
  }
}

function swapFocusedPane(dir) {
  if (!focusedPaneId) return;
  const targetId = findPaneInDirection(dir);
  if (targetId) swapPanes(focusedPaneId, targetId);
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAG-AND-DROP PANE REARRANGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let dragState = null; // { paneId, ghost, targetPaneId }

function initPaneDrag(paneId, startEvent) {
  const pane = panes.get(paneId);
  if (!pane) return;

  // Create floating ghost label
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = pane.label;
  ghost.style.left = `${startEvent.clientX + 12}px`;
  ghost.style.top = `${startEvent.clientY - 10}px`;
  document.body.appendChild(ghost);

  // Mark source pane as dragging
  pane.element.classList.add('dragging');

  // Disable pointer events on terminals so mousemove works over them
  document.body.classList.add('pane-dragging');

  dragState = { paneId, ghost, targetPaneId: null };

  const onMove = (e) => {
    if (!dragState) return;

    // Move ghost
    dragState.ghost.style.left = `${e.clientX + 12}px`;
    dragState.ghost.style.top = `${e.clientY - 10}px`;

    // Find which pane the cursor is over
    const hoveredEl = document.elementFromPoint(e.clientX, e.clientY);
    const hoveredPane = hoveredEl?.closest('.pane');
    const hoveredPaneId = hoveredPane ? getPaneIdFromElement(hoveredPane) : null;

    // Update target highlight
    if (hoveredPaneId !== dragState.targetPaneId) {
      // Remove old highlight
      if (dragState.targetPaneId) {
        const old = panes.get(dragState.targetPaneId);
        if (old) old.element.classList.remove('drag-target');
      }
      // Add new highlight (only if different from source)
      if (hoveredPaneId && hoveredPaneId !== dragState.paneId) {
        const target = panes.get(hoveredPaneId);
        if (target) target.element.classList.add('drag-target');
        dragState.targetPaneId = hoveredPaneId;
      } else {
        dragState.targetPaneId = null;
      }
    }
  };

  const onUp = () => {
    if (!dragState) return;

    const { paneId: srcId, ghost: g, targetPaneId: tgtId } = dragState;

    // Clean up visual state
    g.remove();
    document.body.classList.remove('pane-dragging');
    const srcPane = panes.get(srcId);
    if (srcPane) srcPane.element.classList.remove('dragging');
    if (tgtId) {
      const tgtPane = panes.get(tgtId);
      if (tgtPane) tgtPane.element.classList.remove('drag-target');
    }

    // Perform the swap
    if (tgtId && tgtId !== srcId) {
      swapPanes(srcId, tgtId);
    }

    dragState = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function getPaneIdFromElement(el) {
  const id = el.id; // "pane-p1234-1"
  if (id && id.startsWith('pane-')) return id.slice(5);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// RENAME SESSION
// ═══════════════════════════════════════════════════════════════════════════

function startRename() {
  const session = sessions.get(activeSessionId);
  if (!session) return;
  sessionNameDisp.style.display = 'none';
  sessionNameInput.style.display = 'block';
  sessionNameInput.value = session.label;
  sessionNameInput.focus();
  sessionNameInput.select();
}

function commitRename() {
  const session = sessions.get(activeSessionId);
  const newLabel = sessionNameInput.value.trim();
  if (session && newLabel) {
    session.label = newLabel;
    sessionNameText.textContent = newLabel;
    const tab = document.getElementById(`tab-${activeSessionId}`);
    if (tab) tab.querySelector('.tab-name').textContent = newLabel;
    ipcRenderer.send('session:title', newLabel);
  }
  cancelRename();
}

function cancelRename() {
  sessionNameInput.style.display = 'none';
  sessionNameDisp.style.display = 'flex';
  if (focusedPaneId) {
    const p = panes.get(focusedPaneId);
    if (p) p.terminal.focus();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UI EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

renameBtn.addEventListener('click', startRename);
sessionNameText.addEventListener('dblclick', startRename);

sessionNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { e.preventDefault(); commitRename(); }
  if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
});
sessionNameInput.addEventListener('blur', commitRename);

newSessionBtn.addEventListener('click', () => createSession());
splitVBtn.addEventListener('click', () => splitFocusedPane('vertical'));
splitHBtn.addEventListener('click', () => splitFocusedPane('horizontal'));

themeSelect.addEventListener('change', () => setTheme(themeSelect.value));

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Cmd+1–9: jump to session by position
  if (e.metaKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key, 10) - 1;
    const id = [...sessions.keys()][idx];
    if (id) { e.preventDefault(); switchToSession(id); }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PROCESS MENU EVENTS
// ═══════════════════════════════════════════════════════════════════════════

ipcRenderer.on('menu:new-session',      () => createSession());
ipcRenderer.on('menu:close-session',    () => { if (activeSessionId) closeSession(activeSessionId); });
ipcRenderer.on('menu:rename-session',   () => startRename());
ipcRenderer.on('menu:next-session',     () => switchSessionRelative(1));
ipcRenderer.on('menu:prev-session',     () => switchSessionRelative(-1));

ipcRenderer.on('menu:split-vertical',   () => splitFocusedPane('vertical'));
ipcRenderer.on('menu:split-horizontal', () => splitFocusedPane('horizontal'));
ipcRenderer.on('menu:close-pane',       () => closeFocusedPane());
ipcRenderer.on('menu:next-pane',        () => cyclePaneRelative(1));
ipcRenderer.on('menu:prev-pane',        () => cyclePaneRelative(-1));

ipcRenderer.on('menu:focus-left',  () => focusDirection('left'));
ipcRenderer.on('menu:focus-right', () => focusDirection('right'));
ipcRenderer.on('menu:focus-up',    () => focusDirection('up'));
ipcRenderer.on('menu:focus-down',  () => focusDirection('down'));
ipcRenderer.on('menu:rename-pane', () => renameFocusedPane());

ipcRenderer.on('menu:swap-left',  () => swapFocusedPane('left'));
ipcRenderer.on('menu:swap-right', () => swapFocusedPane('right'));
ipcRenderer.on('menu:swap-up',    () => swapFocusedPane('up'));
ipcRenderer.on('menu:swap-down',  () => swapFocusedPane('down'));

ipcRenderer.on('menu:set-theme', (_, themeId) => setTheme(themeId));

// ═══════════════════════════════════════════════════════════════════════════
// WINDOW RESIZE: refit all visible panes
// ═══════════════════════════════════════════════════════════════════════════

const resizeObserver = new ResizeObserver(() => {
  if (!activeSessionId) return;
  const session = sessions.get(activeSessionId);
  if (!session) return;
  getAllPaneIds(session.layout).forEach(pid => {
    const p = panes.get(pid);
    if (p) { try { p.fitAddon.fit(); } catch (_) {} }
  });
});
resizeObserver.observe(terminalsEl);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function escHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════

// Apply saved theme
setTheme(currentThemeId);

// Open first session
createSession('Session 1');
