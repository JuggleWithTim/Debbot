const tmi = require('tmi.js');

class TwitchClient {
    constructor() {
        this.client = null;
        this.connected = false;
        this.config = null;
        this.commandHandlers = new Map();
    }

    setupEventListeners() {
        if (!this.client) return;

        this.client.on('connected', (address, port) => {
            console.log(`Twitch IRC connected to ${address}:${port}`);
            this.connected = true;
        });

        this.client.on('disconnected', (reason) => {
            console.log('Twitch IRC disconnected:', reason);
            this.connected = false;
        });

        this.client.on('message', (channel, userstate, message, self) => {
            // Ignore messages from the bot itself
            if (self) return;

            this.handleMessage(channel, userstate, message);
        });

        this.client.on('join', (channel, username, self) => {
            if (self) {
                console.log(`Joined Twitch channel: ${channel}`);
            }
        });

        this.client.on('part', (channel, username, self) => {
            if (self) {
                console.log(`Left Twitch channel: ${channel}`);
            }
        });
    }

    async connect(config) {
        try {
            this.config = config;
            const { username, oauth, channel } = config;

            // Remove 'oauth:' prefix if present
            const cleanOauth = oauth.startsWith('oauth:') ? oauth : `oauth:${oauth}`;

            console.log(`Connecting to Twitch as ${username} in channel ${channel}`);

            this.client = new tmi.Client({
                options: {
                    debug: true,
                    messagesLogLevel: 'info'
                },
                connection: {
                    reconnect: true,
                    secure: true
                },
                identity: {
                    username: username.toLowerCase(),
                    password: cleanOauth
                },
                channels: [channel.startsWith('#') ? channel : `#${channel}`]
            });

            this.setupEventListeners();
            await this.client.connect();

            console.log('Successfully connected to Twitch');
            return true;
        } catch (error) {
            console.error('Failed to connect to Twitch:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.client && this.connected) {
            try {
                await this.client.disconnect();
                this.connected = false;
                console.log('Disconnected from Twitch');
            } catch (error) {
                console.error('Error disconnecting from Twitch:', error);
                throw error;
            }
        }
    }

    isConnected() {
        return this.connected;
    }

    handleMessage(channel, userstate, message) {
        const username = userstate.username;
        const displayName = userstate['display-name'] || username;
        const isMod = userstate.mod || userstate['user-type'] === 'mod';
        const isBroadcaster = userstate.badges && userstate.badges.broadcaster === '1';
        const isVip = userstate.badges && userstate.badges.vip === '1';

        console.log(`[${channel}] ${displayName}: ${message}`);

        // Check if message is a command (starts with !)
        if (message.startsWith('!')) {
            const command = message.split(' ')[0].substring(1).toLowerCase();
            const args = message.substring(message.indexOf(' ') + 1);

            this.handleCommand({
                command,
                args,
                username,
                displayName,
                isMod,
                isBroadcaster,
                isVip,
                channel: channel.replace('#', ''),
                rawMessage: message,
                userstate
            });
        }
    }

    handleCommand(commandData) {
        // Call action manager directly
        if (global.actionManager) {
            global.actionManager.handleCommandTrigger(commandData);
        }
    }

    async sendMessage(message) {
        if (!this.client || !this.connected || !this.config) {
            throw new Error('Not connected to Twitch');
        }

        try {
            const channel = this.config.channel.startsWith('#') ? this.config.channel : `#${this.config.channel}`;
            await this.client.say(channel, message);
            console.log(`Sent message to ${channel}: ${message}`);
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    // Register command handlers (for future use)
    registerCommand(command, handler) {
        this.commandHandlers.set(command.toLowerCase(), handler);
    }

    unregisterCommand(command) {
        this.commandHandlers.delete(command.toLowerCase());
    }

    getRegisteredCommands() {
        return Array.from(this.commandHandlers.keys());
    }

    // Get connection status
    getStatus() {
        return {
            connected: this.connected,
            config: this.config ? {
                username: this.config.username,
                channel: this.config.channel
            } : null
        };
    }
}

module.exports = TwitchClient;
