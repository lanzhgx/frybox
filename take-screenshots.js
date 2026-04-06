#!/usr/bin/env node
// Launches Frybox, sets up demo layouts, captures screenshots for README.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const outDir = path.join(__dirname, 'docs');
fs.mkdirSync(outDir, { recursive: true });

const ptys = new Map();
let win;

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f5f5f5',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Set up PTY IPC (same as main.js)
  ipcMain.handle('pty:create', (event, paneId, cols, rows) => {
    let pty;
    try { pty = require('node-pty'); } catch (e) { return { error: e.message }; }
    const shell = process.env.SHELL || '/bin/bash';
    const p = pty.spawn(shell, ['--login'], {
      name: 'xterm-256color', cols: cols || 80, rows: rows || 24,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
    ptys.set(paneId, p);
    p.onData(data => { if (win && !win.isDestroyed()) win.webContents.send(`pty:data:${paneId}`, data); });
    p.onExit(() => ptys.delete(paneId));
    return { ok: true };
  });
  ipcMain.on('pty:write', (e, id, data) => { ptys.get(id)?.write(data); });
  ipcMain.on('pty:resize', (e, id, c, r) => { try { ptys.get(id)?.resize(Math.max(2,c), Math.max(2,r)); } catch(_){} });
  ipcMain.on('pty:kill', (e, id) => { try { ptys.get(id)?.kill(); } catch(_){} ptys.delete(id); });
  ipcMain.on('session:title', () => {});
  ipcMain.on('theme:changed', () => {});

  win.loadFile('renderer/index.html');

  win.webContents.on('did-finish-load', async () => {
    await delay(2500); // let terminals boot

    // ── Screenshot 1: Light theme with named session ──
    await run(`
      const s = sessions.get(activeSessionId);
      if (s) {
        s.label = 'API Backend';
        document.getElementById('session-name-text').textContent = 'API Backend';
        document.querySelector('#tab-' + s.id + ' .tab-name').textContent = 'API Backend';
      }
      const p = panes.get(focusedPaneId);
      if (p) {
        p.label = 'Claude Code';
        p.nameSpan.textContent = 'Claude Code';
      }
    `);
    await delay(500);
    await capture('01-light-named-session.png');

    // ── Screenshot 2: Split panes with names ──
    await run(`splitFocusedPane('vertical')`);
    await delay(1500);
    await run(`
      const p = panes.get(focusedPaneId);
      if (p) { p.label = 'Server Logs'; p.nameSpan.textContent = 'Server Logs'; }
    `);
    await delay(300);
    await run(`splitFocusedPane('horizontal')`);
    await delay(1500);
    await run(`
      const p = panes.get(focusedPaneId);
      if (p) { p.label = 'Tests'; p.nameSpan.textContent = 'Tests'; }
    `);
    await delay(500);
    await capture('02-split-panes.png');

    // ── Screenshot 3: Multiple tabs ──
    await run(`createSession('Frontend')`);
    await delay(1500);
    await run(`
      const p = panes.get(focusedPaneId);
      if (p) { p.label = 'React Dev'; p.nameSpan.textContent = 'React Dev'; }
    `);
    await delay(300);
    await run(`createSession('Database')`);
    await delay(1500);
    await run(`
      const p = panes.get(focusedPaneId);
      if (p) { p.label = 'Migrations'; p.nameSpan.textContent = 'Migrations'; }
    `);
    await delay(300);
    // Switch back to first session to show tabs
    await run(`switchToSession([...sessions.keys()][0])`);
    await delay(800);
    await capture('03-multiple-tabs.png');

    // ── Screenshot 4: Dark theme ──
    await run(`setTheme('dark')`);
    await delay(600);
    await capture('04-dark-theme.png');

    // ── Screenshot 5: Monokai theme ──
    await run(`setTheme('monokai')`);
    await delay(600);
    await capture('05-monokai-theme.png');

    console.log('\nAll screenshots saved to docs/');
    ptys.forEach(p => { try { p.kill(); } catch(_){} });
    app.quit();
  });
});

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run(js) {
  try { await win.webContents.executeJavaScript(js); }
  catch (e) { console.error('JS error:', e.message); }
}

async function capture(filename) {
  const image = await win.webContents.capturePage();
  const filepath = path.join(outDir, filename);
  fs.writeFileSync(filepath, image.toPNG());
  console.log(`Captured: ${filename}`);
}
