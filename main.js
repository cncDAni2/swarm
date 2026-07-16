const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function getTrainingDirectory(kind = 'episodes') {
    return path.join(app.getPath('userData'), 'training', kind);
}

const sessionDirectories = new Map();

function getCollectionOptions() {
    const rolloutIndex = process.argv.indexOf('--collect-rollouts');
    const dataIndex = process.argv.indexOf('--collect-data');
    const argumentIndex = rolloutIndex !== -1 ? rolloutIndex : dataIndex;
    if (argumentIndex === -1) return null;
    const requestedTarget = Number.parseInt(process.argv[argumentIndex + 1], 10);
    return {
        target: Number.isInteger(requestedTarget) && requestedTarget > 0 ? requestedTarget : 50000,
        policy: rolloutIndex !== -1 ? 'neural' : 'heuristic'
    };
}

function validateSessionId(sessionId) {
    if (typeof sessionId !== 'string' || !/^episode-[a-zA-Z0-9-]+$/.test(sessionId)) {
        throw new Error('Invalid training session identifier');
    }
}

async function initializeTrainingSession(_event, { sessionId, metadata }) {
    validateSessionId(sessionId);
    const directory = getTrainingDirectory(metadata?.source === 'neural-policy-rollout' ? 'rollouts' : 'episodes');
    await fs.mkdir(directory, { recursive: true });
    sessionDirectories.set(sessionId, directory);
    await fs.writeFile(
        path.join(directory, `${sessionId}.metadata.json`),
        JSON.stringify(metadata, null, 2),
        'utf8'
    );
}

async function appendTrainingTransitions(_event, { sessionId, transitions, complete }) {
    validateSessionId(sessionId);
    if (!Array.isArray(transitions)) throw new Error('Training transitions must be an array');

    const directory = sessionDirectories.get(sessionId) || getTrainingDirectory();
    await fs.mkdir(directory, { recursive: true });
    const serialized = transitions.map(transition => JSON.stringify(transition)).join('\n');
    if (serialized) {
        await fs.appendFile(path.join(directory, `${sessionId}.jsonl`), `${serialized}\n`, 'utf8');
    }
    if (complete) {
        await fs.writeFile(path.join(directory, `${sessionId}.complete`), '', 'utf8');
        sessionDirectories.delete(sessionId);
    }
}

function createWindow() {
    const collection = getCollectionOptions();
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        fullscreen: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            autoplayPolicy: 'no-user-gesture-required',
            preload: path.join(__dirname, 'preload.js') // We'll create a dummy preload if needed, or skip it
        },
        backgroundColor: '#000000',
        title: collection ? `SWARM ${collection.policy} Collection: 0 / ${collection.target}` : 'SWARM'
    });

    win.loadFile('index.html', {
        query: collection ? {
            collectData: '1',
            collectTarget: String(collection.target),
            collectPolicy: collection.policy
        } : {}
    });
    
    // Optional: Open DevTools
    // win.webContents.openDevTools();
}

app.whenReady().then(() => {
    ipcMain.handle('swarm-training:start-session', initializeTrainingSession);
    ipcMain.handle('swarm-training:append-transitions', appendTrainingTransitions);
    ipcMain.on('swarm-training:collection-progress', (event, progress) => {
        const total = Number(progress?.total);
        const target = Number(progress?.target);
        if (!Number.isFinite(total) || !Number.isFinite(target)) return;
        event.sender.getOwnerBrowserWindow()?.setTitle(
            progress.complete
                ? `SWARM Data Collection Complete: ${total} transitions`
                : `SWARM Data Collection: ${total} / ${target}`
        );
    });
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
