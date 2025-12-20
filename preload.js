const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // OBS related functions
  connectOBS: (config) => ipcRenderer.invoke('obs:connect', config),
  disconnectOBS: () => ipcRenderer.invoke('obs:disconnect'),
  setAutoReconnect: (enabled) => ipcRenderer.invoke('obs:setAutoReconnect', enabled),
  getReconnectionStatus: () => ipcRenderer.invoke('obs:getReconnectionStatus'),
  getOBSScenes: () => ipcRenderer.invoke('obs:getScenes'),
  switchOBSScene: (sceneName) => ipcRenderer.invoke('obs:switchScene', sceneName),
  getOBSSources: () => ipcRenderer.invoke('obs:getSources'),
  toggleSource: (sourceName, visible) => ipcRenderer.invoke('obs:toggleSource', sourceName, visible),

  // Twitch related functions
  connectTwitch: (config) => ipcRenderer.invoke('twitch:connect', config),
  disconnectTwitch: () => ipcRenderer.invoke('twitch:disconnect'),
  sendTwitchMessage: (message) => ipcRenderer.invoke('twitch:sendMessage', message),

  // Twitch API functions
  authenticateTwitchAPI: () => ipcRenderer.invoke('twitchapi:authenticate'),
  logoutTwitchAPI: () => ipcRenderer.invoke('twitchapi:logout'),
  getTwitchAPIStatus: () => ipcRenderer.invoke('twitchapi:getStatus'),
  getCustomRewards: (broadcasterId) => ipcRenderer.invoke('twitchapi:getCustomRewards', broadcasterId),

  // Action management
  loadActions: () => ipcRenderer.invoke('actions:load'),
  saveActions: (actions) => ipcRenderer.invoke('actions:save', actions),
  createAction: (action) => ipcRenderer.invoke('actions:create', action),
  updateAction: (actionId, action) => ipcRenderer.invoke('actions:update', actionId, action),
  deleteAction: (actionId) => ipcRenderer.invoke('actions:delete', actionId),
  testAction: (actionId) => ipcRenderer.invoke('actions:test', actionId),
  triggerChannelPoint: (channelPointData) => ipcRenderer.invoke('actions:triggerChannelPoint', channelPointData),
  triggerCheer: (cheerData) => ipcRenderer.invoke('actions:triggerCheer', cheerData),
  triggerSubscriber: (subscriberData) => ipcRenderer.invoke('actions:triggerSubscriber', subscriberData),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Event listeners
  onOBSConnected: (callback) => ipcRenderer.on('obs:connected', callback),
  onOBSDisconnected: (callback) => ipcRenderer.on('obs:disconnected', callback),
  onOBSReconnected: (callback) => ipcRenderer.on('obs:reconnected', callback),
  onOBSReconnecting: (callback) => ipcRenderer.on('obs:reconnecting', callback),
  onOBSReconnectionFailed: (callback) => ipcRenderer.on('obs:reconnection_failed', callback),
  onOBSStatus: (callback) => ipcRenderer.on('obs:status', callback),

  onTwitchConnected: (callback) => ipcRenderer.on('twitch:connected', callback),
  onTwitchDisconnected: (callback) => ipcRenderer.on('twitch:disconnected', callback),
  onTwitchMessage: (callback) => ipcRenderer.on('twitch:message', callback),
  onTwitchCommand: (callback) => ipcRenderer.on('twitch:command', callback),

  onTwitchAPIAuthenticated: (callback) => ipcRenderer.on('twitchapi:authenticated', callback),
  onTwitchAPILoggedOut: (callback) => ipcRenderer.on('twitchapi:loggedout', callback),

  onChannelPointRedeem: (callback) => ipcRenderer.on('channel_point_redeem', callback),
  onCheer: (callback) => ipcRenderer.on('cheer', callback),
  onSubscriber: (callback) => ipcRenderer.on('subscriber', callback),

  onActionTriggered: (callback) => ipcRenderer.on('action:triggered', callback),
  onLogMessage: (callback) => ipcRenderer.on('log:message', callback),

  // Sound playback
  onPlaySound: (callback) => ipcRenderer.on('play-sound', callback),

  // MIDI functions
  midiConnect: (deviceName) => ipcRenderer.invoke('midi:connect', deviceName),
  midiDisconnect: () => ipcRenderer.invoke('midi:disconnect'),
  midiGetDevices: () => ipcRenderer.invoke('midi:getDevices'),
  midiGetStatus: () => ipcRenderer.invoke('midi:getStatus'),
  midiStartDetection: () => ipcRenderer.invoke('midi:startDetection'),
  midiStopDetection: () => ipcRenderer.invoke('midi:stopDetection'),

  // MIDI event listeners
  onMIDIConnected: (callback) => ipcRenderer.on('midi:connected', callback),
  onMIDIDisconnected: (callback) => ipcRenderer.on('midi:disconnected', callback),
  onMIDIDetected: (callback) => ipcRenderer.on('midi:detected', callback),

  // Remove all listeners (cleanup)
  removeAllListeners: (event) => ipcRenderer.removeAllListeners(event)
});
