const { app, BrowserWindow, shell, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let serverProcess;
let serverPort = null;

function getServerPidFilePath() {
    return path.join(app.getPath('userData'), 'server.pid');
}

// Kill any headless server process left running from a previous session that
// crashed or was force-killed before it could clean up after itself (normal
// quit already handles this via killServerProcess() + 'before-quit').
function cleanupOrphanedServer() {
    const pidFilePath = getServerPidFilePath();
    if (!fs.existsSync(pidFilePath)) return;

    let pid;
    try {
        pid = parseInt(fs.readFileSync(pidFilePath, 'utf8').trim(), 10);
    } catch (e) {
        pid = NaN;
    }
    try { fs.unlinkSync(pidFilePath); } catch (e) {}
    if (!pid || Number.isNaN(pid)) return;

    // Confirm this PID is still our own orphaned backend process before
    // touching it — the OS can reuse a PID for an unrelated process between
    // runs, and killing based on liveness alone would be unsafe.
    try {
        const { execSync } = require('child_process');
        const cmdline = process.platform === 'win32'
            ? execSync(`wmic process where ProcessId=${pid} get CommandLine`, { timeout: 5000 }).toString()
            : execSync(`ps -p ${pid} -o command=`, { timeout: 5000 }).toString();

        if (cmdline.includes('server.js')) {
            if (process.platform === 'win32') {
                execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', timeout: 5000 });
            } else {
                process.kill(pid, 'SIGKILL');
            }
        }
    } catch (e) {
        // PID no longer exists (or already gone) — nothing to clean up
    }
}

// Reduce Electron's own Chromium memory footprint
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Acquire single instance lock early
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.on('ready', () => {
        cleanupOrphanedServer();
        createWindow();
    });

    app.on('window-all-closed', function () {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', function () {
        if (mainWindow === null) {
            createWindow();
        }
    });

    app.on('before-quit', () => {
        killServerProcess();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false, // Security best practice
            contextIsolation: true,
        },
        icon: path.join(__dirname, 'public', 'icon.png') // App window icon
    });

    // Remove the default File/Edit/View menu completely
    mainWindow.removeMenu();

    // Start fully maximized
    mainWindow.maximize();

    // Allow Ctrl+R to still reload the window natively even without the menu bar
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.key.toLowerCase() === 'r') {
            mainWindow.reload();
            event.preventDefault();
        }
    });

    // Start the Express server — but only if one isn't already running. On
    // macOS, closing the window (red button) doesn't quit the app, so
    // reopening via the Dock icon re-enters this function; reuse the
    // still-alive backend (and its live WhatsApp session) instead of
    // spawning a duplicate.
    if (serverProcess && serverProcess.pid !== undefined) {
        if (serverPort) {
            mainWindow.loadURL(`http://localhost:${serverPort}`);
        }
        // else: server is still starting up from a prior createWindow() call —
        // its stdout listener will call loadURL() on the (now current) mainWindow
        // once it detects the port.
    } else {
        startServer();
    }

    // The loadURL will be handled dynamically inside startServer()
    // when it receives the "Server running on port X" stdout message

    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function startServer() {
    const userDataPath = app.getPath('userData');
    const crashLogPath = path.join(userDataPath, 'crash.log');

    const childEnv = Object.assign({}, process.env, {
        APP_USER_DATA_PATH: userDataPath,
        PORT: '0',
        PACKAGED_ELECTRON: app.isPackaged ? 'true' : '',
    });

    try {
        fs.appendFileSync(crashLogPath, `[Spawning] AppPath: ${app.getAppPath()}\n`);
    } catch (e) { }

    // Run the backend as a Node-only utility process — it gets Electron's
    // ASAR-aware require() (unlike plain ELECTRON_RUN_AS_NODE, which breaks
    // ASAR support on Windows) without booting a Chromium renderer or GPU
    // process, unlike the previous approach of relaunching a whole second
    // copy of this Electron app.
    serverProcess = utilityProcess.fork(path.join(app.getAppPath(), 'server.js'), [], {
        env: childEnv,
        stdio: 'pipe',
        serviceName: 'AJM WhatsApp Bot Backend',
        // NODE_OPTIONS isn't supported for utility processes in packaged apps —
        // pass the V8 heap-size flag via execArgv instead, which is.
        execArgv: ['--max-old-space-size=256'],
    });

    try { fs.writeFileSync(getServerPidFilePath(), String(serverProcess.pid)); } catch (e) {}

    let portFound = false;

    serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Forward to the electron console for debugging
        console.log(`[Server] ${output}`);

        // Listen for our special port print sequence
        if (!portFound) {
            const match = output.match(/SERVER_PORT=(\d+)/);
            if (match && match[1]) {
                portFound = true;
                const port = match[1];
                serverPort = port;
                console.log(`[Electron] Detected server running on dynamic port ${port}`);
                if (mainWindow) {
                    mainWindow.loadURL(`http://localhost:${port}`);
                }
            }
        }
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`[Server Error] ${data.toString()}`);
        try { fs.appendFileSync(crashLogPath, `[Server Stderr] ${data.toString()}\n`); } catch (e) { }
    });

    serverProcess.on('exit', (code) => {
        serverPort = null;
        try { fs.unlinkSync(getServerPidFilePath()); } catch (e) { }
        try { fs.appendFileSync(crashLogPath, `[Server Exit] Code: ${code}\n`); } catch (e) { }
    });
}

function killServerProcess() {
    if (!serverProcess) return;
    try { serverProcess.kill(); } catch (e) {}
    serverProcess = null;
}

// Global error handler for the main process to catch uncaught exceptions
process.on('uncaughtException', (err) => {
    try {
        fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), `[Main Error] ${err.message}\n${err.stack}\n`);
    } catch (e) { }
});
