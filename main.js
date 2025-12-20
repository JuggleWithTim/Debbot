const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Load environment variables
require('dotenv').config();

// Import our custom modules
const OBSClient = require('./src/obs/obs-client');
const TwitchClient = require('./src/twitch/twitch-client');
const TwitchAPIClient = require('./src/twitch/twitch-api-client');
const MIDIClient = require('./src/midi/midi-client');
const ActionManager = require('./src/actions/action-manager');

// Keep a global reference of the window object and services
let mainWindow;
let obsClient;
let twitchClient;
let twitchAPIClient;
let midiClient;
let actionManager;

// Create the main application window
function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'), // Optional icon
    show: false, // Don't show until ready
    // Disable sandbox for Linux compatibility (remove in production)
    sandbox: false
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize services
async function initializeServices() {
  // Make mainWindow available globally for services
  global.mainWindow = mainWindow;

  // Initialize action manager first (needed for settings)
  actionManager = new ActionManager();
  global.actionManager = actionManager;

  // Load settings
  const settings = await actionManager.loadSettings();
  global.settings = settings;
  console.log('Settings loaded:', settings);

  // Initialize OBS client
  obsClient = new OBSClient();
  global.obsClient = obsClient;

  // Initialize Twitch client
  twitchClient = new TwitchClient();
  global.twitchClient = twitchClient;

  // Initialize Twitch API client
  twitchAPIClient = new TwitchAPIClient();
  global.twitchAPIClient = twitchAPIClient;

  // Load saved tokens
  const tokensLoaded = await twitchAPIClient.loadTokens(path.join(__dirname, 'data', 'twitch-tokens.json'));

  // Start EventSub if tokens were loaded
  if (tokensLoaded && twitchAPIClient.isAuthenticated()) {
    twitchAPIClient.startEventSub();
  }

  // Initialize MIDI client
  midiClient = new MIDIClient();
  global.midiClient = midiClient;

  console.log('Services initialized');
}

