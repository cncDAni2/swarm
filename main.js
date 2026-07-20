const { app, BrowserWindow } = require('electron');

function createWindow() {
    const window = new BrowserWindow({
        width: 1280,
        height: 720,
        fullscreen: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            autoplayPolicy: 'no-user-gesture-required'
        },
        backgroundColor: '#000000',
        title: 'SWARM Arena'
    });

    window.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
