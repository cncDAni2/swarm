const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('swarmTraining', {
    startSession: payload => ipcRenderer.invoke('swarm-training:start-session', payload),
    appendTransitions: payload => ipcRenderer.invoke('swarm-training:append-transitions', payload),
    reportCollectionProgress: progress => ipcRenderer.send('swarm-training:collection-progress', progress),
    completeCollection: () => ipcRenderer.send('swarm-training:collection-complete')
});
