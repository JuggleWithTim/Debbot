const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Load environment variables
require('dotenv').config();

// Import our custom modules
const OBSClient = require('./src/obs/obs-client');
const TwitchClient = require('./src/twitch/twitch-client');
const ActionManager = require('./src/actions/action-manager');

// Keep a global reference of the window object and services
let mainWindow;
let obsClient;
let twitchClient;
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
function initializeServices() {
  // Make mainWindow available globally for services
  global.mainWindow = mainWindow;

  // Initialize OBS client
  obsClient = new OBSClient();
  global.obsClient = obsClient;

  // Initialize Twitch client
  twitchClient = new TwitchClient();
  global.twitchClient = twitchClient;

  // Initialize action manager
  actionManager = new ActionManager();
  global.actionManager = actionManager;

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
      await obsClient.disconnect();
      mainWindow.webContents.send('obs:disconnected');
      return { success: true };
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

// IPC handlers will be added here as we implement features
console.log('Debbot Electron app started');
