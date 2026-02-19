/**
 * Electron Main Process (Debug Version)
 * Spawns the Next.js server as a child process, then opens it in a BrowserWindow.
 * On close, kills the server and the app exits cleanly.
 */
const { app, BrowserWindow, shell, dialog, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
// In prod, pick a random port or fallback to 3000. For now let's try 3333 to avoid dev collision
const PORT = 3333;
const DEV_MODE = process.env.NODE_ENV === 'development';
const APP_URL = `http://localhost:${PORT}`;

let mainWindow = null;
let nextProcess = null;
let tray = null;

// ── Logging ───────────────────────────────────────────────────────────────────
const logPath = path.join(app.getPath('userData'), 'electron.log');
function logToFile(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(logPath, line);
    } catch (e) {
        console.error('Failed to write log:', e);
    }
    if (DEV_MODE) console.log(line.trim());
}

logToFile('App starting...');
logToFile(`Resources Path: ${process.resourcesPath}`);
logToFile(`Exec Path: ${process.execPath}`);

// ── Next.js Server ────────────────────────────────────────────────────────────
function startNextServer() {
    return new Promise((resolve, reject) => {
        const isProd = !DEV_MODE;
        const resourcesPath = process.resourcesPath;
        const appPath = isProd ? path.join(resourcesPath, 'app.asar') : path.join(__dirname, '..');
        const executable = process.execPath;

        const scriptPath = isProd
            ? path.join(appPath, 'node_modules', 'next', 'dist', 'bin', 'next')
            : path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');

        const nextArgs = DEV_MODE
            ? ['dev', '--webpack']
            : ['start', appPath, '--port', String(PORT)];

        const spawnArgs = [scriptPath, ...nextArgs];
        const cwd = isProd ? resourcesPath : appPath;

        logToFile(`Starting Next.js with: ${executable} ${spawnArgs.join(' ')}`);
        logToFile(`CWD: ${cwd}`);

        try {
            nextProcess = spawn(executable, spawnArgs, {
                cwd,
                stdio: 'pipe',
                env: {
                    ...process.env,
                    PORT: String(PORT),
                    ELECTRON_RUN_AS_NODE: '1'
                },
                shell: false,
            });

            nextProcess.stdout.on('data', (d) => {
                const msg = d.toString().trim();
                logToFile(`[Next] ${msg}`);
                if (msg.includes('Ready') || msg.includes('started server') || msg.includes('Local:')) {
                    resolve();
                }
            });

            nextProcess.stderr.on('data', (d) => logToFile(`[Next ERR] ${d.toString().trim()}`));

            nextProcess.on('error', (err) => {
                logToFile(`[Electron] Spawn error: ${err.message}`);
                reject(err);
            });

            nextProcess.on('exit', (code) => {
                logToFile(`[Next] Server exited with code ${code}`);
                if (code !== 0 && code !== null) {
                    reject(new Error(`Next.js exited with code ${code}`));
                }
            });
        } catch (e) {
            logToFile(`[Electron] Synchronous spawn error: ${e.message}`);
            reject(e);
        }

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
    logToFile('Creating window...');
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
            webSecurity: false,
            devTools: true, // Enable DevTools for debugging
        },
    });

    logToFile(`Loading URL: ${APP_URL}`);
    mainWindow.loadURL(APP_URL).catch(e => logToFile(`LoadURL Error: ${e.message}`));

    // Open DevTools on start for debugging
    if (!DEV_MODE) mainWindow.webContents.openDevTools();

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Tray Icon ─────────────────────────────────────────────────────────────────
function createTray() {
    try {
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
    } catch (e) {
        logToFile(`Tray Error: ${e.message}`);
    }
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
    logToFile('App ready. Starting services...');
    try {
        await startNextServer();
        logToFile('Next.js ready. Opening UI.');
        createWindow();
        createTray();
    } catch (err) {
        logToFile(`Startup Error: ${err.message}`);
        dialog.showErrorBox('Startup Error', `Check log at ${logPath}\n\n${err.message}`);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (!mainWindow) createWindow();
});

app.on('before-quit', () => {
    logToFile('Quitting...');
    if (nextProcess) {
        nextProcess.kill('SIGTERM');
    }
});