// Set up IPC handlers
function setupIPCHandlers() {
  // OBS handlers
  ipcMain.handle('obs:connect', async (event, config) => {
    try {
      await obsClient.connect(config);
      mainWindow.webContents.send('obs:connected');
      return { success: true };
    } catch (error) {
      mainWindow.webContents.send('log:message', {
        level: 'error',
        message: `OBS connection failed: ${error.message}`
      });
      throw error;
    }
  });

  ipcMain.handle('obs:disconnect', async () => {
    try {
      // Stop any ongoing reconnection attempts
      obsClient.stopReconnection();
      await obsClient.disconnect();
      mainWindow.webContents.send('obs:disconnected');
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('obs:setAutoReconnect', async (event, enabled) => {
    try {
      obsClient.setAutoReconnect(enabled);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('obs:getReconnectionStatus', async () => {
    try {
      return obsClient.getReconnectionStatus();
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('obs:getScenes', async () => {
    try {
      const scenes = await obsClient.refreshScenes();
      return scenes;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('obs:switchScene', async (event, sceneName) => {
    try {
      await obsClient.switchScene(sceneName);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('obs:getSources', async () => {
    try {
      const sources = await obsClient.refreshSources();
      return sources;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('obs:toggleSource', async (event, sourceName, visible) => {
    try {
      await obsClient.toggleSource(sourceName, visible);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Twitch handlers
  ipcMain.handle('twitch:connect', async (event, config) => {
    try {
      await twitchClient.connect(config);
      mainWindow.webContents.send('twitch:connected');
      return { success: true };
    } catch (error) {
      mainWindow.webContents.send('log:message', {
        level: 'error',
        message: `Twitch connection failed: ${error.message}`
      });
      throw error;
    }
  });

  ipcMain.handle('twitch:disconnect', async () => {
    try {
      await twitchClient.disconnect();
      mainWindow.webContents.send('twitch:disconnected');
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('twitch:sendMessage', async (event, message) => {
    try {
      await twitchClient.sendMessage(message);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Twitch API handlers
  ipcMain.handle('twitchapi:authenticate', async () => {
    try {
      const tokens = await twitchAPIClient.authenticate();
      // Start EventSub system (falls back to polling for development)
      twitchAPIClient.startEventSub();
      mainWindow.webContents.send('twitchapi:authenticated', { user: tokens.user });
      return { success: true, user: tokens.user };
    } catch (error) {
      mainWindow.webContents.send('log:message', {
        level: 'error',
        message: `Twitch API authentication failed: ${error.message}`
      });
      throw error;
    }
  });

  ipcMain.handle('twitchapi:logout', async () => {
    try {
      // Stop EventSub system
      await twitchAPIClient.stopEventSub();
      twitchAPIClient.logout();
      mainWindow.webContents.send('twitchapi:loggedout');
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('twitchapi:getStatus', async () => {
    try {
      const isAuthenticated = twitchAPIClient.isAuthenticated();
      const user = isAuthenticated ? twitchAPIClient.getUser() : null;
      return { authenticated: isAuthenticated, user };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('twitchapi:getCustomRewards', async (event, broadcasterId) => {
    try {
      const rewards = await twitchAPIClient.getCustomRewards(broadcasterId);
      return rewards;
    } catch (error) {
      throw error;
    }
  });

  // Action handlers
  ipcMain.handle('actions:load', async () => {
    try {
      return await actionManager.loadActions();
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('actions:save', async (event, actions) => {
    try {
      await actionManager.saveActions(actions);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('actions:create', async (event, action) => {
    try {
      const createdAction = await actionManager.createAction(action);
      return createdAction;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('actions:update', async (event, actionId, action) => {
    try {
      const updatedAction = await actionManager.updateAction(actionId, action);
      return updatedAction;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('actions:delete', async (event, actionId) => {
    try {
      await actionManager.deleteAction(actionId);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('actions:test', async (event, actionId) => {
    try {
      await actionManager.executeAction(actionId, { test: true });
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('actions:triggerChannelPoint', async (event, channelPointData) => {
    try {
      await actionManager.handleChannelPointTrigger(channelPointData);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('actions:triggerCheer', async (event, cheerData) => {
    try {
      await actionManager.handleCheerTrigger(cheerData);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('actions:triggerSubscriber', async (event, subscriberData) => {
    try {
      await actionManager.handleSubscriberTrigger(subscriberData);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // MIDI handlers
  ipcMain.handle('midi:connect', async (event, deviceName) => {
    try {
      await midiClient.connect(deviceName);
      mainWindow.webContents.send('midi:connected', { device: midiClient.getConnectedDevice() });
      return { success: true };
    } catch (error) {
      mainWindow.webContents.send('log:message', {
        level: 'error',
        message: `MIDI connection failed: ${error.message}`
      });
      throw error;
    }
  });

  ipcMain.handle('midi:disconnect', async () => {
    try {
      await midiClient.disconnect();
      mainWindow.webContents.send('midi:disconnected');
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('midi:getDevices', async () => {
    try {
      const devices = midiClient.refreshDevices();
      return devices;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('midi:getStatus', async () => {
    try {
      return midiClient.getStatus();
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('midi:startDetection', async (event) => {
    try {
      midiClient.startDetection((midiData) => {
        // Send detected MIDI data back to renderer for configuration
        mainWindow.webContents.send('midi:detected', midiData);
      });
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('midi:stopDetection', async () => {
    try {
      midiClient.stopDetection();
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Settings handlers
  ipcMain.handle('settings:load', async () => {
    try {
      return await actionManager.loadSettings();
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('settings:save', async (event, settings) => {
    try {
      await actionManager.saveSettings(settings);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });


}



// App event handlers
app.whenReady().then(() => {
  setupIPCHandlers();
  setupMIDIMessageHandling();
  createWindow();
  initializeServices();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle app security
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    // Prevent new window creation
    event.preventDefault();
  });

  contents.on('will-navigate', (event, navigationUrl) => {
    // Prevent navigation to external URLs
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
});

// Set up MIDI message handling
function setupMIDIMessageHandling() {
  // Set up global MIDI message handler
  global.midiMessageHandler = async (midiData) => {
    try {
      // Handle the MIDI message through the action manager
      await actionManager.handleMIDITrigger(midiData);
    } catch (error) {
      console.error('Error handling MIDI trigger:', error);
    }
  };
}

// IPC handlers will be added here as we implement features
console.log('Debbot Electron app started');
