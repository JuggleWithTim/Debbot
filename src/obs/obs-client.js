const { OBSWebSocket } = require('obs-websocket-js');

class OBSClient {
    constructor() {
        this.obs = new OBSWebSocket();
        this.connected = false;
        this.scenes = [];
        this.sources = [];

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.obs.on('ConnectionOpened', () => {
            console.log('OBS WebSocket connection opened');
        });

        this.obs.on('ConnectionClosed', () => {
            console.log('OBS WebSocket connection closed');
            this.connected = false;
            this.scenes = [];
            this.sources = [];
        });

        this.obs.on('ConnectionError', (error) => {
            console.error('OBS WebSocket connection error:', error);
        });

        // Listen for scene changes
        this.obs.on('SwitchScenes', (data) => {
            console.log('Scene switched to:', data.sceneName);
        });

        // Listen for source visibility changes
        this.obs.on('SourceVisibilityChanged', (data) => {
            console.log('Source visibility changed:', data.sourceName, data.sourceVisible);
        });
    }

    async connect(config) {
        try {
            const { host = 'localhost', port = 4455, password } = config;
            const address = `ws://${host}:${port}`;

            console.log('Connecting to OBS at', address);

            await this.obs.connect(address, password);

            this.connected = true;
            console.log('Successfully connected to OBS');

            // Get initial data
            await this.refreshScenes();
            await this.refreshSources();

            return true;
        } catch (error) {
            console.error('Failed to connect to OBS:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            await this.obs.disconnect();
            this.connected = false;
            console.log('Disconnected from OBS');
        } catch (error) {
            console.error('Error disconnecting from OBS:', error);
            throw error;
        }
    }

    isConnected() {
        return this.connected;
    }

    async refreshScenes() {
        try {
            const { scenes } = await this.obs.call('GetSceneList');
            this.scenes = scenes.map(scene => scene.sceneName);
            console.log('Scenes refreshed:', this.scenes);
            return this.scenes;
        } catch (error) {
            console.error('Error refreshing scenes:', error);
            throw error;
        }
    }

    async refreshSources() {
        try {
            // Get input list instead of sources list for v5 API
            const { inputs } = await this.obs.call('GetInputList');
            this.sources = inputs.map(input => input.inputName);
            console.log('Sources refreshed:', this.sources);
            return this.sources;
        } catch (error) {
            console.error('Error refreshing sources:', error);
            // Don't throw error for sources, as this might not be critical
            this.sources = [];
            return [];
        }
    }

    async switchScene(sceneName) {
        if (!this.connected) {
            throw new Error('Not connected to OBS');
        }

        try {
            await this.obs.call('SetCurrentProgramScene', {
                sceneName: sceneName
            });
            console.log('Switched to scene:', sceneName);
            return true;
        } catch (error) {
            console.error('Error switching scene:', error);
            throw error;
        }
    }

    async toggleSource(sourceName, visible = null) {
        if (!this.connected) {
            throw new Error('Not connected to OBS');
        }

        try {
            const currentScene = await this.getCurrentScene();

            // Get the scene item ID for the source in the current scene
            const { sceneItemId } = await this.obs.call('GetSceneItemId', {
                sceneName: currentScene,
                sourceName: sourceName
            });

            // If visibility is not specified, toggle current state
            if (visible === null) {
                const { sceneItemEnabled } = await this.obs.call('GetSceneItemEnabled', {
                    sceneName: currentScene,
                    sceneItemId: sceneItemId
                });
                visible = !sceneItemEnabled;
            }

            await this.obs.call('SetSceneItemEnabled', {
                sceneName: currentScene,
                sceneItemId: sceneItemId,
                sceneItemEnabled: visible
            });

            console.log(`Source "${sourceName}" set to ${visible ? 'visible' : 'hidden'}`);
            return true;
        } catch (error) {
            console.error('Error toggling source:', error);
            throw error;
        }
    }

    async showSource(sourceName) {
        return this.toggleSource(sourceName, true);
    }

    async hideSource(sourceName) {
        return this.toggleSource(sourceName, false);
    }

    async getCurrentScene() {
        if (!this.connected) {
            throw new Error('Not connected to OBS');
        }

        try {
            const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
            return currentProgramSceneName;
        } catch (error) {
            console.error('Error getting current scene:', error);
            throw error;
        }
    }

    getScenes() {
        return this.scenes;
    }

    getSources() {
        return this.sources;
    }

    // Get OBS status information
    async startStreaming() {
        if (!this.connected) {
            throw new Error('OBS not connected');
        }

        try {
            await this.obs.call('StartStreaming', {});
            console.log('Started OBS streaming');
            return true;
        } catch (error) {
            console.error('Error starting streaming:', error);
            throw error;
        }
    }

    async stopStreaming() {
        if (!this.connected) {
            throw new Error('OBS not connected');
        }

        try {
            await this.obs.call('StopStreaming', {});
            console.log('Stopped OBS streaming');
            return true;
        } catch (error) {
            console.error('Error stopping streaming:', error);
            throw error;
        }
    }

    async getStatus() {
        if (!this.connected) {
            return { connected: false };
        }

        try {
            const currentScene = await this.getCurrentScene();
            const streaming = await this.obs.call('GetStreamingStatus');

            return {
                connected: true,
                currentScene,
                streaming: streaming.outputActive,
                recording: streaming.outputActive, // Note: this is simplified
                replayBuffer: streaming.outputActive
            };
        } catch (error) {
            console.error('Error getting OBS status:', error);
            return { connected: false, error: error.message };
        }
    }
}

module.exports = OBSClient;
