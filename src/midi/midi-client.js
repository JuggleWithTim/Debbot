const easymidi = require('easymidi');

class MIDIClient {
    constructor() {
        this.input = null;
        this.connected = false;
        this.devices = [];
        this.detectionMode = false;
        this.detectionCallback = null;

        this.refreshDevices();
    }

    refreshDevices() {
        try {
            this.devices = easymidi.getInputs();
            console.log('MIDI input devices:', this.devices);
            return this.devices;
        } catch (error) {
            console.error('Error getting MIDI devices:', error);
            this.devices = [];
            return [];
        }
    }

    async connect(deviceName = null) {
        try {
            // Close existing connection
            if (this.input) {
                this.input.close();
                this.input = null;
            }

            // If no device specified, try to use preferred device from settings
            if (!deviceName) {
                // Check for preferred device in settings
                if (global && global.settings && global.settings.midi && global.settings.midi.device) {
                    const preferredDevice = global.settings.midi.device;
                    if (this.devices.includes(preferredDevice)) {
                        deviceName = preferredDevice;
                        console.log('Using preferred MIDI device from settings:', deviceName);
                    }
                }

                // Fall back to first available device if no preferred device found
                if (!deviceName && this.devices.length > 0) {
                    deviceName = this.devices[0];
                    console.log('Using first available MIDI device:', deviceName);
                }
            }

            if (!deviceName) {
                throw new Error('No MIDI input devices available');
            }

            console.log('Connecting to MIDI device:', deviceName);

            this.input = new easymidi.Input(deviceName);
            this.connected = true;

            this.setupEventListeners();

            console.log('Successfully connected to MIDI device:', deviceName);
            return true;
        } catch (error) {
            console.error('Failed to connect to MIDI device:', error);
            this.connected = false;
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.input) {
                this.input.close();
                this.input = null;
            }
            this.connected = false;
            console.log('Disconnected from MIDI device');
        } catch (error) {
            console.error('Error disconnecting from MIDI device:', error);
            throw error;
        }
    }

    isConnected() {
        return this.connected && this.input !== null;
    }

    setupEventListeners() {
        if (!this.input) return;

        // Listen for note on messages
        this.input.on('noteon', (msg) => {
            console.log('MIDI Note On:', msg);

            if (this.detectionMode && this.detectionCallback) {
                this.detectionCallback({
                    type: 'noteon',
                    note: msg.note,
                    velocity: msg.velocity,
                    channel: msg.channel
                });
            }

            // Emit event for action triggers
            this.handleMIDIMessage('noteon', msg);
        });

        // Listen for note off messages
        this.input.on('noteoff', (msg) => {
            console.log('MIDI Note Off:', msg);

            if (this.detectionMode && this.detectionCallback) {
                this.detectionCallback({
                    type: 'noteoff',
                    note: msg.note,
                    velocity: msg.velocity,
                    channel: msg.channel
                });
            }

            // Emit event for action triggers
            this.handleMIDIMessage('noteoff', msg);
        });

        // Listen for control change messages
        this.input.on('cc', (msg) => {
            console.log('MIDI Control Change:', msg);

            if (this.detectionMode && this.detectionCallback) {
                this.detectionCallback({
                    type: 'cc',
                    controller: msg.controller,
                    value: msg.value,
                    channel: msg.channel
                });
            }

            // Emit event for action triggers
            this.handleMIDIMessage('cc', msg);
        });

        // Listen for pitch bend messages
        this.input.on('pitch', (msg) => {
            console.log('MIDI Pitch Bend:', msg);

            if (this.detectionMode && this.detectionCallback) {
                this.detectionCallback({
                    type: 'pitch',
                    value: msg.value,
                    channel: msg.channel
                });
            }

            // Emit event for action triggers
            this.handleMIDIMessage('pitch', msg);
        });
    }

    handleMIDIMessage(type, msg) {
        // Emit MIDI message event for the main process to handle
        if (global.midiClient && global.midiClient.constructor === MIDIClient) {
            // Use EventEmitter pattern or direct callback
            if (global.midiMessageHandler) {
                global.midiMessageHandler({
                    type,
                    note: msg.note,
                    controller: msg.controller,
                    value: msg.value,
                    velocity: msg.velocity,
                    channel: msg.channel
                });
            }
        }
    }

    // Enable detection mode for configuring MIDI triggers
    async startDetection(callback) {
        // Ensure we have a device connected for detection
        if (!this.isConnected()) {
            try {
                await this.connect();
            } catch (error) {
                console.error('Failed to connect to MIDI device for detection:', error);
                throw error;
            }
        }

        this.detectionMode = true;
        this.detectionCallback = callback;
        console.log('MIDI detection mode started');
    }

    // Disable detection mode
    stopDetection() {
        this.detectionMode = false;
        this.detectionCallback = null;
        console.log('MIDI detection mode stopped');
    }

    getDevices() {
        return this.devices;
    }

    getConnectedDevice() {
        return this.connected ? this.input.name : null;
    }

    // Get status information
    getStatus() {
        return {
            connected: this.connected,
            device: this.getConnectedDevice(),
            devices: this.devices,
            detectionMode: this.detectionMode
        };
    }
}

module.exports = MIDIClient;
