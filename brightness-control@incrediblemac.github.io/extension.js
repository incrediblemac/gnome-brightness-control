// Brightness Control Extension for GNOME Shell
// Multi-monitor software-based brightness control for external monitors on Wayland

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Store for multiple brightness overlays (keyed by connector name)
let _brightnessOverlays = {};

// Monitor slider item for individual monitor control
const MonitorBrightnessItem = GObject.registerClass(
class MonitorBrightnessItem extends PopupMenu.PopupBaseMenuItem {
    _init(connector, displayName, brightness, ddcAvailable, callback) {
        super._init({ activate: false });

        this._connector = connector;
        this._callback = callback;

        // Main container
        const box = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        this.add_child(box);

        // Header row with monitor name and method indicator
        const headerBox = new St.BoxLayout({
            x_expand: true
        });
        box.add_child(headerBox);

        // Monitor icon
        const icon = new St.Icon({
            icon_name: 'video-display-symbolic',
            style_class: 'popup-menu-icon',
            style: 'margin-right: 8px;'
        });
        headerBox.add_child(icon);

        // Monitor name
        this._nameLabel = new St.Label({
            text: displayName,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        headerBox.add_child(this._nameLabel);

        // Method indicator (DDC or Software)
        this._methodLabel = new St.Label({
            text: ddcAvailable ? 'DDC' : 'SW',
            y_align: Clutter.ActorAlign.CENTER,
            style: ddcAvailable
                ? 'color: #73d216; font-size: 10px; margin-left: 8px;'
                : 'color: #f57900; font-size: 10px; margin-left: 8px;'
        });
        headerBox.add_child(this._methodLabel);

        // Brightness percentage
        this._percentLabel = new St.Label({
            text: `${brightness}%`,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-left: 12px; min-width: 40px; text-align: right;'
        });
        headerBox.add_child(this._percentLabel);

        // Slider row
        const sliderBox = new St.BoxLayout({
            style: 'margin-top: 4px;'
        });
        box.add_child(sliderBox);

        this._slider = new Slider.Slider(brightness / 100);
        this._slider.x_expand = true;

        this._slider.connect('notify::value', () => {
            const value = Math.round(this._slider.value * 100);
            this._percentLabel.text = `${value}%`;
            if (this._callback) {
                this._callback(this._connector, value);
            }
        });

        sliderBox.add_child(this._slider);
    }

    get connector() {
        return this._connector;
    }

    setValue(value) {
        this._slider.value = value / 100;
        this._percentLabel.text = `${value}%`;
    }

    updateMethod(ddcAvailable) {
        this._methodLabel.text = ddcAvailable ? 'DDC' : 'SW';
        this._methodLabel.style = ddcAvailable
            ? 'color: #73d216; font-size: 10px; margin-left: 8px;'
            : 'color: #f57900; font-size: 10px; margin-left: 8px;';
    }
});

// Global brightness slider for sync mode
const GlobalBrightnessItem = GObject.registerClass(
class GlobalBrightnessItem extends PopupMenu.PopupBaseMenuItem {
    _init(brightness, callback) {
        super._init({ activate: false });

        this._callback = callback;

        const box = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        this.add_child(box);

        // Header
        const headerBox = new St.BoxLayout({ x_expand: true });
        box.add_child(headerBox);

        const icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'popup-menu-icon',
            style: 'margin-right: 8px;'
        });
        headerBox.add_child(icon);

        const label = new St.Label({
            text: 'All Monitors',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'font-weight: bold;'
        });
        headerBox.add_child(label);

        this._percentLabel = new St.Label({
            text: `${brightness}%`,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-left: 12px; min-width: 40px;'
        });
        headerBox.add_child(this._percentLabel);

        // Slider
        const sliderBox = new St.BoxLayout({ style: 'margin-top: 4px;' });
        box.add_child(sliderBox);

        this._slider = new Slider.Slider(brightness / 100);
        this._slider.x_expand = true;

        this._slider.connect('notify::value', () => {
            const value = Math.round(this._slider.value * 100);
            this._percentLabel.text = `${value}%`;
            if (this._callback) {
                this._callback(value);
            }
        });

        sliderBox.add_child(this._slider);
    }

    setValue(value) {
        this._slider.value = value / 100;
        this._percentLabel.text = `${value}%`;
    }
});

