const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;

class TwitchAPIClient {
    constructor() {
        this.clientId = process.env.TWITCH_CLIENT_ID || 'your_client_id_here';
        this.clientSecret = process.env.TWITCH_CLIENT_SECRET || 'your_client_secret_here';
        this.redirectUri = 'http://localhost:3000/auth/twitch/callback';
        this.tokens = null;
        this.authWindow = null;
        this.authServer = null;
        this.authResolve = null;
        this.authReject = null;
        this.authTimeout = null;
        this.channelPointPolling = null;
        this.lastRedeemId = null;
        this.eventSubSubscriptions = new Map();
        this.eventSubWebSocket = null;
        this.keepaliveInterval = null;
    }

    /**
     * Initialize OAuth flow by opening system browser and starting local server
     */
    async authenticate() {
        const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
            `client_id=${this.clientId}&` +
            `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
            `response_type=code&` +
            `scope=${encodeURIComponent('channel:read:redemptions channel:manage:redemptions')}`;

        return new Promise(async (resolve, reject) => {
            try {
                // Start local server for OAuth callback
                await this.startAuthServer();

                // Open OAuth URL in system default browser
                const { shell } = require('electron');
                await shell.openExternal(authUrl);

                // Store resolve/reject for server callback
                this.authResolve = resolve;
                this.authReject = reject;

                // Set a timeout for authentication (5 minutes)
                this.authTimeout = setTimeout(() => {
                    this.stopAuthServer();
                    reject(new Error('Authentication timed out'));
                }, 5 * 60 * 1000);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Start local Express server for OAuth callback
     */
    async startAuthServer() {
        if (this.authServer) {
            this.stopAuthServer();
        }

        const app = express();
        this.authServer = app.listen(3000, 'localhost', () => {
            console.log('OAuth callback server listening on localhost:3000');
        });

        // Handle OAuth callback
        app.get('/auth/twitch/callback', async (req, res) => {
            try {
                const { code, error, error_description } = req.query;

                if (error) {
                    console.error('OAuth error:', error, error_description);
                    res.send(`
                        <html>
                        <body>
                        <h2>Authentication Failed</h2>
                        <p>Error: ${error}</p>
                        <p>Description: ${error_description}</p>
                        <p>You can close this window.</p>
                        </body>
                        </html>
                    `);
                    this.authReject(new Error(`OAuth error: ${error} - ${error_description}`));
                    this.stopAuthServer();
                    return;
                }

                if (!code) {
                    res.send(`
                        <html>
                        <body>
                        <h2>Authentication Failed</h2>
                        <p>No authorization code received.</p>
                        <p>You can close this window.</p>
                        </body>
                        </html>
                    `);
                    this.authReject(new Error('No authorization code received'));
                    this.stopAuthServer();
                    return;
                }

                // Show success page
                res.send(`
                    <html>
                    <body>
                    <h2>Authentication Successful!</h2>
                    <p>Authorization code received. You can close this window.</p>
                    <script>
                        setTimeout(() => {
                            window.close();
                        }, 2000);
                    </script>
                    </body>
                    </html>
                `);

                // Process the authorization code
                const tokens = await this.handleCallback(`http://localhost:3000/auth/twitch/callback?code=${code}`);
                this.resolveAuthentication(tokens);
                this.stopAuthServer();

            } catch (error) {
                console.error('Callback processing error:', error);
                res.send(`
                    <html>
                    <body>
                    <h2>Authentication Failed</h2>
                    <p>Error processing authorization: ${error.message}</p>
                    <p>You can close this window.</p>
                    </body>
                    </html>
                `);
                this.authReject(error);
                this.stopAuthServer();
            }
        });


    }

    /**
     * Stop the local auth server
     */
    stopAuthServer() {
        if (this.authServer) {
            this.authServer.close();
            this.authServer = null;
            console.log('OAuth callback server stopped');
        }
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
    }

    /**
     * Resolve authentication promise (called by protocol handler)
     */
    resolveAuthentication(tokens) {
        if (this.authResolve) {
            this.authResolve(tokens);
            this.authResolve = null;
            this.authReject = null;
        }
    }

    /**
     * Handle OAuth callback and exchange code for tokens
     */
    async handleCallback(callbackUrl) {
        try {
            const url = new URL(callbackUrl);
            const code = url.searchParams.get('code');

            if (!code) {
                throw new Error('No authorization code received');
            }

            // Exchange code for tokens
            const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code: code,
                    grant_type: 'authorization_code',
                    redirect_uri: this.redirectUri
                }
            });

            this.tokens = {
                access_token: tokenResponse.data.access_token,
                refresh_token: tokenResponse.data.refresh_token,
                expires_at: Date.now() + (tokenResponse.data.expires_in * 1000)
            };

            // Get user info
            const userResponse = await this.apiCall('https://api.twitch.tv/helix/users');
            this.tokens.user = userResponse.data.data[0];

            // Save tokens to disk
            await this.saveTokensToFile();

            // Close auth window
            if (this.authWindow) {
                this.authWindow.close();
                this.authWindow = null;
            }

            return this.tokens;
        } catch (error) {
            console.error('OAuth callback error:', error);
            throw error;
        }
    }

    /**
     * Make authenticated API call
     */
    async apiCall(url, options = {}) {
        if (!this.tokens) {
            throw new Error('Not authenticated');
        }

        // Check if token needs refresh
        if (Date.now() >= this.tokens.expires_at) {
            await this.refreshToken();
        }

        const config = {
            headers: {
                'Authorization': `Bearer ${this.tokens.access_token}`,
                'Client-Id': this.clientId
            },
            ...options
        };

        const response = await axios(url, config);
        return response;
    }

    /**
     * Refresh access token
     */
    async refreshToken() {
        if (!this.tokens || !this.tokens.refresh_token) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: this.tokens.refresh_token
                }
            });

            this.tokens.access_token = response.data.access_token;
            this.tokens.refresh_token = response.data.refresh_token;
            this.tokens.expires_at = Date.now() + (response.data.expires_in * 1000);

            return this.tokens;
        } catch (error) {
            console.error('Token refresh error:', error);
            // Clear tokens on refresh failure
            this.tokens = null;
            throw error;
        }
    }

    /**
     * Get broadcaster ID from username
     */
    async getBroadcasterId(username) {
        const response = await this.apiCall(`https://api.twitch.tv/helix/users?login=${username}`);
        return response.data.data[0]?.id;
    }

    /**
     * Subscribe to channel point redemptions (legacy method - now uses WebSocket EventSub)
     */
    async subscribeToChannelPoints(broadcasterId) {
        console.log(`Subscribing to channel points for broadcaster ${broadcasterId} via WebSocket EventSub`);
        return {
            broadcaster_id: broadcasterId,
            type: 'channel.channel_points_custom_reward_redemption.add'
        };
    }

    /**
     * Get custom rewards (channel point rewards)
     */
    async getCustomRewards(broadcasterId) {
        const response = await this.apiCall(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`);
        return response.data.data;
    }

    /**
     * Get app access token (client credentials flow)
     */
    async getAppAccessToken() {
        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'client_credentials',
                    scope: 'channel:read:redemptions'
                }
            });

            return {
                access_token: response.data.access_token,
                expires_at: Date.now() + (response.data.expires_in * 1000)
            };
        } catch (error) {
            console.error('Failed to get app access token:', error);
            throw error;
        }
    }

    /**
     * Make API call with app access token
     */
    async apiCallWithAppToken(url, options = {}) {
        // Get or refresh app token
        if (!this.appToken || Date.now() >= this.appToken.expires_at) {
            this.appToken = await this.getAppAccessToken();
        }

        const config = {
            headers: {
                'Authorization': `Bearer ${this.appToken.access_token}`,
                'Client-Id': this.clientId
            },
            ...options
        };

        const response = await axios(url, config);
        return response;
    }

    /**
     * Check if authenticated
     */
    isAuthenticated() {
        return this.tokens && this.tokens.access_token && Date.now() < this.tokens.expires_at;
    }

    /**
     * Get current user info
     */
    getUser() {
        return this.tokens?.user;
    }

    /**
     * Logout and clear tokens
     */
    logout() {
        this.tokens = null;
        if (this.authWindow) {
            this.authWindow.close();
            this.authWindow = null;
        }
        this.stopAuthServer();
    }

    /**
     * Save tokens to file
     */
    async saveTokensToFile() {
        const tokenFile = path.join(__dirname, '..', '..', 'data', 'twitch-tokens.json');
        if (this.tokens) {
            await fs.mkdir(path.dirname(tokenFile), { recursive: true });
            await fs.writeFile(tokenFile, JSON.stringify(this.tokens, null, 2));
            console.log('Twitch tokens saved to file');
        }
    }

    /**
     * Load tokens from file
     */
    async loadTokens(filepath) {
        try {
            const data = await fs.readFile(filepath, 'utf8');
            this.tokens = JSON.parse(data);
            return true;
        } catch (error) {
            return false;
        }
    }



    /**
     * Trigger actions for a specific redeem
     */
    async triggerRedeemActions(redeem) {
        if (global.mainWindow) {
            global.mainWindow.webContents.send('channel_point_redeem', {
                id: redeem.id,
                rewardId: redeem.reward.id,
                rewardTitle: redeem.reward.title,
                userName: redeem.user_name,
                userId: redeem.user.id,
                userInput: redeem.user_input,
                redeemedAt: redeem.redeemed_at
            });
        }
    }

    /**
     * Trigger "any reward" actions for a redeem
     */
    async triggerAnyRewardActions(redeem) {
        // Same as triggerRedeemActions but marks it as "any reward" trigger
        if (global.mainWindow) {
            global.mainWindow.webContents.send('channel_point_redeem', {
                id: redeem.id,
                rewardId: redeem.reward.id,
                rewardTitle: redeem.reward.title,
                userName: redeem.user_name,
                userId: redeem.user.id,
                userInput: redeem.user_input,
                redeemedAt: redeem.redeemed_at,
                anyReward: true // Flag to indicate this should trigger "any reward" actions
            });
        }
    }

    /**
     * Connect to EventSub WebSocket
     */
    connectEventSubWebSocket() {
        if (this.eventSubWebSocket) {
            this.eventSubWebSocket.close();
        }

        console.log('Connecting to Twitch EventSub WebSocket...');
        this.eventSubWebSocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

        this.eventSubWebSocket.onopen = () => {
            console.log('EventSub WebSocket connected');
        };

        this.eventSubWebSocket.onmessage = (event) => {
            this.handleEventSubWebSocketMessage(event.data);
        };

        this.eventSubWebSocket.onclose = (event) => {
            console.log('EventSub WebSocket closed:', event.code, event.reason);
            this.eventSubWebSocket = null;

            // Clear keepalive interval
            if (this.keepaliveInterval) {
                clearInterval(this.keepaliveInterval);
                this.keepaliveInterval = null;
            }
        };

        this.eventSubWebSocket.onerror = (error) => {
            console.error('EventSub WebSocket error:', error);
        };
    }

    /**
     * Handle EventSub WebSocket messages
     */
    handleEventSubWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);

            switch (message.metadata.message_type) {
                case 'session_welcome':
                    this.handleSessionWelcome(message.payload.session);
                    break;

                case 'session_keepalive':
                    // Keepalive - no action needed
                    break;

                case 'notification':
                    this.handleEventSubNotification(message.payload);
                    break;

                case 'session_reconnect':
                    console.log('EventSub session reconnect requested');
                    this.connectEventSubWebSocket();
                    break;

                default:
                    console.log('Unhandled EventSub message type:', message.metadata.message_type);
            }
        } catch (error) {
            console.error('Error parsing EventSub message:', error);
        }
    }

    /**
     * Handle session welcome message
     */
    handleSessionWelcome(session) {
        console.log('EventSub session established:', session.id);
        this.eventSubSessionId = session.id;

        // Start keepalive
        this.keepaliveInterval = setInterval(() => {
            // Keepalive is handled automatically by the WebSocket ping/pong
        }, 30000);

        // Subscribe to channel point redemptions
        this.subscribeToChannelPointRedemptions(session.id);
    }

    /**
     * Subscribe to channel point redemptions via WebSocket
     */
    async subscribeToChannelPointRedemptions(sessionId) {
        if (!this.isAuthenticated() || !this.tokens.user) {
            console.log('Cannot subscribe to EventSub - not authenticated');
            return;
        }

        try {
            const subscriptionData = {
                type: 'channel.channel_points_custom_reward_redemption.add',
                version: '1',
                condition: {
                    broadcaster_user_id: this.tokens.user.id
                },
                transport: {
                    method: 'websocket',
                    session_id: sessionId
                }
            };

            const response = await this.apiCall(
                'https://api.twitch.tv/helix/eventsub/subscriptions',
                {
                    method: 'POST',
                    data: subscriptionData
                }
            );

            const subscription = response.data.data[0];
            this.eventSubSubscriptions.set(subscription.id, subscription);

            console.log('Successfully subscribed to channel point redemptions via WebSocket');

        } catch (error) {
            console.error('Failed to subscribe to EventSub via WebSocket:', error);
        }
    }

    /**
     * Handle EventSub notification
     */
    handleEventSubNotification(notification) {
        const { subscription, event } = notification;

        switch (subscription.type) {
            case 'channel.channel_points_custom_reward_redemption.add':
                this.handleChannelPointRedemption(event);
                break;
            default:
                console.log('Unhandled EventSub notification type:', subscription.type);
        }
    }

    /**
     * Handle channel point redemption event
     */
    handleChannelPointRedemption(event) {
        console.log('Channel point redeemed via EventSub:', event.reward.title, 'by', event.user_name);

        // Trigger actions for this redemption
        if (global.mainWindow) {
            global.mainWindow.webContents.send('channel_point_redeem', {
                id: event.id,
                rewardId: event.reward.id,
                rewardTitle: event.reward.title,
                userName: event.user_name,
                userId: event.user_id,
                userInput: event.user_input,
                redeemedAt: event.redeemed_at
            });
        }
    }

    /**
     * Start EventSub system (when authenticated)
     */
    async startEventSub() {
        if (!this.isAuthenticated() || !this.tokens.user) {
            console.log('Cannot start EventSub - not authenticated');
            return;
        }

        console.log('Starting EventSub WebSocket connection...');
        this.connectEventSubWebSocket();
    }

    /**
     * Stop EventSub system
     */
    async stopEventSub() {
        // Close WebSocket connection
        if (this.eventSubWebSocket) {
            this.eventSubWebSocket.close();
            this.eventSubWebSocket = null;
        }

        // Clear keepalive interval
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
        }

        // Unsubscribe from all subscriptions
        for (const [subscriptionId] of this.eventSubSubscriptions) {
            try {
                await this.apiCallWithAppToken(
                    `https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`,
                    { method: 'DELETE' }
                );
            } catch (error) {
                console.error('Error unsubscribing from EventSub:', error);
            }
        }

        this.eventSubSubscriptions.clear();
    }
}

module.exports = TwitchAPIClient;
