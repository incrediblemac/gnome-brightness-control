// Brightness Control Extension - Preferences
// Version 2.0 - Multi-monitor support

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BrightnessControlPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // General Settings Page
        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic'
        });
        window.add(generalPage);

        // Behavior Settings Group
        const behaviorGroup = new Adw.PreferencesGroup({
            title: 'Behavior',
            description: 'Configure brightness control behavior'
        });
        generalPage.add(behaviorGroup);

        // Sync all monitors toggle
        const syncRow = new Adw.SwitchRow({
            title: 'Sync All Monitors',
            subtitle: 'Use a single brightness level for all external monitors'
        });
        behaviorGroup.add(syncRow);
        settings.bind('sync-all-monitors', syncRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        // Step size
        const stepRow = new Adw.ActionRow({
            title: 'Step Size',
            subtitle: 'Amount to adjust per scroll/keystroke (1-25%)'
        });
        behaviorGroup.add(stepRow);

        const stepAdjust = new Gtk.Adjustment({
            lower: 1,
            upper: 25,
            step_increment: 1,
            value: settings.get_int('step-size')
        });

        const stepSpin = new Gtk.SpinButton({
            adjustment: stepAdjust,
            valign: Gtk.Align.CENTER
        });

        settings.bind('step-size', stepAdjust, 'value', Gio.SettingsBindFlags.DEFAULT);
        stepRow.add_suffix(stepSpin);

        // Display Settings Group
        const displayGroup = new Adw.PreferencesGroup({
            title: 'Panel Display',
            description: 'Configure panel appearance'
        });
        generalPage.add(displayGroup);

        // Show percentage toggle
        const percentageRow = new Adw.SwitchRow({
            title: 'Show Percentage',
            subtitle: 'Display brightness percentage in the panel'
        });
        displayGroup.add(percentageRow);
        settings.bind('show-percentage', percentageRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        // Method Settings Group
        const methodGroup = new Adw.PreferencesGroup({
            title: 'Control Method',
            description: 'Choose how brightness is adjusted'
        });
        generalPage.add(methodGroup);

        // Method dropdown
        const methodRow = new Adw.ComboRow({
            title: 'Default Method',
            subtitle: 'Auto uses DDC when available, falls back to software overlay'
        });
        methodGroup.add(methodRow);

        const methodModel = new Gtk.StringList();
        methodModel.append('Auto (Recommended)');
        methodModel.append('Software Overlay Only');
        methodModel.append('DDC/CI Only (Hardware)');

        methodRow.set_model(methodModel);

        const methodMap = { 'auto': 0, 'overlay': 1, 'ddc': 2 };
        const reverseMethodMap = ['auto', 'overlay', 'ddc'];

        const currentMethod = settings.get_string('preferred-method');
        methodRow.set_selected(methodMap[currentMethod] || 0);

        methodRow.connect('notify::selected', () => {
            const selected = methodRow.get_selected();
            settings.set_string('preferred-method', reverseMethodMap[selected]);
        });

        // Method info
        const methodInfoRow = new Adw.ActionRow({
            title: 'Method Legend',
            subtitle: 'DDC = Hardware control (best quality)\nSW = Software overlay (always works)'
        });
        methodGroup.add(methodInfoRow);

        // Monitors Page
        const monitorsPage = new Adw.PreferencesPage({
            title: 'Monitors',
            icon_name: 'video-display-symbolic'
        });
        window.add(monitorsPage);

        // Detected Monitors Group
        const monitorsGroup = new Adw.PreferencesGroup({
            title: 'Detected External Monitors',
            description: 'Monitors detected via HDMI, DisplayPort, or USB-C'
        });
        monitorsPage.add(monitorsGroup);

        // Get detected monitors
        let detectedMonitors = [];
        try {
            detectedMonitors = JSON.parse(settings.get_string('detected-monitors'));
        } catch (e) {
            detectedMonitors = [];
        }

        // Get DDC bus info
        let ddcBusMap = {};
        try {
            ddcBusMap = JSON.parse(settings.get_string('monitor-ddc-bus'));
        } catch (e) {
            ddcBusMap = {};
        }

        // Get per-monitor brightness
        let monitorBrightness = {};
        try {
            monitorBrightness = JSON.parse(settings.get_string('monitor-brightness'));
        } catch (e) {
            monitorBrightness = {};
        }

        if (detectedMonitors.length === 0) {
            const noMonitorsRow = new Adw.ActionRow({
                title: 'No External Monitors Detected',
                subtitle: 'Connect external monitors via HDMI, DisplayPort, or USB-C'
            });
            monitorsGroup.add(noMonitorsRow);
        } else {
            for (const connector of detectedMonitors) {
                const displayName = this._getDisplayName(connector);
                const hasDDC = ddcBusMap[connector] !== undefined;
                const ddcBus = ddcBusMap[connector] || 'N/A';
                const brightness = monitorBrightness[connector] || 100;

                const monitorRow = new Adw.ExpanderRow({
                    title: displayName,
                    subtitle: `${connector} - ${hasDDC ? 'DDC Available (Bus ' + ddcBus + ')' : 'Software Only'}`
                });
                monitorsGroup.add(monitorRow);

                // Brightness slider for this monitor
                const brightnessRow = new Adw.ActionRow({
                    title: 'Brightness'
                });
                monitorRow.add_row(brightnessRow);

                const brightnessAdjust = new Gtk.Adjustment({
                    lower: 0,
                    upper: 100,
                    step_increment: 5,
                    page_increment: 10,
                    value: brightness
                });

                const brightnessScale = new Gtk.Scale({
                    adjustment: brightnessAdjust,
                    hexpand: true,
                    draw_value: true,
                    value_pos: Gtk.PositionType.RIGHT,
                    digits: 0
                });
                brightnessScale.set_size_request(200, -1);

                brightnessAdjust.connect('value-changed', () => {
                    const value = Math.round(brightnessAdjust.get_value());
                    let data = {};
                    try {
                        data = JSON.parse(settings.get_string('monitor-brightness'));
                    } catch (e) {
                        data = {};
                    }
                    data[connector] = value;
                    settings.set_string('monitor-brightness', JSON.stringify(data));
                });

                brightnessRow.add_suffix(brightnessScale);

                // DDC status row
                const ddcStatusRow = new Adw.ActionRow({
                    title: 'DDC/CI Status',
                    subtitle: hasDDC
                        ? `Hardware control available on i2c bus ${ddcBus}`
                        : 'Not available - using software overlay'
                });
                monitorRow.add_row(ddcStatusRow);

                // Add DDC status icon
                const ddcIcon = new Gtk.Image({
                    icon_name: hasDDC ? 'emblem-ok-symbolic' : 'dialog-warning-symbolic',
                    valign: Gtk.Align.CENTER
                });
                ddcStatusRow.add_suffix(ddcIcon);
            }
        }

        // Refresh button
        const refreshGroup = new Adw.PreferencesGroup();
        monitorsPage.add(refreshGroup);

        const refreshRow = new Adw.ActionRow({
            title: 'Refresh Monitor List',
            subtitle: 'Re-scan for connected monitors (requires extension restart)',
            activatable: true
        });
        refreshGroup.add(refreshRow);

        const refreshIcon = new Gtk.Image({
            icon_name: 'view-refresh-symbolic',
            valign: Gtk.Align.CENTER
        });
        refreshRow.add_suffix(refreshIcon);

        refreshRow.connect('activated', () => {
            // Show a toast or notification
            const toast = new Adw.Toast({
                title: 'Monitors will be rescanned when extension reloads'
            });
            window.add_toast(toast);
        });

        // About Page
        const aboutPage = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic'
        });
        window.add(aboutPage);

        const aboutGroup = new Adw.PreferencesGroup({
            title: 'Brightness Control'
        });
        aboutPage.add(aboutGroup);

        const versionRow = new Adw.ActionRow({
            title: 'Version',
            subtitle: '2.0'
        });
        aboutGroup.add(versionRow);

        const descRow = new Adw.ActionRow({
            title: 'Description',
            subtitle: 'Multi-monitor brightness control for external displays\nSupports HDMI, DisplayPort, and USB-C connections'
        });
        aboutGroup.add(descRow);

        const featuresRow = new Adw.ActionRow({
            title: 'Features',
            subtitle: '- Individual brightness per monitor\n- DDC/CI hardware control when available\n- Software overlay fallback\n- Sync all monitors option\n- Scroll wheel support'
        });
        aboutGroup.add(featuresRow);

        // Troubleshooting
        const troubleGroup = new Adw.PreferencesGroup({
            title: 'Troubleshooting'
        });
        aboutPage.add(troubleGroup);

        const ddcTipRow = new Adw.ActionRow({
            title: 'DDC/CI Not Working?',
            subtitle: 'Ensure ddcutil is installed and user is in i2c group:\nsudo apt install ddcutil\nsudo usermod -aG i2c $USER'
        });
        troubleGroup.add(ddcTipRow);

        const overlayTipRow = new Adw.ActionRow({
            title: 'Software Overlay',
            subtitle: 'Works on all monitors but reduces perceived brightness\nby darkening the screen (not true backlight control)'
        });
        troubleGroup.add(overlayTipRow);
    }

    _getDisplayName(connector) {
        if (connector.startsWith('HDMI')) {
            const num = connector.replace(/[^0-9]/g, '') || '1';
            return `HDMI Monitor ${num}`;
        } else if (connector.startsWith('DP')) {
            const num = connector.replace(/[^0-9]/g, '') || '1';
            return `DisplayPort ${num}`;
        } else if (connector.startsWith('USB')) {
            return `USB-C Display`;
        }
        return connector;
    }
}
