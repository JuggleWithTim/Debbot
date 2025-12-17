const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ActionManager {
    constructor() {
        this.actions = [];
        this.actionsFile = path.join(__dirname, '..', '..', 'data', 'actions.json');
        this.settingsFile = path.join(__dirname, '..', '..', 'data', 'settings.json');

        // Ensure data directory exists
        this.ensureDataDirectory();
    }

    async ensureDataDirectory() {
        const dataDir = path.dirname(this.actionsFile);
        try {
            await fs.access(dataDir);
        } catch {
            await fs.mkdir(dataDir, { recursive: true });
        }
    }

    // Actions CRUD operations
    async loadActions() {
        try {
            const data = await fs.readFile(this.actionsFile, 'utf8');
            this.actions = JSON.parse(data);
            console.log(`Loaded ${this.actions.length} actions`);
            return this.actions;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, return empty array
                console.log('Actions file not found, starting with empty actions');
                this.actions = [];
                return [];
            }
            console.error('Error loading actions:', error);
            throw error;
        }
    }

    async saveActions(actions = null) {
        if (actions !== null) {
            this.actions = actions;
        }

        try {
            await this.ensureDataDirectory();
            await fs.writeFile(this.actionsFile, JSON.stringify(this.actions, null, 2));
            console.log(`Saved ${this.actions.length} actions`);
            return true;
        } catch (error) {
            console.error('Error saving actions:', error);
            throw error;
        }
    }

    async createAction(action) {
        // Ensure action has an ID
        if (!action.id) {
            action.id = uuidv4();
        }

        // Ensure action has required fields
        action.name = action.name || 'Unnamed Action';
        action.trigger = action.trigger || 'command';
        action.steps = action.steps || [];

        this.actions.push(action);
        await this.saveActions();
        console.log('Created action:', action.name);
        return action;
    }

    async updateAction(actionId, updatedAction) {
        const index = this.actions.findIndex(a => a.id === actionId);
        if (index === -1) {
            throw new Error(`Action with ID ${actionId} not found`);
        }

        // Preserve the ID
        updatedAction.id = actionId;

        this.actions[index] = updatedAction;
        await this.saveActions();
        console.log('Updated action:', updatedAction.name);
        return updatedAction;
    }

    async deleteAction(actionId) {
        const index = this.actions.findIndex(a => a.id === actionId);
        if (index === -1) {
            throw new Error(`Action with ID ${actionId} not found`);
        }

        const deletedAction = this.actions.splice(index, 1)[0];
        await this.saveActions();
        console.log('Deleted action:', deletedAction.name);
        return deletedAction;
    }

    getActions() {
        return this.actions;
    }

    getActionById(actionId) {
        return this.actions.find(a => a.id === actionId);
    }

    getActionsByTrigger(trigger) {
        return this.actions.filter(a => a.trigger === trigger);
    }

    getActionsByCommand(command) {
        return this.actions.filter(a => {
            if (a.trigger !== 'command') return false;

            // Normalize command comparison by removing ! prefix
            const normalizedStoredCommand = a.command.startsWith('!') ? a.command.substring(1) : a.command;
            const normalizedInputCommand = command.startsWith('!') ? command.substring(1) : command;

            return normalizedStoredCommand === normalizedInputCommand;
        });
    }

    // Action execution
    async executeAction(actionId, context = {}) {
        const action = this.getActionById(actionId);
        if (!action) {
            throw new Error(`Action ${actionId} not found`);
        }

        console.log(`Executing action: ${action.name}`);

        try {
            for (const step of action.steps) {
                await this.executeStep(step, context);
            }

            // Emit success event
            if (global.mainWindow) {
                global.mainWindow.webContents.send('action:triggered', action);
            }

            console.log(`Action ${action.name} executed successfully`);
            return true;
        } catch (error) {
            console.error(`Error executing action ${action.name}:`, error);

            // Log error
            if (global.mainWindow) {
                global.mainWindow.webContents.send('log:message', {
                    level: 'error',
                    message: `Action "${action.name}" failed: ${error.message}`
                });
            }

            throw error;
        }
    }

    async executeStep(step, context = {}) {
        const { type, value } = step;

        console.log(`Executing step: ${type} - ${value}`);

        switch (type) {
            case 'obs_scene':
                await this.executeOBSSceneStep(value);
                break;

            case 'obs_source':
                await this.executeOBSSourceStep(value);
                break;

            case 'obs_start_streaming':
                await this.executeOBSStartStreamingStep();
                break;

            case 'obs_stop_streaming':
                await this.executeOBSStopStreamingStep();
                break;

            case 'twitch_message':
                await this.executeTwitchMessageStep(value);
                break;

            case 'play_sound':
                await this.executePlaySoundStep(value);
                break;

            case 'delay':
                await this.executeDelayStep(value);
                break;

            default:
                console.warn(`Unknown step type: ${type}`);
        }
    }

    async executeOBSSceneStep(sceneName) {
        if (!global.obsClient || !global.obsClient.isConnected()) {
            throw new Error('OBS not connected');
        }

        await global.obsClient.switchScene(sceneName);

        // Log the action
        if (global.mainWindow) {
            global.mainWindow.webContents.send('log:message', {
                level: 'success',
                message: `Switched OBS to scene: ${sceneName}`
            });
        }
    }

    async executeOBSSourceStep(sourceName) {
        if (!global.obsClient || !global.obsClient.isConnected()) {
            throw new Error('OBS not connected');
        }

        await global.obsClient.toggleSource(sourceName);

        // Log the action
        if (global.mainWindow) {
            global.mainWindow.webContents.send('log:message', {
                level: 'success',
                message: `Toggled OBS source: ${sourceName}`
            });
        }
    }

    async executeOBSStartStreamingStep() {
        if (!global.obsClient || !global.obsClient.isConnected()) {
            throw new Error('OBS not connected');
        }

        await global.obsClient.startStreaming();

        // Log the action
        if (global.mainWindow) {
            global.mainWindow.webContents.send('log:message', {
                level: 'success',
                message: 'Started OBS streaming'
            });
        }
    }

    async executeOBSStopStreamingStep() {
        if (!global.obsClient || !global.obsClient.isConnected()) {
            throw new Error('OBS not connected');
        }

        await global.obsClient.stopStreaming();

        // Log the action
        if (global.mainWindow) {
            global.mainWindow.webContents.send('log:message', {
                level: 'success',
                message: 'Stopped OBS streaming'
            });
        }
    }

    async executeTwitchMessageStep(message) {
        if (!global.twitchClient || !global.twitchClient.isConnected()) {
            throw new Error('Twitch not connected');
        }

        await global.twitchClient.sendMessage(message);

        // Log the action
        if (global.mainWindow) {
            global.mainWindow.webContents.send('log:message', {
                level: 'success',
                message: `Sent Twitch message: ${message}`
            });
        }
    }

    async executePlaySoundStep(soundPath) {
        if (!soundPath || soundPath.trim() === '') {
            throw new Error('No sound file path specified');
        }

        // Send message to renderer process to play the sound
        if (global.mainWindow) {
            global.mainWindow.webContents.send('play-sound', soundPath);

            // Log the action
            global.mainWindow.webContents.send('log:message', {
                level: 'success',
                message: `Playing sound: ${soundPath}`
            });
        } else {
            throw new Error('Main window not available for sound playback');
        }
    }

    async executeDelayStep(delayMs) {
        const delay = parseInt(delayMs);
        if (isNaN(delay) || delay < 0) {
            throw new Error(`Invalid delay value: ${delayMs}`);
        }

        console.log(`Delaying for ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Trigger handling
    async handleCommandTrigger(commandData) {
        const { command, isBroadcaster, isMod } = commandData;

        const actions = this.getActionsByCommand(command);
        if (actions.length === 0) {
            return;
        }

        // Execute all matching actions that the user has permission for
        for (const action of actions) {
            try {
                // Check permissions
                if (!this.checkUserPermissions(action, isBroadcaster, isMod)) {
                    console.log(`User does not have permission to execute action: ${action.name}`);
                    continue;
                }

                await this.executeAction(action.id, commandData);
            } catch (error) {
                console.error(`Failed to execute action ${action.name}:`, error);
            }
        }
    }

    checkUserPermissions(action, isBroadcaster, isMod) {
        // If no permissions specified, allow all
        if (!action.permissions) {
            return true;
        }

        // Check user role permissions
        if (isBroadcaster && action.permissions.broadcaster) {
            return true;
        }

        if (isMod && action.permissions.moderator) {
            return true;
        }

        if (!isBroadcaster && !isMod && action.permissions.viewer) {
            return true;
        }

        return false;
    }

    // Settings management
    async loadSettings() {
        let savedSettings = {};
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            savedSettings = JSON.parse(data);
            console.log('Settings loaded from file');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('Settings file not found, using defaults');
            } else {
                console.error('Error loading settings:', error);
            }
        }

        // Always get defaults from environment variables
        const defaultSettings = this.getDefaultSettings();

        // Merge saved settings with environment defaults
        // Environment variables take priority for sensitive data
        const mergedSettings = {
            ...savedSettings,
            obs: {
                ...defaultSettings.obs,
                ...savedSettings.obs
            },
            twitch: {
                ...defaultSettings.twitch,
                ...savedSettings.twitch
            }
        };



        return mergedSettings;
    }

    async saveSettings(settings) {
        try {
            // Save sensitive settings to .env file
            await this.saveToEnvFile(settings);

            // Save non-sensitive preferences to settings.json
            const preferences = {
                app: settings.app || { theme: 'dark', autoConnect: true }
            };
            await this.ensureDataDirectory();
            await fs.writeFile(this.settingsFile, JSON.stringify(preferences, null, 2));

            console.log('Settings saved to .env and preferences saved');
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            throw error;
        }
    }

    async saveToEnvFile(settings) {
        try {
            // Read current .env file
            let envContent = '';
            try {
                envContent = await fs.readFile('.env', 'utf8');
            } catch (error) {
                // If .env doesn't exist, use example as template
                envContent = await fs.readFile('.env.example', 'utf8');
            }

            // Parse current .env content into key-value pairs
            const envLines = envContent.split('\n');
            const envVars = {};

            for (const line of envLines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const [key, ...valueParts] = trimmedLine.split('=');
                    if (key) {
                        envVars[key.trim()] = valueParts.join('=').trim();
                    }
                }
            }

            // Update with new settings
            if (settings.obs) {
                envVars.OBS_HOST = settings.obs.host || 'localhost';
                envVars.OBS_PORT = settings.obs.port?.toString() || '4455';
                envVars.OBS_PASSWORD = settings.obs.password || '';
            }

            if (settings.twitch) {
                envVars.TWITCH_USERNAME = settings.twitch.username || '';
                envVars.TWITCH_OAUTH_TOKEN = settings.twitch.oauth || '';
                envVars.TWITCH_CHANNEL = settings.twitch.channel || '';
            }

            // Generate new .env content
            const newEnvContent = `# OBS WebSocket Settings
OBS_HOST=${envVars.OBS_HOST}
OBS_PORT=${envVars.OBS_PORT}
OBS_PASSWORD=${envVars.OBS_PASSWORD}

# Twitch IRC Settings
TWITCH_USERNAME=${envVars.TWITCH_USERNAME}
TWITCH_OAUTH_TOKEN=${envVars.TWITCH_OAUTH_TOKEN}
TWITCH_CHANNEL=${envVars.TWITCH_CHANNEL}
`;

            // Write back to .env file
            await fs.writeFile('.env', newEnvContent);

            console.log('Environment variables saved to .env file');
            return true;
        } catch (error) {
            console.error('Error saving to .env file:', error);
            throw error;
        }
    }

    getDefaultSettings() {
        return {
            obs: {
                host: process.env.OBS_HOST || 'localhost',
                port: parseInt(process.env.OBS_PORT) || 4455,
                password: process.env.OBS_PASSWORD || ''
            },
            twitch: {
                username: process.env.TWITCH_USERNAME || '',
                oauth: process.env.TWITCH_OAUTH_TOKEN || '',
                channel: process.env.TWITCH_CHANNEL || ''
            }
        };
    }

    // Utility methods
    validateAction(action) {
        const errors = [];

        if (!action.name || typeof action.name !== 'string') {
            errors.push('Action must have a valid name');
        }

        if (!['command', 'timer'].includes(action.trigger)) {
            errors.push('Action must have a valid trigger type');
        }

        if (action.trigger === 'command' && (!action.command || typeof action.command !== 'string')) {
            errors.push('Command-triggered actions must have a command');
        }

        if (!Array.isArray(action.steps)) {
            errors.push('Action steps must be an array');
        } else {
            action.steps.forEach((step, index) => {
                if (!step.type) {
                    errors.push(`Step ${index + 1} is missing type`);
                } else if (!step.value && !['obs_start_streaming', 'obs_stop_streaming'].includes(step.type)) {
                    errors.push(`Step ${index + 1} is missing value`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = ActionManager;
