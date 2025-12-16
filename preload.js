const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // OBS related functions
  connectOBS: (config) => ipcRenderer.invoke('obs:connect', config),
  disconnectOBS: () => ipcRenderer.invoke('obs:disconnect'),
  getOBSScenes: () => ipcRenderer.invoke('obs:getScenes'),
  switchOBSScene: (sceneName) => ipcRenderer.invoke('obs:switchScene', sceneName),
  getOBSSources: () => ipcRenderer.invoke('obs:getSources'),
  toggleSource: (sourceName, visible) => ipcRenderer.invoke('obs:toggleSource', sourceName, visible),

  // Twitch related functions
  connectTwitch: (config) => ipcRenderer.invoke('twitch:connect', config),
  disconnectTwitch: () => ipcRenderer.invoke('twitch:disconnect'),
  sendTwitchMessage: (message) => ipcRenderer.invoke('twitch:sendMessage', message),

  // Action management
  loadActions: () => ipcRenderer.invoke('actions:load'),
  saveActions: (actions) => ipcRenderer.invoke('actions:save', actions),
  createAction: (action) => ipcRenderer.invoke('actions:create', action),
  updateAction: (actionId, action) => ipcRenderer.invoke('actions:update', actionId, action),
  deleteAction: (actionId) => ipcRenderer.invoke('actions:delete', actionId),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Event listeners
  onOBSConnected: (callback) => ipcRenderer.on('obs:connected', callback),
  onOBSDisconnected: (callback) => ipcRenderer.on('obs:disconnected', callback),
  onOBSStatus: (callback) => ipcRenderer.on('obs:status', callback),

  onTwitchConnected: (callback) => ipcRenderer.on('twitch:connected', callback),
  onTwitchDisconnected: (callback) => ipcRenderer.on('twitch:disconnected', callback),
  onTwitchMessage: (callback) => ipcRenderer.on('twitch:message', callback),
  onTwitchCommand: (callback) => ipcRenderer.on('twitch:command', callback),

  onActionTriggered: (callback) => ipcRenderer.on('action:triggered', callback),
  onLogMessage: (callback) => ipcRenderer.on('log:message', callback),

  // Remove all listeners (cleanup)
  removeAllListeners: (event) => ipcRenderer.removeAllListeners(event)
});
