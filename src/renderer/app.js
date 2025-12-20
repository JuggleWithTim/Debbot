// Debbot - Electron app for OBS control and Twitch chat commands
class DebbotApp {
    constructor() {
        this.currentAction = null;
        this.actions = [];
        this.settings = {};
        this.obsConnected = false;
        this.twitchConnected = false;

        this.initializeApp();
        this.setupEventListeners();
        this.loadInitialData();
    }

    initializeApp() {
        console.log('Initializing Debbot app...');

        // Set up tab switching
        this.setupTabs();

        // Set up modal
        this.setupModal();
    }

    setupTabs() {
        const tabs = ['actions', 'settings', 'logs'];
        const tabElements = tabs.map(tab => document.getElementById(`${tab}-tab`));

        tabElements.forEach((tabElement, index) => {
            tabElement.addEventListener('click', () => {
                this.switchTab(tabs[index]);
            });
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Update panels
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}-panel`).classList.add('active');
    }

    setupModal() {
        const modal = document.getElementById('action-modal');
        const closeBtn = document.getElementById('modal-close');
        const cancelBtn = document.getElementById('cancel-action-btn');
        const saveBtn = document.getElementById('save-action-btn');

        closeBtn.addEventListener('click', () => this.closeModal());
        cancelBtn.addEventListener('click', () => this.closeModal());
        saveBtn.addEventListener('click', () => this.saveAction());

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    setupEventListeners() {
        // OBS connection buttons
        document.getElementById('obs-connect-btn').addEventListener('click', () => this.connectOBS());
        document.getElementById('obs-disconnect-btn').addEventListener('click', () => this.disconnectOBS());

        // Twitch connection buttons
        document.getElementById('twitch-connect-btn').addEventListener('click', () => this.connectTwitch());
        document.getElementById('twitch-disconnect-btn').addEventListener('click', () => this.disconnectTwitch());

        // Actions
        document.getElementById('add-action-btn').addEventListener('click', () => this.openActionModal());
        document.getElementById('add-step-btn').addEventListener('click', () => this.addActionStep());

        // Add trigger button
        document.getElementById('add-trigger-btn').addEventListener('click', () => this.addTrigger());

        // Permission checkboxes
        ['perm-viewer', 'perm-moderator', 'perm-broadcaster'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                this.validatePermissions();
            });
        });

        // Logs
        document.getElementById('clear-logs-btn').addEventListener('click', () => this.clearLogs());

        // Settings
        document.getElementById('save-settings-btn').addEventListener('click', () => this.saveSettings());

        // Twitch API
        document.getElementById('twitch-api-login-btn').addEventListener('click', () => this.authenticateTwitchAPI());
        document.getElementById('twitch-api-logout-btn').addEventListener('click', () => this.logoutTwitchAPI());

        // Electron API event listeners
        if (window.electronAPI) {
            window.electronAPI.onOBSConnected(() => this.onOBSConnected());
            window.electronAPI.onOBSDisconnected(() => this.onOBSDisconnected());
            window.electronAPI.onOBSStatus((event, status) => this.onOBSStatus(status));

            window.electronAPI.onTwitchConnected(() => this.onTwitchConnected());
            window.electronAPI.onTwitchDisconnected(() => this.onTwitchDisconnected());
            window.electronAPI.onTwitchMessage((event, message) => this.onTwitchMessage(message));
            window.electronAPI.onTwitchCommand((event, command) => this.onTwitchCommand(command));

            window.electronAPI.onActionTriggered((event, action) => this.onActionTriggered(action));
            window.electronAPI.onLogMessage((event, log) => this.addLogEntry(log));

            window.electronAPI.onTwitchAPIAuthenticated((event, data) => this.onTwitchAPIAuthenticated(data));
            window.electronAPI.onTwitchAPILoggedOut(() => this.onTwitchAPILoggedOut());

            // Listen for channel point redeems
            window.electronAPI.onChannelPointRedeem((event, redeemData) => this.onChannelPointRedeem(redeemData));

            // Listen for cheers
            window.electronAPI.onCheer((event, cheerData) => this.onCheer(cheerData));

            // Listen for subscribers
            window.electronAPI.onSubscriber((event, subscriberData) => this.onSubscriber(subscriberData));
        }

        // IPC event listener for playing sounds
        if (window.electronAPI && window.electronAPI.onPlaySound) {
            window.electronAPI.onPlaySound((event, soundPath) => {
                console.log('Received play-sound IPC event:', soundPath);
                this.playSound(soundPath);
            });
            console.log('IPC event listener for play-sound registered via electronAPI');
        } else {
            console.error('electronAPI.onPlaySound not available');
        }
    }

    async loadInitialData() {
        try {
            // Load settings
            this.settings = await window.electronAPI.loadSettings() || {};
            this.populateSettings();

            // Check Twitch API status
            const apiStatus = await window.electronAPI.getTwitchAPIStatus();
            if (apiStatus.authenticated) {
                this.onTwitchAPIAuthenticated({ user: apiStatus.user });
            }

            // Load actions
            this.actions = await window.electronAPI.loadActions() || [];
            this.renderActions();

            // Auto-connect to services after data is loaded
            setTimeout(() => {
                this.autoConnectServices();
            }, 1000); // Small delay to ensure UI is ready

        } catch (error) {
            console.error('Error loading initial data:', error);
            this.addLogEntry({ level: 'error', message: 'Failed to load initial data' });
        }
    }

    populateSettings() {
        // Populate OBS settings
        document.getElementById('obs-host').value = this.settings.obs?.host || 'localhost';
        document.getElementById('obs-port').value = this.settings.obs?.port || 4455;
        document.getElementById('obs-password').value = this.settings.obs?.password || '';

        // Populate Twitch settings
        document.getElementById('twitch-username').value = this.settings.twitch?.username || '';
        document.getElementById('twitch-oauth').value = this.settings.twitch?.oauth || '';
        document.getElementById('twitch-channel').value = this.settings.twitch?.channel || '';
    }

    updateTriggerFields(triggerType) {
        const commandGroup = document.getElementById('command-group');
        const channelPointsGroup = document.getElementById('channel-points-group');
        const permissionsGroup = document.getElementById('permissions-group');

        if (triggerType === 'command') {
            commandGroup.style.display = 'block';
            channelPointsGroup.style.display = 'none';
            permissionsGroup.style.display = 'block';
        } else if (triggerType === 'channel_points') {
            commandGroup.style.display = 'none';
            channelPointsGroup.style.display = 'block';
            permissionsGroup.style.display = 'none'; // Channel points don't need permissions
            this.populateChannelPointRewards();
        } else {
            commandGroup.style.display = 'none';
            channelPointsGroup.style.display = 'none';
            permissionsGroup.style.display = 'none';
        }
    }

    // OBS Methods
    async connectOBS() {
        const config = {
            host: document.getElementById('obs-host').value,
            port: parseInt(document.getElementById('obs-port').value),
            password: document.getElementById('obs-password').value || undefined
        };

        try {
            this.setOBSStatus('connecting');
            await window.electronAPI.connectOBS(config);
        } catch (error) {
            console.error('OBS connection error:', error);
            this.setOBSStatus('disconnected');
            this.addLogEntry({ level: 'error', message: `OBS connection failed: ${error.message}` });
        }
    }

    async disconnectOBS() {
        try {
            await window.electronAPI.disconnectOBS();
        } catch (error) {
            console.error('OBS disconnect error:', error);
            this.addLogEntry({ level: 'error', message: `OBS disconnect failed: ${error.message}` });
        }
    }

    onOBSConnected() {
        this.obsConnected = true;
        this.setOBSStatus('connected');
        this.addLogEntry({ level: 'success', message: 'Connected to OBS' });
        // Auto-save settings on successful connection
        this.saveSettings();
    }

    onOBSDisconnected() {
        this.obsConnected = false;
        this.setOBSStatus('disconnected');
        this.addLogEntry({ level: 'info', message: 'Disconnected from OBS' });
    }

    onOBSStatus(status) {
        // Handle status updates from OBS
        console.log('OBS status:', status);
    }

    setOBSStatus(status) {
        const statusElement = document.getElementById('obs-status');
        statusElement.className = `status ${status}`;
        statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        const connectBtn = document.getElementById('obs-connect-btn');
        const disconnectBtn = document.getElementById('obs-disconnect-btn');

        if (status === 'connected') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
        } else if (status === 'connecting') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = true;
        } else {
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
        }
    }

    // Twitch Methods
    async connectTwitch() {
        const config = {
            username: document.getElementById('twitch-username').value,
            oauth: document.getElementById('twitch-oauth').value,
            channel: document.getElementById('twitch-channel').value
        };

        if (!config.username || !config.oauth || !config.channel) {
            this.addLogEntry({ level: 'error', message: 'Please fill in all Twitch settings' });
            return;
        }

        try {
            this.setTwitchStatus('connecting');
            await window.electronAPI.connectTwitch(config);
        } catch (error) {
            console.error('Twitch connection error:', error);
            this.setTwitchStatus('disconnected');
            this.addLogEntry({ level: 'error', message: `Twitch connection failed: ${error.message}` });
        }
    }

    async disconnectTwitch() {
        try {
            await window.electronAPI.disconnectTwitch();
        } catch (error) {
            console.error('Twitch disconnect error:', error);
            this.addLogEntry({ level: 'error', message: `Twitch disconnect failed: ${error.message}` });
        }
    }

    onTwitchConnected() {
        this.twitchConnected = true;
        this.setTwitchStatus('connected');
        this.addLogEntry({ level: 'success', message: 'Connected to Twitch' });
        // Auto-save settings on successful connection
        this.saveSettings();
    }

    onTwitchDisconnected() {
        this.twitchConnected = false;
        this.setTwitchStatus('disconnected');
        this.addLogEntry({ level: 'info', message: 'Disconnected from Twitch' });
    }

    onTwitchMessage(message) {
        // Handle incoming Twitch messages
        console.log('Twitch message:', message);
    }

    onTwitchCommand(command) {
        // Handle Twitch commands
        console.log('Twitch command:', command);
        this.addLogEntry({ level: 'info', message: `Command received: ${command.command} from ${command.username}` });
    }

    setTwitchStatus(status) {
        const statusElement = document.getElementById('twitch-status');
        statusElement.className = `status ${status}`;
        statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        const connectBtn = document.getElementById('twitch-connect-btn');
        const disconnectBtn = document.getElementById('twitch-disconnect-btn');

        if (status === 'connected') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
        } else if (status === 'connecting') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = true;
        } else {
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
        }
    }

    // Action Methods
    openActionModal(actionId = null) {
        let action = null;
        if (actionId) {
            action = this.actions.find(a => a.id === actionId);
            if (!action) {
                console.error('Action not found:', actionId);
                return;
            }
            // Create a deep copy for editing
            action = JSON.parse(JSON.stringify(action));
        }

        this.currentAction = action || {
            id: Date.now().toString(),
            triggers: [{ type: 'command', config: {} }],
            steps: [],
            permissions: {
                viewer: true,
                moderator: true,
                broadcaster: true
            }
        };

        document.getElementById('modal-title').textContent = action ? 'Edit Action' : 'Create Action';
        document.getElementById('action-name').value = action?.name || '';

        // Set permissions
        document.getElementById('perm-viewer').checked = this.currentAction.permissions?.viewer ?? true;
        document.getElementById('perm-moderator').checked = this.currentAction.permissions?.moderator ?? true;
        document.getElementById('perm-broadcaster').checked = this.currentAction.permissions?.broadcaster ?? true;

        this.renderTriggers();
        this.renderActionSteps();

        document.getElementById('action-modal').classList.add('active');
    }

    closeModal() {
        document.getElementById('action-modal').classList.remove('active');
        this.currentAction = null;

        // Clear form
        document.getElementById('action-name').value = '';
        document.getElementById('triggers-container').innerHTML = '';
        document.getElementById('action-steps').innerHTML = '';
    }

    collectCurrentStepValues() {
        // Collect current values from all step form elements
        const stepElements = document.querySelectorAll('.action-step');
        this.currentAction.steps = Array.from(stepElements).map(stepElement => ({
            type: stepElement.querySelector('.step-type').value,
            value: stepElement.querySelector('.step-value').value.trim()
        }));
    }

    addActionStep() {
        // First, collect current step values from the form before adding new step
        this.collectCurrentStepValues();

        const step = {
            type: 'obs_scene',
            value: ''
        };

        this.currentAction.steps.push(step);
        this.renderActionSteps();
    }

    removeActionStep(index) {
        // First collect current values, then remove the step
        this.collectCurrentStepValues();
        this.currentAction.steps.splice(index, 1);
        this.renderActionSteps();
    }

    addTrigger() {
        const trigger = {
            type: 'command',
            config: {}
        };

        this.currentAction.triggers.push(trigger);
        this.renderTriggers();
    }

    removeTrigger(index) {
        this.currentAction.triggers.splice(index, 1);
        this.renderTriggers();
    }

    renderTriggers() {
        const container = document.getElementById('triggers-container');
        container.innerHTML = '';

        this.currentAction.triggers.forEach((trigger, index) => {
            const triggerElement = document.createElement('div');
            triggerElement.className = 'trigger-item';

            let configHtml = '';
            if (trigger.type === 'command') {
                configHtml = `<input type="text" class="trigger-command" placeholder="!command" value="${trigger.config.command || ''}">`;
            } else if (trigger.type === 'channel_points') {
                configHtml = `<select class="trigger-reward">
                    <option value="">Any Reward</option>
                    <!-- Rewards will be populated dynamically -->
                </select>`;
            }

            triggerElement.innerHTML = `
                <select class="trigger-type">
                    <option value="command" ${trigger.type === 'command' ? 'selected' : ''}>Chat Command</option>
                    <option value="channel_points" ${trigger.type === 'channel_points' ? 'selected' : ''}>Channel Point Redeem</option>
                    <option value="cheer" ${trigger.type === 'cheer' ? 'selected' : ''}>Cheer (Bits)</option>
                    <option value="subscriber" ${trigger.type === 'subscriber' ? 'selected' : ''}>Subscriber</option>
                    <option value="timer" ${trigger.type === 'timer' ? 'selected' : ''}>Timer</option>
                </select>
                ${configHtml}
                <button class="trigger-remove" onclick="app.removeTrigger(${index})">×</button>
            `;

            // Add event listener for trigger type change
            const typeSelect = triggerElement.querySelector('.trigger-type');
            typeSelect.addEventListener('change', (e) => {
                this.updateTriggerConfig(index, e.target.value);
            });

            // Populate channel point rewards if needed
            if (trigger.type === 'channel_points') {
                const rewardSelect = triggerElement.querySelector('.trigger-reward');
                this.populateTriggerRewards(rewardSelect, trigger.config.reward);
            }

            container.appendChild(triggerElement);
        });
    }

    updateTriggerConfig(triggerIndex, newType) {
        // Update the trigger type and reset config
        this.currentAction.triggers[triggerIndex].type = newType;
        this.currentAction.triggers[triggerIndex].config = {};

        // Re-render triggers to update the UI
        this.renderTriggers();
    }

    async populateTriggerRewards(rewardSelect, selectedValue = '') {
        rewardSelect.innerHTML = '<option value="">Any Reward</option>';

        try {
            // Get the broadcaster ID from the authenticated user
            const apiStatus = await window.electronAPI.getTwitchAPIStatus();
            if (!apiStatus.authenticated || !apiStatus.user) {
                rewardSelect.innerHTML = '<option value="">Please authenticate as broadcaster first</option>';
                return;
            }

            // Get custom rewards from Twitch API
            const rewards = await window.electronAPI.getCustomRewards(apiStatus.user.id);

            // Populate the dropdown
            rewards.forEach(reward => {
                const option = document.createElement('option');
                option.value = reward.id;
                option.textContent = `${reward.title} (${reward.cost} points)`;
                if (selectedValue === reward.id) {
                    option.selected = true;
                }
                rewardSelect.appendChild(option);
            });

            if (rewards.length === 0) {
                rewardSelect.innerHTML = '<option value="">No channel point rewards found</option>';
            }

        } catch (error) {
            console.error('Failed to load channel point rewards:', error);
            rewardSelect.innerHTML = '<option value="">Failed to load rewards</option>';
        }
    }

    renderActionSteps() {
        const container = document.getElementById('action-steps');
        container.innerHTML = '';

        this.currentAction.steps.forEach((step, index) => {
            const stepElement = document.createElement('div');
            stepElement.className = 'action-step';

            stepElement.innerHTML = `
                <select class="step-type">
                    <option value="obs_scene" ${step.type === 'obs_scene' ? 'selected' : ''}>Switch OBS Scene</option>
                    <option value="obs_source" ${step.type === 'obs_source' ? 'selected' : ''}>Toggle OBS Source</option>
                    <option value="obs_start_streaming" ${step.type === 'obs_start_streaming' ? 'selected' : ''}>Start OBS Streaming</option>
                    <option value="obs_stop_streaming" ${step.type === 'obs_stop_streaming' ? 'selected' : ''}>Stop OBS Streaming</option>
                    <option value="twitch_message" ${step.type === 'twitch_message' ? 'selected' : ''}>Send Twitch Message</option>
                    <option value="play_sound" ${step.type === 'play_sound' ? 'selected' : ''}>Play Sound</option>
                    <option value="delay" ${step.type === 'delay' ? 'selected' : ''}>Delay</option>
                </select>
                <input type="text" class="step-value" placeholder="${step.type === 'play_sound' ? 'Path to audio file' : step.type === 'delay' ? 'Delay in milliseconds' : step.type === 'twitch_message' ? 'Message to send' : 'Scene/Source name'}" value="${step.value}" ${step.type === 'obs_start_streaming' || step.type === 'obs_stop_streaming' ? 'disabled' : ''}>
                <button class="step-remove" onclick="app.removeActionStep(${index})">×</button>
            `;

            container.appendChild(stepElement);
        });
    }

    async saveAction() {
        const name = document.getElementById('action-name').value.trim();
        if (!name) {
            alert('Please enter an action name');
            return;
        }

        // Collect triggers
        const triggerElements = document.querySelectorAll('.trigger-item');
        this.currentAction.triggers = Array.from(triggerElements).map(triggerElement => {
            const type = triggerElement.querySelector('.trigger-type').value;
            const config = {};

            if (type === 'command') {
                config.command = triggerElement.querySelector('.trigger-command').value.trim();
            } else if (type === 'channel_points') {
                config.reward = triggerElement.querySelector('.trigger-reward').value;
            }

            return { type, config };
        });

        // Update action data
        this.currentAction.name = name;

        // Update permissions
        this.currentAction.permissions = {
            viewer: document.getElementById('perm-viewer').checked,
            moderator: document.getElementById('perm-moderator').checked,
            broadcaster: document.getElementById('perm-broadcaster').checked
        };

        // Validate permissions
        if (!this.validatePermissions()) {
            alert('At least one permission must be selected');
            return;
        }

        // Update steps
        const stepElements = document.querySelectorAll('.action-step');
        this.currentAction.steps = Array.from(stepElements).map(step => ({
            type: step.querySelector('.step-type').value,
            value: step.querySelector('.step-value').value.trim()
        }));

        try {
            if (this.actions.find(a => a.id === this.currentAction.id)) {
                // Update existing action
                const updatedAction = await window.electronAPI.updateAction(this.currentAction.id, this.currentAction);
                // Update the local actions array with the updated action
                const index = this.actions.findIndex(a => a.id === this.currentAction.id);
                if (index !== -1) {
                    this.actions[index] = updatedAction;
                }
            } else {
                // Create new action
                const createdAction = await window.electronAPI.createAction(this.currentAction);
                this.actions.push(createdAction);
            }

            this.renderActions();
            this.closeModal();
            this.addLogEntry({ level: 'success', message: `Action "${name}" saved` });
        } catch (error) {
            console.error('Save action error:', error);
            this.addLogEntry({ level: 'error', message: `Failed to save action: ${error.message}` });
        }
    }

    validatePermissions() {
        const viewer = document.getElementById('perm-viewer').checked;
        const moderator = document.getElementById('perm-moderator').checked;
        const broadcaster = document.getElementById('perm-broadcaster').checked;

        return viewer || moderator || broadcaster;
    }

    async deleteAction(actionId) {
        if (!confirm('Are you sure you want to delete this action?')) {
            return;
        }

        try {
            await window.electronAPI.deleteAction(actionId);
            this.actions = this.actions.filter(a => a.id !== actionId);
            this.renderActions();
            this.addLogEntry({ level: 'info', message: 'Action deleted' });
        } catch (error) {
            console.error('Delete action error:', error);
            this.addLogEntry({ level: 'error', message: `Failed to delete action: ${error.message}` });
        }
    }

    async testAction(actionId) {
        const action = this.actions.find(a => a.id === actionId);
        if (!action) {
            console.error('Action not found for testing:', actionId);
            this.addLogEntry({ level: 'error', message: 'Action not found for testing' });
            return;
        }

        this.addLogEntry({ level: 'info', message: `Testing action: ${action.name}` });

        try {
            // Execute the action directly without permission checks
            await window.electronAPI.testAction(actionId);
            this.addLogEntry({ level: 'success', message: `Test completed: ${action.name}` });
        } catch (error) {
            console.error('Test action error:', error);
            this.addLogEntry({ level: 'error', message: `Test failed: ${error.message}` });
        }
    }

    renderActions() {
        const container = document.getElementById('actions-list');
        container.innerHTML = '';

        if (this.actions.length === 0) {
            container.innerHTML = '<p style="color: #cccccc; text-align: center; padding: 2rem;">No actions created yet. Click "Add Action" to get started.</p>';
            return;
        }

        this.actions.forEach(action => {
            const actionElement = document.createElement('div');
            actionElement.className = 'action-item';

            let triggerTexts = [];
            if (action.triggers && action.triggers.length > 0) {
                action.triggers.forEach(trigger => {
                    let triggerText = '';
                    if (trigger.type === 'command') {
                        triggerText = `Command: ${trigger.config.command || 'N/A'}`;
                    } else if (trigger.type === 'channel_points') {
                        triggerText = `Channel Points: ${trigger.config.reward || 'Any reward'}`;
                    } else if (trigger.type === 'timer') {
                        triggerText = 'Timer trigger';
                    } else if (trigger.type === 'cheer') {
                        triggerText = 'Cheer (Bits)';
                    } else if (trigger.type === 'subscriber') {
                        triggerText = 'Subscriber';
                    } else {
                        triggerText = 'Unknown trigger';
                    }
                    triggerTexts.push(triggerText);
                });
            } else {
                triggerTexts.push('No triggers');
            }

            actionElement.innerHTML = `
                <div class="action-info">
                    <h3>${action.name}</h3>
                    <div class="action-details">${triggerTexts.join(', ')} • ${action.steps.length} step${action.steps.length !== 1 ? 's' : ''}</div>
                </div>
                <div class="action-controls">
                    <button class="btn btn-success" onclick="app.testAction('${action.id}')">Test</button>
                    <button class="btn btn-secondary" onclick="app.openActionModal('${action.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="app.deleteAction('${action.id}')">Delete</button>
                </div>
            `;

            container.appendChild(actionElement);
        });
    }

    onActionTriggered(action) {
        this.addLogEntry({ level: 'success', message: `Action triggered: ${action.name}` });
    }

    // Logging
    addLogEntry(log) {
        const container = document.getElementById('logs-container');
        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${log.level}`;

        const timestamp = new Date().toLocaleTimeString();
        logElement.textContent = `[${timestamp}] ${log.message}`;

        container.appendChild(logElement);
        container.scrollTop = container.scrollHeight;
    }

    async saveSettings() {
        // Collect settings from form
        const settings = {
            obs: {
                host: document.getElementById('obs-host').value,
                port: parseInt(document.getElementById('obs-port').value),
                password: document.getElementById('obs-password').value
            },
            twitch: {
                username: document.getElementById('twitch-username').value,
                oauth: document.getElementById('twitch-oauth').value,
                channel: document.getElementById('twitch-channel').value
            }
        };

        try {
            await window.electronAPI.saveSettings(settings);
            this.settings = settings;
            this.addLogEntry({
                level: 'success',
                message: 'Settings saved to .env file - restart app for changes to take effect'
            });
        } catch (error) {
            console.error('Save settings error:', error);
            this.addLogEntry({ level: 'error', message: `Failed to save settings: ${error.message}` });
        }
    }

    async autoConnectServices() {
        console.log('Attempting auto-connection to services...');

        // Check OBS settings
        const obsSettings = this.settings.obs;
        if (obsSettings && obsSettings.host && obsSettings.port) {
            this.addLogEntry({ level: 'info', message: 'Auto-connecting to OBS...' });
            try {
                await this.connectOBS();
            } catch (error) {
                // Auto-connection failures are logged by connectOBS, no need to log again
                console.log('Auto OBS connection failed (expected if OBS not running)');
            }
        } else {
            this.addLogEntry({ level: 'warn', message: 'OBS settings incomplete - skipping auto-connect' });
        }

        // Check Twitch settings
        const twitchSettings = this.settings.twitch;
        if (twitchSettings && twitchSettings.username && twitchSettings.oauth && twitchSettings.channel) {
            this.addLogEntry({ level: 'info', message: 'Auto-connecting to Twitch...' });
            try {
                await this.connectTwitch();
            } catch (error) {
                // Auto-connection failures are logged by connectTwitch, no need to log again
                console.log('Auto Twitch connection failed (expected if credentials invalid)');
            }
        } else {
            this.addLogEntry({ level: 'warn', message: 'Twitch settings incomplete - skipping auto-connect' });
        }
    }

    playSound(soundPath) {
        try {
            console.log('Playing sound from renderer:', soundPath);
            console.log('Audio context state:', window.AudioContext ? new AudioContext().state : 'No AudioContext');

            // For local files, try using file:// protocol
            let audioUrl = soundPath;
            if (!soundPath.startsWith('http') && !soundPath.startsWith('file://')) {
                // Convert local path to file:// URL
                audioUrl = `file://${soundPath}`;
            }

            console.log('Using audio URL:', audioUrl);

            // Create audio element and play the sound
            const audio = new Audio();
            audio.volume = 0.8; // Set reasonable default volume
            audio.crossOrigin = 'anonymous'; // Try to avoid CORS issues

            // Add comprehensive event listeners for debugging
            audio.onloadstart = () => console.log('Audio load started');
            audio.oncanplay = () => console.log('Audio can play');
            audio.onloadeddata = () => console.log('Audio data loaded');
            audio.onloadedmetadata = () => console.log('Audio metadata loaded');
            audio.onprogress = () => console.log('Audio loading progress');
            audio.onstalled = () => console.log('Audio stalled');
            audio.onsuspend = () => console.log('Audio suspended');
            audio.onabort = () => console.log('Audio aborted');

            audio.onerror = (e) => {
                console.error('Audio error event:', e);
                console.error('Audio error code:', audio.error?.code);
                console.error('Audio error message:', audio.error?.message);
                console.error('Audio network state:', audio.networkState);
                console.error('Audio ready state:', audio.readyState);
                this.addLogEntry({ level: 'error', message: `Audio error: ${audio.error?.message || 'Unknown error'} (code: ${audio.error?.code})` });
            };

            // Set the source and load
            audio.src = audioUrl;
            audio.load();

            // Try to play after a short delay to ensure loading
            setTimeout(async () => {
                try {
                    console.log('Attempting to play audio...');
                    console.log('Audio readyState:', audio.readyState);
                    console.log('Audio networkState:', audio.networkState);
                    console.log('Audio duration:', audio.duration);
                    console.log('Audio paused:', audio.paused);

                    // Resume audio context if suspended (required by modern browsers)
                    if (window.AudioContext) {
                        const audioContext = new AudioContext();
                        if (audioContext.state === 'suspended') {
                            await audioContext.resume();
                            console.log('Audio context resumed');
                        }
                    }

                    await audio.play();
                    console.log('Audio play() promise resolved - SOUND SHOULD BE PLAYING!');
                    this.addLogEntry({ level: 'success', message: 'Audio playback started successfully' });
                } catch (error) {
                    console.error('Audio playback failed:', error);
                    console.error('Error details:', error.message);
                    this.addLogEntry({ level: 'error', message: `Failed to play sound: ${error.message}` });

                    // Try alternative approach with fetch
                    this.tryAlternativePlayback(soundPath);
                }
            }, 1000);

            // Optional: Log when audio ends
            audio.onended = () => {
                console.log('Sound playback completed');
            };

        } catch (error) {
            console.error('Error creating audio element:', error);
            this.addLogEntry({ level: 'error', message: `Failed to create audio element: ${error.message}` });
        }
    }

    async tryAlternativePlayback(soundPath) {
        try {
            console.log('Trying alternative playback method...');

            // Try to fetch the file and create a blob URL
            const response = await fetch(soundPath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            console.log('Created blob URL:', blobUrl);

            const audio = new Audio(blobUrl);
            audio.volume = 0.8;

            audio.oncanplay = () => console.log('Blob audio can play');
            audio.onerror = (e) => console.error('Blob audio error:', e);

            await audio.play();
            console.log('Blob audio playback started!');
            this.addLogEntry({ level: 'success', message: 'Audio playback started via blob URL' });

            // Clean up blob URL after playback
            audio.onended = () => {
                URL.revokeObjectURL(blobUrl);
            };

        } catch (error) {
            console.error('Alternative playback also failed:', error);
            this.addLogEntry({ level: 'error', message: `All audio playback methods failed: ${error.message}` });
        }
    }

    // Twitch API Methods
    async authenticateTwitchAPI() {
        try {
            const result = await window.electronAPI.authenticateTwitchAPI();
            this.addLogEntry({ level: 'success', message: 'Twitch API authentication successful' });
        } catch (error) {
            console.error('Twitch API authentication error:', error);
            this.addLogEntry({ level: 'error', message: `Twitch API authentication failed: ${error.message}` });
        }
    }

    async logoutTwitchAPI() {
        try {
            await window.electronAPI.logoutTwitchAPI();
            this.addLogEntry({ level: 'info', message: 'Logged out of Twitch API' });
        } catch (error) {
            console.error('Twitch API logout error:', error);
            this.addLogEntry({ level: 'error', message: `Twitch API logout failed: ${error.message}` });
        }
    }

    onTwitchAPIAuthenticated(data) {
        const statusElement = document.getElementById('twitch-api-status');
        const nameElement = document.getElementById('broadcaster-name');
        const infoElement = document.getElementById('broadcaster-info');
        const loginBtn = document.getElementById('twitch-api-login-btn');
        const logoutBtn = document.getElementById('twitch-api-logout-btn');

        statusElement.className = 'status connected';
        statusElement.textContent = 'Authenticated';
        nameElement.textContent = data.user.display_name;
        infoElement.style.display = 'block';

        loginBtn.disabled = true;
        logoutBtn.disabled = false;

        this.addLogEntry({ level: 'success', message: `Authenticated as ${data.user.display_name}` });
    }

    onTwitchAPILoggedOut() {
        const statusElement = document.getElementById('twitch-api-status');
        const infoElement = document.getElementById('broadcaster-info');
        const loginBtn = document.getElementById('twitch-api-login-btn');
        const logoutBtn = document.getElementById('twitch-api-logout-btn');

        statusElement.className = 'status disconnected';
        statusElement.textContent = 'Not Authenticated';
        infoElement.style.display = 'none';

        loginBtn.disabled = false;
        logoutBtn.disabled = true;

        this.addLogEntry({ level: 'info', message: 'Logged out of Twitch API' });
    }

    async onChannelPointRedeem(redeemData) {
        console.log('Channel point redeem received:', redeemData);

        // Trigger the action through the backend
        try {
            await window.electronAPI.triggerChannelPoint(redeemData);
            this.addLogEntry({
                level: 'success',
                message: `${redeemData.userName} redeemed "${redeemData.rewardTitle}" (${redeemData.rewardId})`
            });
        } catch (error) {
            console.error('Failed to trigger channel point action:', error);
            this.addLogEntry({
                level: 'error',
                message: `Failed to process channel point redeem: ${error.message}`
            });
        }
    }

    async onCheer(cheerData) {
        console.log('Cheer received:', cheerData);

        // Trigger the action through the backend
        try {
            await window.electronAPI.triggerCheer(cheerData);
            const userDisplay = cheerData.isAnonymous ? 'Anonymous' : cheerData.userName;
            this.addLogEntry({
                level: 'success',
                message: `${userDisplay} cheered ${cheerData.bits} bits`
            });
        } catch (error) {
            console.error('Failed to trigger cheer action:', error);
            this.addLogEntry({
                level: 'error',
                message: `Failed to process cheer: ${error.message}`
            });
        }
    }

    async onSubscriber(subscriberData) {
        console.log('Subscriber event received:', subscriberData);

        // Trigger the action through the backend
        try {
            await window.electronAPI.triggerSubscriber(subscriberData);
            let message = '';
            if (subscriberData.isGift) {
                message = `${subscriberData.userName} received a gifted subscription from ${subscriberData.gifterName}`;
            } else if (subscriberData.cumulativeMonths > 1) {
                message = `${subscriberData.userName} resubscribed for ${subscriberData.cumulativeMonths} months`;
            } else {
                message = `${subscriberData.userName} subscribed`;
            }
            this.addLogEntry({
                level: 'success',
                message: message
            });
        } catch (error) {
            console.error('Failed to trigger subscriber action:', error);
            this.addLogEntry({
                level: 'error',
                message: `Failed to process subscriber event: ${error.message}`
            });
        }
    }

    async populateChannelPointRewards() {
        const rewardSelect = document.getElementById('action-reward');

        // Store the current selected value before clearing
        const currentValue = rewardSelect.value;

        rewardSelect.innerHTML = '<option value="">Select a reward...</option>';

        try {
            // Get the broadcaster ID from the authenticated user
            const apiStatus = await window.electronAPI.getTwitchAPIStatus();
            if (!apiStatus.authenticated || !apiStatus.user) {
                rewardSelect.innerHTML = '<option value="">Please authenticate as broadcaster first</option>';
                return;
            }

            // Get custom rewards from Twitch API
            const rewards = await window.electronAPI.getCustomRewards(apiStatus.user.id);

            // Populate the dropdown
            rewards.forEach(reward => {
                const option = document.createElement('option');
                option.value = reward.id;
                option.textContent = `${reward.title} (${reward.cost} points)`;
                rewardSelect.appendChild(option);
            });

            if (rewards.length === 0) {
                rewardSelect.innerHTML = '<option value="">No channel point rewards found</option>';
            } else {
                // Add an "Any Reward" option
                const anyOption = document.createElement('option');
                anyOption.value = '';
                anyOption.textContent = 'Any Reward (triggers on all redeems)';
                rewardSelect.insertBefore(anyOption, rewardSelect.firstChild);

                // Restore the previously selected value if it exists
                if (currentValue && currentValue !== '') {
                    rewardSelect.value = currentValue;
                } else {
                    // Default to "Any Reward" if no previous selection
                    rewardSelect.value = '';
                }
            }

        } catch (error) {
            console.error('Failed to load channel point rewards:', error);
            rewardSelect.innerHTML = '<option value="">Failed to load rewards</option>';
        }
    }

    clearLogs() {
        document.getElementById('logs-container').innerHTML = '';
    }
}

// Initialize the app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DebbotApp();
});
