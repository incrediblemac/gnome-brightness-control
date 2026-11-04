# Brightness Control – GNOME Shell Extension for Ubuntu

Software brightness control for external monitors on Ubuntu 25.04 and 25.10 with Wayland.

> **Full guide with screenshots:** [techstoriesindia.com – Brightness Control GNOME Extension for Ubuntu](https://techstoriesindia.com/?p=8677)

---

## Why This Exists

Ubuntu's switch to Wayland as the default display server broke brightness control for external monitors. These tools no longer work on Wayland:

- `xrandr --brightness` — X11 only
- `xgamma` — X11 only
- Most legacy GNOME brightness extensions — depend on X11 APIs

DDC/CI (hardware brightness via I2C bus) is supposed to work on Wayland but fails silently on most AMD and NVIDIA+AMD hybrid GPU setups due to a known AMD Display Core driver bug.

This extension fixes it using a **software overlay** — a transparent layer positioned over the external monitor inside the GNOME compositor. No X11 needed. No root access needed.

---

## Features

- Per-monitor sliders in the top panel — each external display gets its own control
- Scroll on the panel icon to step brightness up/down
- Quick preset buttons: 100%, 75%, 50%, 25%, 10%
- Auto DDC/CI detection — switches to hardware brightness if your monitor supports it
- **DDC** (green) / **SW** (orange) badge per monitor so you know which method is active
- Sync mode — lock all monitors to the same brightness
- Settings page for step size, preferred method, target connector

---

## Compatibility

| Item | Supported |
|------|-----------|
| Ubuntu | 25.04, 25.10 |
| GNOME Shell | 48, 49, 50 |
| Display server | Wayland |
| GPU | Any (including NVIDIA + AMD hybrid) |
| Connections | HDMI, DisplayPort, USB-C |

---

## Installation

### Step 1 — Clone this repository

```bash
git clone https://github.com/incrediblemac/brightnesscontrollerubuntu.git
```

### Step 2 — Copy the extension to your GNOME extensions folder

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/
cp -r gnome-brightness-control/brightness-control@incrediblemac.github.io ~/.local/share/gnome-shell/extensions/
```

### Step 3 — Compile the GSettings schema

```bash
glib-compile-schemas ~/.local/share/gnome-shell/extensions/brightness-control@incrediblemac.github.io/schemas/
```

### Step 4 — Log out and log back in

On Wayland, GNOME Shell loads extensions at session start. A log out and log back in is required for the extension to appear in the list.

### Step 5 — Enable the extension

```bash
gnome-extensions enable brightness-control@incrediblemac.github.io
```

Or open the **Extensions** app from the GNOME app grid and toggle **Brightness Control** on.

The brightness icon will appear in your top panel immediately.

---

## Optional: Enable DDC/CI Hardware Brightness

If your monitor supports DDC/CI, install `ddcutil` to let the extension use hardware brightness control instead of the software overlay:

```bash
sudo apt install ddcutil
sudo modprobe i2c-dev
sudo usermod -aG i2c $USER
```

Log out and back in. The extension checks for DDC availability every 30 seconds — if it works on your setup, the badge next to that monitor's slider switches from **SW** to **DDC** automatically.

> DDC/CI fails on many AMD and hybrid GPU setups. The software overlay will be used as fallback automatically — no action needed.

---

## Settings

```bash
gnome-extensions prefs brightness-control@incrediblemac.github.io
```

| Setting | Description | Default |
|---------|-------------|---------|
| `brightness-level` | Current brightness 0–100 | 100 |
| `preferred-method` | auto / overlay / ddc | auto |
| `step-size` | Scroll step size 1–25 | 5 |
| `show-percentage` | Show % in panel | true |
| `sync-all-monitors` | Same brightness on all monitors | false |
| `target-monitor` | Connector name (e.g. HDMI-1) | HDMI-A-1 |

---

## Uninstall

```bash
gnome-extensions disable brightness-control@incrediblemac.github.io
rm -rf ~/.local/share/gnome-shell/extensions/brightness-control@incrediblemac.github.io
```

Log out and back in to complete removal.

---

## Known Limitations

- **No power savings** — the software overlay dims visually but does not reduce actual backlight power. Only DDC/CI hardware mode reduces real backlight output.
- **Internal display not affected** — targets external monitors only. The laptop's built-in display uses `brightnessctl` natively.
- **Wayland only** — on X11, use `xrandr --brightness` instead.

---

## Troubleshooting

**Extension not showing after install:**
Log out and back in. On Wayland this step is mandatory.

**Overlay not appearing on monitor:**
Check `journalctl -f /usr/bin/gnome-shell` for errors. Make sure the monitor is detected as non-primary.

**DDC not working:**
Expected on AMD + hybrid GPU setups. The software overlay handles it automatically. To diagnose:
```bash
ddcutil detect
sudo ddcutil --bus 5 getvcp 10 --sleep-multiplier 3
dmesg | grep -i i2c
```

**Extension crashes GNOME Shell:**
Disable from a TTY (`Ctrl+Alt+F3`):
```bash
gnome-extensions disable brightness-control@incrediblemac.github.io
```

---

## License

MIT

---

> **Full installation guide and background:** [techstoriesindia.com – Brightness Control GNOME Extension for Ubuntu Wayland](https://techstoriesindia.com/?p=8677)
