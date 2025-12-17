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

        // Trigger type change
        document.getElementById('action-trigger').addEventListener('change', (e) => {
            this.updateTriggerFields(e.target.value);
        });

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
        }
    }

    async loadInitialData() {
        try {
            // Load settings
            this.settings = await window.electronAPI.loadSettings() || {};
            this.populateSettings();

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
        const permissionsGroup = document.getElementById('permissions-group');

        if (triggerType === 'command') {
            commandGroup.style.display = 'block';
            permissionsGroup.style.display = 'block';
        } else {
            commandGroup.style.display = 'none';
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
            steps: [],
            permissions: {
                viewer: true,
                moderator: true,
                broadcaster: true
            }
        };

        document.getElementById('modal-title').textContent = action ? 'Edit Action' : 'Create Action';
        document.getElementById('action-name').value = action?.name || '';
        document.getElementById('action-trigger').value = action?.trigger || 'command';
        document.getElementById('action-command').value = action?.command || '';

        // Set permissions
        document.getElementById('perm-viewer').checked = this.currentAction.permissions?.viewer ?? true;
        document.getElementById('perm-moderator').checked = this.currentAction.permissions?.moderator ?? true;
        document.getElementById('perm-broadcaster').checked = this.currentAction.permissions?.broadcaster ?? true;

        this.updateTriggerFields(action?.trigger || 'command');
        this.renderActionSteps();

        document.getElementById('action-modal').classList.add('active');
    }

    closeModal() {
        document.getElementById('action-modal').classList.remove('active');
        this.currentAction = null;

        // Clear form
        document.getElementById('action-name').value = '';
        document.getElementById('action-command').value = '';
        document.getElementById('action-steps').innerHTML = '';
    }

    addActionStep() {
        const step = {
            type: 'obs_scene',
            value: ''
        };

        this.currentAction.steps.push(step);
        this.renderActionSteps();
    }

    removeActionStep(index) {
        this.currentAction.steps.splice(index, 1);
        this.renderActionSteps();
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
                    <option value="delay" ${step.type === 'delay' ? 'selected' : ''}>Delay</option>
                </select>
                <input type="text" class="step-value" placeholder="Scene/Source name, message, or delay (ms)" value="${step.value}" ${step.type === 'obs_start_streaming' || step.type === 'obs_stop_streaming' ? 'disabled' : ''}>
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

        // Update action data
        this.currentAction.name = name;
        this.currentAction.trigger = document.getElementById('action-trigger').value;
        this.currentAction.command = document.getElementById('action-command').value.trim();

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

            const triggerText = action.trigger === 'command' ? `Command: ${action.command}` :
                              action.trigger === 'manual' ? 'Manual trigger' : 'Timer trigger';

            actionElement.innerHTML = `
                <div class="action-info">
                    <h3>${action.name}</h3>
                    <div class="action-details">${triggerText} • ${action.steps.length} step${action.steps.length !== 1 ? 's' : ''}</div>
                </div>
                <div class="action-controls">
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

    clearLogs() {
        document.getElementById('logs-container').innerHTML = '';
    }
}

// Initialize the app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DebbotApp();
});
