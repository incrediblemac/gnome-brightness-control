# Brightness Control Extension

Software-based brightness control for external monitors on Wayland (GNOME Shell 45+).

## Why This Extension Was Created

### The Problem

After Ubuntu moved to Wayland by default, existing brightness control extensions stopped working for external monitors. The issues encountered:

1. **DDC/CI Communication Failure** - The BenQ GW2780 monitor connected via HDMI shows "DDC communication failed" even though:
   - The `i2c-dev` module is loaded
   - User is in the `i2c` group
   - DDC/CI is enabled in monitor OSD
   - `ddcutil detect` can read EDID but fails on VCP commands

2. **Wayland Limitations** - Traditional X11 methods don't work:
   - `xrandr --brightness` doesn't work on Wayland
   - Gamma adjustment APIs aren't exposed to extensions
   - Many existing extensions rely on X11-only APIs

3. **AMD GPU + Wayland DDC Issues** - Known problem with AMD Display Core driver where DDC/CI commands fail even when the monitor is properly detected on the I2C bus.

### System Configuration

- **OS**: Ubuntu 25.10
- **Display Server**: Wayland (GNOME Shell 49.0)
- **GPU**: Dual GPU - NVIDIA GeForce RTX 3050 Mobile + AMD Radeon Vega
- **External Monitor**: BenQ GW2780 via HDMI (on AMD GPU, i2c-5)
- **Laptop Display**: AUO eDP-1 (uses `brightnessctl` successfully)

### DDC Diagnostic Output

```
$ ddcutil detect
Invalid display
   I2C bus:  /dev/i2c-5
   DRM connector:           card1-HDMI-A-1
   EDID synopsis:
      Mfg id:               BNQ - UNK
      Model:                BenQ GW2780
   DDC communication failed

$ sudo ddcutil --bus 5 getvcp 10
DDC communication failed for monitor on bus /dev/i2c-5
```

### The Solution

This extension bypasses the broken DDC/CI by using a **software overlay** - a semi-transparent black layer positioned over the external monitor. This works on Wayland without requiring any special hardware communication.

## Overview

This extension provides brightness control for external monitors when hardware DDC/CI isn't working. It uses a software overlay to dim the display, with fallback methods including color temperature adjustment and DDC retry.

## Installation

The extension is installed at:
```
~/.local/share/gnome-shell/extensions/brightness-control@incrediblemac.github.io/
```

### Enable the Extension

1. Log out and log back in (required for GNOME to detect new extensions on Wayland)
2. Run: `gnome-extensions enable brightness-control@incrediblemac.github.io`
3. Or use the Extensions app

## Features

- **Panel indicator** with brightness icon and percentage display
- **Dropdown menu** with brightness slider (0-100%)
- **Scroll support** - scroll on the panel icon to adjust brightness
- **Quick presets** - 100%, 75%, 50%, 25%, 10%
- **Multiple methods** - auto-selects the best working method
- **Settings UI** - configure behavior via preferences

## Brightness Control Methods

### 1. Software Overlay (Primary)
- Creates a semi-transparent black overlay on the external monitor
- Works on Wayland without any special permissions
- Instant response, no flicker

### 2. Color Temperature (Fallback)
- Uses GNOME's Night Light color settings
- Adjusts color temperature to simulate dimming
- Maps 0-100% brightness to 2700K-6500K

### 3. DDC/CI (Hardware)
- Periodically checks if DDC becomes available
- If working, uses `ddcutil` for true hardware brightness
- Requires `ddcutil` package and working DDC communication

## Files

```
brightness-control@incrediblemac.github.io/
├── metadata.json      # Extension metadata
├── extension.js       # Main extension logic
├── prefs.js          # Settings/preferences UI
├── stylesheet.css    # Visual styling
├── README.md         # This file
└── schemas/
    ├── org.gnome.shell.extensions.brightness-control.gschema.xml
    └── gschemas.compiled
```

## Settings

Access via: `gnome-extensions prefs brightness-control@incrediblemac.github.io`

| Setting | Description | Default |
|---------|-------------|---------|
| brightness-level | Current brightness (0-100) | 100 |
| preferred-method | Control method (auto/overlay/gamma/ddc) | auto |
| step-size | Adjustment per scroll (1-25) | 5 |
| show-percentage | Show % in panel | true |
| target-monitor | Monitor connector name | HDMI-A-1 |

## Technical Details

### How the Overlay Works

The extension creates a fullscreen `St.Bin` actor positioned over the external monitor. The overlay's background color opacity is adjusted based on brightness level:

- 100% brightness = fully transparent overlay
- 0% brightness = 90% black overlay (never fully black)

The overlay is added to GNOME's layout manager with `affectsInputRegion: false` so it doesn't block mouse/keyboard input.

### Monitor Detection

The extension identifies the external monitor by finding monitors that are not the primary display. It uses `Main.layoutManager.monitors` and targets monitors where index != `primaryIndex`.

### DDC Background Check

Every 30 seconds, the extension runs `ddcutil detect --brief` to check if DDC communication becomes available. If it does, it switches to hardware brightness control automatically.

## Known Issues & Limitations

### Wayland-Specific Issues

1. **No true hardware brightness** - Software overlay simulates dimming but doesn't reduce actual backlight power consumption
2. **Slight color shift** - At very low brightness levels, the overlay may make colors appear slightly washed out
3. **Per-session** - Extension needs to be enabled after each login (settings persist)

### DDC/CI Issues (Why Hardware Control Fails)

| Issue | Status | Workaround |
|-------|--------|------------|
| AMD DC driver DDC failure | Known bug | Use software overlay |
| HDMI DDC signal issues | Hardware dependent | Try different cable |
| Monitor DDC/CI disabled | User fixable | Enable in monitor OSD |
| i2c-dev not loaded | Fixable | `sudo modprobe i2c-dev` |

### What Doesn't Work on Wayland

- `xrandr --brightness` (X11 only)
- `xgamma` (X11 only)
- `redshift` brightness mode (X11 only)
- Direct gamma table manipulation
- Most legacy brightness extensions

## Troubleshooting

### Extension not showing in list
- Log out and log back in (required on Wayland for new extensions)
- Check: `ls ~/.local/share/gnome-shell/extensions/`
- Verify metadata.json is valid JSON

### Overlay not appearing
- Check GNOME Shell logs: `journalctl -f /usr/bin/gnome-shell`
- Verify monitor is detected: extension targets non-primary monitors
- Check if another extension is conflicting

### DDC not working
This is expected on many Wayland + AMD GPU setups. The extension will use software overlay instead.

To diagnose DDC issues:
```bash
# Load i2c module
sudo modprobe i2c-dev

# Check monitor detection
ddcutil detect

# Try with increased timing
sudo ddcutil --bus 5 getvcp 10 --sleep-multiplier 3

# Check kernel logs for i2c errors
dmesg | grep -i i2c
```

### Extension crashes GNOME Shell
- Disable from TTY: `Ctrl+Alt+F3`, login, then:
  ```bash
  gnome-extensions disable brightness-control@incrediblemac.github.io
  ```
- Check logs: `journalctl -b -g "brightness-control"`

## Dependencies

- GNOME Shell 45, 46, 47, 48, or 49
- Optional: `ddcutil` for hardware DDC control

## Version History

- **v1.0** - Initial release
  - Software overlay brightness control
  - Color temperature fallback
  - DDC/CI background detection
  - Panel indicator with slider
  - Settings preferences UI

## License

MIT License

## Author

Created for Ubuntu 25.10 with GNOME Shell 49.0 on Wayland.
