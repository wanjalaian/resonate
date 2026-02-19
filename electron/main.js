/**
 * Electron Main Process
 * Spawns the Next.js server as a child process, then opens it in a BrowserWindow.
 * On close, kills the server and the app exits cleanly.
 */
const { app, BrowserWindow, shell, dialog, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = 3000;
const DEV_MODE = process.env.NODE_ENV === 'development';
const APP_URL = `http://localhost:${PORT}`;

let mainWindow = null;
let nextProcess = null;
let tray = null;

// ── Next.js Server ────────────────────────────────────────────────────────────
function startNextServer() {
    return new Promise((resolve, reject) => {
        const isProd = !DEV_MODE;
        // In production, we are in resources/app.asar (virtual) or resources/app (unpacked).
        // Standard Electron config puts everything in app.asar.
        // spawn cannot use a virtual path for CWD.
        // So we interpret the path relative to resourcesPath.
        const resourcesPath = process.resourcesPath;
        const appPath = isProd ? path.join(resourcesPath, 'app.asar') : path.join(__dirname, '..');

        // We use the bundled Node environment (Electron binary itself)
        const executable = process.execPath;

        // Path to the Next.js CLI JavaScript file (fs-patched, so it can be read from ASAR)
        const scriptPath = isProd
            ? path.join(appPath, 'node_modules', 'next', 'dist', 'bin', 'next')
            : path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');

        // Arguments for Next.js
        // We pass 'appPath' as the directory argument to next start so it looks in the right place
        const nextArgs = DEV_MODE
            ? ['dev', '--webpack']
            : ['start', appPath, '--port', String(PORT)];

        // Spawn arguments: [scriptPath, ...nextArgs]
        const spawnArgs = [scriptPath, ...nextArgs];

        // Safe CWD: In prod, use resourcesPath (real dir). In dev, use project root.
        const cwd = isProd ? resourcesPath : appPath;

        console.log('[Electron] Starting Next.js with:', executable, spawnArgs.join(' '), 'cwd:', cwd);

        nextProcess = spawn(executable, spawnArgs, {
            cwd,
            stdio: 'pipe',
            env: {
                ...process.env,
                PORT: String(PORT),
                ELECTRON_RUN_AS_NODE: '1' // Crucial: Act as Node.js, not Electron app
            },
            shell: false, // Crucial: avoid /bin/sh ENOENT
        });

        nextProcess.stdout.on('data', (d) => {
            const msg = d.toString();
            console.log('[Next]', msg.trim());
            if (msg.includes('Ready') || msg.includes('started server') || msg.includes('Local:')) {
                resolve();
            }
        });

        nextProcess.stderr.on('data', (d) => console.error('[Next ERR]', d.toString().trim()));
        nextProcess.on('error', (err) => {
            console.error('[Electron] Spawn error:', err);
            reject(err);
        });
        nextProcess.on('exit', (code) => {
            console.log('[Next] Server exited with code', code);
            if (code !== 0 && code !== null) {
                // If it crashes immediately, reject
                reject(new Error(`Next.js exited with code ${code}`));
            }
        });

        // Timeout fallback — poll for the server to be ready
        const interval = setInterval(async () => {
            try {
                await pingServer();
                clearInterval(interval);
                resolve();
            } catch { /* still starting */ }
        }, 500);

        setTimeout(() => { clearInterval(interval); reject(new Error('Next.js server timed out')); }, 60_000);
    });
}

function pingServer() {
    return new Promise((resolve, reject) => {
        http.get(APP_URL, (res) => {
            if (res.statusCode < 500) resolve(res.statusCode);
            else reject(new Error(`Status ${res.statusCode}`));
        }).on('error', reject);
    });
}

// ── BrowserWindow ─────────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        backgroundColor: '#0a0a0a',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        title: 'Resonate',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false, // needed for blob: URLs from audio files
        },
    });

    mainWindow.loadURL(APP_URL);

    // Open external links in the system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Tray Icon ─────────────────────────────────────────────────────────────────
function createTray() {
    // Use a simple colored rectangle as tray icon if no image
    const icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAADsAAADw4BqAqTAAAAHnRFWHRDcmVhdGlvbiBUaW1lAFNhdCBKYW4gMTggMjAyNL3xp2YAAAD/SURBVFiF7ZYxCsJAEEX/bhItxBsvkKO4WoiHsPAGHkJEMIUgCIIi4nEsxHQp3MALpNAgCC5iZzKbbcgZsm+GnYH3YVkyTBEREREREREREcA4A9gAONQQ2ykBPNusxjbeXH0BXJX9vgfAfxBiYAAAAABJRU5ErkJggg=='
    );
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    const menu = Menu.buildFromTemplate([
        { label: 'Open Resonate', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setToolTip('Resonate — Render queue active');
    tray.setContextMenu(menu);
    tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('show-save-dialog', async (_, opts) => {
    return dialog.showSaveDialog(mainWindow, opts);
});

ipcMain.handle('show-open-dialog', async (_, opts) => {
    return dialog.showOpenDialog(mainWindow, opts);
});

ipcMain.handle('get-app-path', () => app.getPath('userData'));

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    console.log('[Electron] App ready. Starting Next.js server…');
    try {
        await startNextServer();
        console.log('[Electron] Next.js ready. Opening window…');
        createWindow();
        createTray();
    } catch (err) {
        console.error('[Electron] Failed to start server:', err);
        dialog.showErrorBox('Startup Error', 'Could not start the Resonate server:\n' + err.message);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    // On macOS, keep the app + server alive in the tray even when window is closed
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (!mainWindow) createWindow();
});

app.on('before-quit', () => {
    if (nextProcess) {
        console.log('[Electron] Killing Next.js server…');
        nextProcess.kill('SIGTERM');
    }
});