const BrightnessIndicator = GObject.registerClass(
class BrightnessIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Brightness Control');

        this._extension = extension;
        this._settings = extension.getSettings();
        this._cancellable = new Gio.Cancellable();
        this._monitorItems = {};
        this._globalSliderItem = null;
        this._ddcBusMap = {};
        this._ddcAvailableMap = {};
        this._externalMonitors = [];
        this._monitorChangedId = null;
        this._settingsConnections = [];

        // Create panel UI
        this._container = new St.BoxLayout({
            style_class: 'panel-status-menu-box'
        });

        this._icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'system-status-icon'
        });

        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-left: 4px;'
        });

        this._container.add_child(this._icon);
        if (this._settings.get_boolean('show-percentage')) {
            this._container.add_child(this._label);
        }

        this.add_child(this._container);

        // Detect monitors and DDC
        this._detectMonitors();
        this._detectDDC();

        // Build menu
        this._buildMenu();

        // Create overlays for all external monitors
        this._createAllOverlays();

        // Apply initial brightness
        this._applyAllBrightness();

        // Connect to settings changes
        this._connectSettings();

        // Monitor for display changes
        this._monitorChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._onMonitorsChanged();
        });

        // Scroll event on panel icon
        this.connect('scroll-event', (actor, event) => {
            return this._onScrollEvent(event);
        });

        // Update panel label
        this._updatePanelLabel();
    }

    _connectSettings() {
        const id1 = this._settings.connect('changed::show-percentage', () => {
            if (this._settings.get_boolean('show-percentage')) {
                if (!this._container.contains(this._label)) {
                    this._container.add_child(this._label);
                }
            } else {
                if (this._container.contains(this._label)) {
                    this._container.remove_child(this._label);
                }
            }
        });
        this._settingsConnections.push(id1);

        const id2 = this._settings.connect('changed::sync-all-monitors', () => {
            this._rebuildMenu();
        });
        this._settingsConnections.push(id2);

        const id3 = this._settings.connect('changed::monitor-brightness', () => {
            this._applyAllBrightness();
            this._updatePanelLabel();
        });
        this._settingsConnections.push(id3);
    }

    _detectMonitors() {
        this._externalMonitors = [];
        const display = global.display;
        const nMonitors = display.get_n_monitors();

        // Build connector map using multiple detection methods
        let connectorMap = {};

        // Method 1: Read connector names from /sys/class/drm
        try {
            const drmDir = Gio.File.new_for_path('/sys/class/drm');
            const iter = drmDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = iter.next_file(null)) !== null) {
                const match = info.get_name().match(/^card\d+-(.+)/);
                if (!match)
                    continue;
                try {
                    const [ok, contents] = GLib.file_get_contents(`/sys/class/drm/${info.get_name()}/status`);
                    if (ok && new TextDecoder().decode(contents).trim() === 'connected') {
                        // Normalize: HDMI-A-1 -> HDMI-1, DP-1 -> DP-1
                        connectorMap[this._normalizeConnector(match[1])] = {drmName: match[1], connected: true};
                    }
                } catch (e) {}
            }
            iter.close(null);
        } catch (e) {
            console.error(`Brightness Control: DRM detection failed: ${e.message}`);
        }

        // Method 2: Try deprecated display.get_monitor_connector if available
        for (let i = 0; i < nMonitors; i++) {
            let connector = null;

            if (display.get_monitor_connector) {
                connector = display.get_monitor_connector(i);
            }

            // If deprecated API not available, try to match from DRM connectors
            if (!connector) {
                // Use xrandr-style names from DRM if we have them
                for (const name in connectorMap) {
                    if (connectorMap[name].connected && !connectorMap[name].used) {
                        connector = name;
                        connectorMap[name].used = true;
                        break;
                    }
                }
            }

            const isPrimary = (i === Main.layoutManager.primaryIndex);

            // Include all monitors for software brightness (including internal)
            // User explicitly wants software brightness control
            if (connector) {
                const monitorGeom = display.get_monitor_geometry(i);
                const monitorInfo = {
                    index: i,
                    connector: connector,
                    x: monitorGeom.x,
                    y: monitorGeom.y,
                    width: monitorGeom.width,
                    height: monitorGeom.height,
                    isPrimary: isPrimary,
                    isExternal: !connector.startsWith('eDP') && !connector.startsWith('LVDS'),
                    displayName: this._getDisplayName(connector)
                };
                this._externalMonitors.push(monitorInfo);
            }
        }

        // Store detected monitors in settings
        const connectors = this._externalMonitors.map(m => m.connector);
        this._settings.set_string('detected-monitors', JSON.stringify(connectors));
    }

    _getDisplayName(connector) {
        // Make connector names more user-friendly
        if (connector.startsWith('HDMI')) {
            const num = connector.replace(/[^0-9]/g, '') || '1';
            return `HDMI ${num}`;
        } else if (connector.startsWith('DP')) {
            const num = connector.replace(/[^0-9]/g, '') || '1';
            return `DisplayPort ${num}`;
        } else if (connector.startsWith('USB')) {
            return `USB-C Display`;
        }
        return connector;
    }

    _detectDDC() {
        this._ddcBusMap = {};
        this._ddcAvailableMap = {};

        let proc;
        try {
            proc = Gio.Subprocess.new(['ddcutil', 'detect', '--brief'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            // ddcutil not installed: overlay mode only
            return;
        }

        proc.communicate_utf8_async(null, this._cancellable, (p, res) => {
            let stdout;
            try {
                [, stdout] = p.communicate_utf8_finish(res);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.error(`Brightness Control: DDC detection failed: ${e.message}`);
                return;
            }
            if (!p.get_successful() || !stdout)
                return;

            let currentBus = null;
            let currentConnector = null;
            for (const line of stdout.split('\n')) {
                const busMatch = line.match(/I2C bus:\s+\/dev\/i2c-(\d+)/);
                if (busMatch)
                    currentBus = busMatch[1];

                const connectorMatch = line.match(/DRM connector:\s+card\d+-(.+)/);
                if (connectorMatch)
                    currentConnector = connectorMatch[1];

                // A valid display reports a VCP version
                if (line.includes('VCP version') && currentBus && currentConnector) {
                    const normalized = this._normalizeConnector(currentConnector);
                    this._ddcBusMap[normalized] = currentBus;
                    this._ddcAvailableMap[normalized] = true;
                }

                if (line.match(/^Display \d+/) || line.match(/^Invalid display/)) {
                    currentBus = null;
                    currentConnector = null;
                }
            }

            this._settings.set_string('monitor-ddc-bus', JSON.stringify(this._ddcBusMap));
            this._rebuildMenu();
            this._applyAllBrightness();
        });
    }

    _normalizeConnector(connector) {
        // Convert DRM connector names to xrandr-style names
        // HDMI-A-1 -> HDMI-1, DP-1 -> DP-1
        return connector.replace('-A-', '-').replace('-B-', '-');
    }

    _buildMenu() {
        // Clear existing menu
        this.menu.removeAll();
        this._monitorItems = {};

        // Title
        const titleItem = new PopupMenu.PopupMenuItem('Brightness Control', {
            reactive: false,
            style_class: 'popup-menu-title'
        });
        titleItem.label.style = 'font-weight: bold; font-size: 1.1em;';
        this.menu.addMenuItem(titleItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const syncMode = this._settings.get_boolean('sync-all-monitors');
        const brightnessData = this._getMonitorBrightness();

        if (this._externalMonitors.length === 0) {
            // No monitors detected
            const noMonitorItem = new PopupMenu.PopupMenuItem('No monitors detected', {
                reactive: false
            });
            noMonitorItem.label.style = 'font-style: italic; color: #888;';
            this.menu.addMenuItem(noMonitorItem);
        } else if (syncMode) {
            // Single slider for all monitors
            const globalBrightness = this._settings.get_int('brightness-level');
            this._globalSliderItem = new GlobalBrightnessItem(globalBrightness, (value) => {
                this._onGlobalBrightnessChanged(value);
            });
            this.menu.addMenuItem(this._globalSliderItem);

            // Show monitor list (non-interactive)
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            for (const monitor of this._externalMonitors) {
                const ddcAvail = this._ddcAvailableMap[monitor.connector] || false;
                const infoItem = new PopupMenu.PopupMenuItem(
                    `${monitor.displayName} (${ddcAvail ? 'DDC' : 'Software'})`,
                    { reactive: false }
                );
                infoItem.label.style = 'font-size: 0.9em; color: #aaa;';
                this.menu.addMenuItem(infoItem);
            }
        } else {
            // Individual sliders for each monitor
            for (const monitor of this._externalMonitors) {
                const brightness = brightnessData[monitor.connector] || 100;
                const ddcAvail = this._ddcAvailableMap[monitor.connector] || false;

                const item = new MonitorBrightnessItem(
                    monitor.connector,
                    monitor.displayName,
                    brightness,
                    ddcAvail,
                    (connector, value) => {
                        this._onMonitorBrightnessChanged(connector, value);
                    }
                );
                this.menu.addMenuItem(item);
                this._monitorItems[monitor.connector] = item;

                // Add small separator between monitors
                if (this._externalMonitors.indexOf(monitor) < this._externalMonitors.length - 1) {
                    const sep = new PopupMenu.PopupSeparatorMenuItem();
                    sep.style = 'margin: 2px 0;';
                    this.menu.addMenuItem(sep);
                }
            }
        }

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Quick presets submenu
        this._presetsMenu = new PopupMenu.PopupSubMenuMenuItem('Presets');

        const presets = [
            { label: '100% (Full)', value: 100 },
            { label: '75%', value: 75 },
            { label: '50%', value: 50 },
            { label: '25% (Night)', value: 25 },
            { label: '10% (Dim)', value: 10 }
        ];

        presets.forEach(preset => {
            const item = new PopupMenu.PopupMenuItem(preset.label);
            item.connect('activate', () => {
                this._setAllBrightness(preset.value);
            });
            this._presetsMenu.menu.addMenuItem(item);
        });

        this.menu.addMenuItem(this._presetsMenu);

        // Sync toggle
        const syncItem = new PopupMenu.PopupSwitchMenuItem(
            'Sync All Monitors',
            this._settings.get_boolean('sync-all-monitors')
        );
        syncItem.connect('toggled', (item) => {
            this._settings.set_boolean('sync-all-monitors', item.state);
        });
        this.menu.addMenuItem(syncItem);

        // Refresh monitors
        const refreshItem = new PopupMenu.PopupMenuItem('Refresh Monitors');
        refreshItem.connect('activate', () => {
            this._onMonitorsChanged();
        });
        this.menu.addMenuItem(refreshItem);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings
        const settingsItem = new PopupMenu.PopupMenuItem('Settings');
        settingsItem.connect('activate', () => {
            this._openSettings();
        });
        this.menu.addMenuItem(settingsItem);
    }

    _rebuildMenu() {
        this._buildMenu();
    }

    _getMonitorBrightness() {
        try {
            return JSON.parse(this._settings.get_string('monitor-brightness'));
        } catch (e) {
            return {};
        }
    }

    _setMonitorBrightness(connector, value) {
        const data = this._getMonitorBrightness();
        data[connector] = value;
        this._settings.set_string('monitor-brightness', JSON.stringify(data));
    }

    _onMonitorBrightnessChanged(connector, value) {
        this._setMonitorBrightness(connector, value);
        this._applyBrightness(connector, value);
        this._updatePanelLabel();
    }

    _onGlobalBrightnessChanged(value) {
        this._settings.set_int('brightness-level', value);
        for (const monitor of this._externalMonitors) {
            this._setMonitorBrightness(monitor.connector, value);
            this._applyBrightness(monitor.connector, value);
        }
        this._updatePanelLabel();
    }

    _setAllBrightness(value) {
        this._settings.set_int('brightness-level', value);
        for (const monitor of this._externalMonitors) {
            this._setMonitorBrightness(monitor.connector, value);
            this._applyBrightness(monitor.connector, value);

            // Update UI
            if (this._monitorItems[monitor.connector]) {
                this._monitorItems[monitor.connector].setValue(value);
            }
        }
        if (this._globalSliderItem) {
            this._globalSliderItem.setValue(value);
        }
        this._updatePanelLabel();
    }

    _createAllOverlays() {
        // Remove existing overlays
        for (const connector in _brightnessOverlays) {
            if (_brightnessOverlays[connector]) {
                Main.layoutManager.removeChrome(_brightnessOverlays[connector]);
                _brightnessOverlays[connector].destroy();
            }
        }
        _brightnessOverlays = {};

        // Create overlay for each external monitor
        for (const monitor of this._externalMonitors) {
            this._createOverlay(monitor);
        }
    }

    _createOverlay(monitor) {
        const overlay = new St.Bin({
            style: 'background-color: rgba(0, 0, 0, 0);',
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            reactive: false,
            can_focus: false
        });

        Main.layoutManager.addChrome(overlay, {
            trackFullscreen: false
        });

        _brightnessOverlays[monitor.connector] = overlay;
    }

    _applyAllBrightness() {
        const brightnessData = this._getMonitorBrightness();
        const syncMode = this._settings.get_boolean('sync-all-monitors');
        const globalBrightness = this._settings.get_int('brightness-level');

        for (const monitor of this._externalMonitors) {
            const brightness = syncMode ? globalBrightness : (brightnessData[monitor.connector] || 100);
            this._applyBrightness(monitor.connector, brightness);
        }
    }

    _applyBrightness(connector, level) {
        const method = this._settings.get_string('preferred-method');
        const ddcAvailable = this._ddcAvailableMap[connector] || false;

        if (method === 'auto') {
            if (ddcAvailable) {
                this._applyDDCBrightness(connector, level);
            } else {
                this._applyOverlayBrightness(connector, level);
            }
        } else if (method === 'ddc' && ddcAvailable) {
            this._applyDDCBrightness(connector, level);
        } else {
            this._applyOverlayBrightness(connector, level);
        }
    }

    _applyOverlayBrightness(connector, level) {
        const overlay = _brightnessOverlays[connector];
        if (!overlay) {
            // Try to recreate overlay
            const monitor = this._externalMonitors.find(m => m.connector === connector);
            if (monitor) {
                this._createOverlay(monitor);
            }
            return;
        }

        // Calculate opacity (0% brightness = max darkness, 100% = transparent)
        const darkness = (100 - level) / 100;
        const opacity = Math.min(darkness * 0.9, 0.9);

        overlay.style = `background-color: rgba(0, 0, 0, ${opacity});`;
        overlay.show();
    }

    _applyDDCBrightness(connector, level) {
        const bus = this._ddcBusMap[connector];
        if (!bus) {
            this._applyOverlayBrightness(connector, level);
            return;
        }

        try {
            Gio.Subprocess.new(['ddcutil', '--bus', String(bus), 'setvcp', '10', String(level)],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);

            // Hide overlay when using DDC
            const overlay = _brightnessOverlays[connector];
            if (overlay) {
                overlay.style = 'background-color: rgba(0, 0, 0, 0);';
            }
        } catch (e) {
            console.error(`Brightness Control: DDC failed for ${connector}: ${e.message}`);
            this._ddcAvailableMap[connector] = false;
            this._applyOverlayBrightness(connector, level);
        }
    }

    _onMonitorsChanged() {
        // Re-detect monitors
        this._detectMonitors();
        this._detectDDC();

        // Recreate overlays
        this._createAllOverlays();

        // Rebuild menu
        this._rebuildMenu();

        // Apply brightness to new configuration
        this._applyAllBrightness();
    }

    _updatePanelLabel() {
        if (!this._settings.get_boolean('show-percentage')) {
            return;
        }

        const brightnessData = this._getMonitorBrightness();
        const syncMode = this._settings.get_boolean('sync-all-monitors');

        if (syncMode || this._externalMonitors.length <= 1) {
            // Show single value
            const globalBrightness = this._settings.get_int('brightness-level');
            const brightness = syncMode ? globalBrightness :
                (this._externalMonitors.length > 0 ?
                    (brightnessData[this._externalMonitors[0].connector] || 100) : 100);
            this._label.text = `${brightness}%`;
        } else {
            // Show count of monitors
            this._label.text = `${this._externalMonitors.length}`;
        }

        // Update icon based on average brightness
        let avgBrightness = 100;
        if (this._externalMonitors.length > 0) {
            let total = 0;
            for (const m of this._externalMonitors) {
                total += brightnessData[m.connector] || 100;
            }
            avgBrightness = total / this._externalMonitors.length;
        }

        if (avgBrightness <= 25) {
            this._icon.icon_name = 'display-brightness-low-symbolic';
        } else if (avgBrightness <= 75) {
            this._icon.icon_name = 'display-brightness-medium-symbolic';
        } else {
            this._icon.icon_name = 'display-brightness-symbolic';
        }
    }

    _onScrollEvent(event) {
        const step = this._settings.get_int('step-size');
        const syncMode = this._settings.get_boolean('sync-all-monitors');
        let delta = 0;

        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                delta = step;
                break;
            case Clutter.ScrollDirection.DOWN:
                delta = -step;
                break;
            default:
                return Clutter.EVENT_PROPAGATE;
        }

        if (syncMode || this._externalMonitors.length === 0) {
            // Adjust global brightness
            let level = this._settings.get_int('brightness-level');
            level = Math.max(0, Math.min(100, level + delta));
            this._settings.set_int('brightness-level', level);
            this._onGlobalBrightnessChanged(level);
        } else {
            // Adjust all monitors individually by same amount
            const brightnessData = this._getMonitorBrightness();
            for (const monitor of this._externalMonitors) {
                let level = brightnessData[monitor.connector] || 100;
                level = Math.max(0, Math.min(100, level + delta));
                this._setMonitorBrightness(monitor.connector, level);
                this._applyBrightness(monitor.connector, level);

                if (this._monitorItems[monitor.connector]) {
                    this._monitorItems[monitor.connector].setValue(level);
                }
            }
        }

        this._updatePanelLabel();
        return Clutter.EVENT_STOP;
    }

    _openSettings() {
        this._extension.openPreferences();
    }

    destroy() {
        this._cancellable.cancel();

        // Disconnect settings
        for (const id of this._settingsConnections) {
            this._settings.disconnect(id);
        }
        this._settingsConnections = [];

        // Disconnect monitor changes
        if (this._monitorChangedId) {
            Main.layoutManager.disconnect(this._monitorChangedId);
            this._monitorChangedId = null;
        }

        // Remove all overlays
        for (const connector in _brightnessOverlays) {
            if (_brightnessOverlays[connector]) {
                Main.layoutManager.removeChrome(_brightnessOverlays[connector]);
                _brightnessOverlays[connector].destroy();
            }
        }
        _brightnessOverlays = {};

        super.destroy();
    }
});

export default class BrightnessControlExtension extends Extension {
    enable() {
        this._indicator = new BrightnessIndicator(this);
        Main.panel.addToStatusArea('brightness-control', this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        // Ensure all overlays are removed
        for (const connector in _brightnessOverlays) {
            if (_brightnessOverlays[connector]) {
                Main.layoutManager.removeChrome(_brightnessOverlays[connector]);
                _brightnessOverlays[connector].destroy();
            }
        }
        _brightnessOverlays = {};
    }
}
