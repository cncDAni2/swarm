const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('swarmTraining', {
    startSession: payload => ipcRenderer.invoke('swarm-training:start-session', payload),
    appendTransitions: payload => ipcRenderer.invoke('swarm-training:append-transitions', payload)
});
