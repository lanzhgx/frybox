const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const os = require('os');

let mainWindow;
const ptys = new Map(); // paneId -> pty process

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f5f5f5',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');
  buildMenu('light');
}

function buildMenu(currentThemeId) {
  const send = (channel) => () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel);
  };

  const themeItems = ['dark', 'light', 'solarized-dark', 'monokai'].map(id => ({
    label: { dark: 'Dark', light: 'Light', 'solarized-dark': 'Solarized Dark', monokai: 'Monokai' }[id],
    type: 'radio',
    checked: id === currentThemeId,
    click: () => mainWindow.webContents.send('menu:set-theme', id),
  }));

  const menu = Menu.buildFromTemplate([
    {
      label: 'Frybox',
      submenu: [
        { label: 'About Frybox', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Session',
      submenu: [
        { label: 'New Session', accelerator: 'CmdOrCtrl+T', click: send('menu:new-session') },
        { label: 'Close Session', accelerator: 'CmdOrCtrl+Shift+W', click: send('menu:close-session') },
        { label: 'Rename Session', accelerator: 'CmdOrCtrl+Shift+R', click: send('menu:rename-session') },
        { type: 'separator' },
        { label: 'Next Session', accelerator: 'CmdOrCtrl+Shift+]', click: send('menu:next-session') },
        { label: 'Previous Session', accelerator: 'CmdOrCtrl+Shift+[', click: send('menu:prev-session') },
      ],
    },
    {
      label: 'Pane',
      submenu: [
        { label: 'Split Right', accelerator: 'CmdOrCtrl+D', click: send('menu:split-vertical') },
        { label: 'Split Down', accelerator: 'CmdOrCtrl+Shift+D', click: send('menu:split-horizontal') },
        { label: 'Rename Pane', accelerator: 'CmdOrCtrl+R', click: send('menu:rename-pane') },
        { label: 'Close Pane', accelerator: 'CmdOrCtrl+W', click: send('menu:close-pane') },
        { type: 'separator' },
        { label: 'Next Pane', accelerator: 'CmdOrCtrl+]', click: send('menu:next-pane') },
        { label: 'Previous Pane', accelerator: 'CmdOrCtrl+[', click: send('menu:prev-pane') },
        { type: 'separator' },
        { label: 'Focus Pane Left', accelerator: 'CmdOrCtrl+Option+Left', click: send('menu:focus-left') },
        { label: 'Focus Pane Right', accelerator: 'CmdOrCtrl+Option+Right', click: send('menu:focus-right') },
        { label: 'Focus Pane Up', accelerator: 'CmdOrCtrl+Option+Up', click: send('menu:focus-up') },
        { label: 'Focus Pane Down', accelerator: 'CmdOrCtrl+Option+Down', click: send('menu:focus-down') },
        { type: 'separator' },
        { label: 'Swap Pane Left', accelerator: 'CmdOrCtrl+Ctrl+A', click: send('menu:swap-left') },
        { label: 'Swap Pane Down', accelerator: 'CmdOrCtrl+Ctrl+S', click: send('menu:swap-down') },
        { label: 'Swap Pane Up', accelerator: 'CmdOrCtrl+Ctrl+W', click: send('menu:swap-up') },
        { label: 'Swap Pane Right', accelerator: 'CmdOrCtrl+Ctrl+D', click: send('menu:swap-right') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Theme', submenu: themeItems },
        { type: 'separator' },
        { label: 'Toggle DevTools', accelerator: 'CmdOrCtrl+Option+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'Ctrl+CmdOrCtrl+F', role: 'togglefullscreen' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  ptys.forEach(p => { try { p.kill(); } catch (_) {} });
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── PTY management ──────────────────────────────────────────────────────

ipcMain.handle('pty:create', (event, paneId, cols, rows) => {
  let pty;
  try {
    pty = require('node-pty');
  } catch (e) {
    console.error('node-pty not available:', e.message);
    return { error: e.message };
  }

  const shell = process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash');
  const ptyProcess = pty.spawn(shell, ['--login'], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  });

  ptys.set(paneId, ptyProcess);

  ptyProcess.onData(data => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:data:${paneId}`, data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    ptys.delete(paneId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:exit:${paneId}`, exitCode);
    }
  });

  return { ok: true };
});

ipcMain.on('pty:write', (event, id, data) => {
  const p = ptys.get(id);
  if (p) p.write(data);
});

ipcMain.on('pty:resize', (event, id, cols, rows) => {
  const p = ptys.get(id);
  if (p) {
    try { p.resize(Math.max(2, cols), Math.max(2, rows)); } catch (_) {}
  }
});

ipcMain.on('pty:kill', (event, id) => {
  const p = ptys.get(id);
  if (p) {
    try { p.kill(); } catch (_) {}
    ptys.delete(id);
  }
});

ipcMain.on('app:quit', () => app.quit());

ipcMain.on('session:title', (event, name) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(name ? `${name} — Frybox` : 'Frybox');
  }
});

// Rebuild native menu when theme changes (to update radio check)
ipcMain.on('theme:changed', (event, themeId) => {
  buildMenu(themeId);
});
