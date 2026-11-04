# Brightness Control for Ubuntu 26.04, 25.10, 25.04 and 24.04 (GNOME Shell Extension)

Per-monitor brightness sliders for external monitors on Ubuntu with GNOME on Wayland.
It works on **any monitor, including ones without DDC/CI support**: if the monitor can't be
controlled over DDC/CI, the extension dims it with a software overlay instead.

> **Full guide:** [Brightness Control for Ubuntu 26.04 / 24.04 on techstoriesindia.com](https://techstoriesindia.com/brightness-control-ubuntu-26-04-24-04-external-monitor-gnome-extension/)

---

## What it does

GNOME on Wayland has no built-in brightness control for external monitors, and the old
X11 tricks (`xrandr --brightness`, `xgamma`) don't work on Wayland. This extension adds a
brightness menu to the top panel with a slider for each connected monitor.

It picks one of two methods per monitor:

| Method | Badge | How it works | Needs |
|--------|-------|--------------|-------|
| **DDC/CI (hardware)** | `DDC` (green) | Sends VCP code 0x10 (brightness) to the monitor over I2C via `ddcutil`. Changes the real backlight. | Monitor with DDC/CI on, `ddcutil`, `i2c-dev` |
| **Software overlay** | `SW` (orange) | Places a semi-transparent black layer over that monitor inside GNOME Shell. | Nothing |

DDC is detected automatically when GNOME Shell starts and whenever a monitor is plugged in
or removed. A monitor that doesn't answer DDC/CI (no DDC support, DDC turned off in the OSD,
some docks/adapters, or GPU drivers where DDC fails such as many AMD and NVIDIA+AMD hybrid
laptops) falls back to the software overlay with no setup.

## Features

- A slider per monitor in the top-panel menu
- Scroll on the panel icon to step brightness up and down
- Presets: 100%, 75%, 50%, 25% (Night), 10% (Dim)
- `DDC` / `SW` badge so you can see which method each monitor uses
- Sync mode: one slider for all monitors
- Settings window: step size, preferred method (auto / overlay / ddc), show percentage
- No root access needed for overlay mode

## Compatibility

| Ubuntu | GNOME Shell | Status |
|--------|-------------|--------|
| 26.04 LTS | 50 | Tested (Wayland) |
| 25.10 | 49 | Supported |
| 25.04 | 48 | Supported |
| 24.10 | 47 | Supported |
| 24.04 LTS | 46 | Supported |
| Other distros | 45 to 50 | Should work |

Any GPU (Intel, AMD, NVIDIA, hybrid) and any connection (HDMI, DisplayPort, USB-C).

## Install

### Option 1: release zip (recommended)

1. Download `brightness-control@incrediblemac.github.io.shell-extension.zip` from the
   [latest release](https://github.com/incrediblemac/gnome-brightness-control/releases/latest).
2. Install it:
   ```bash
   gnome-extensions install --force brightness-control@incrediblemac.github.io.shell-extension.zip
   ```
3. Log out and log back in (required on Wayland).
4. Enable it:
   ```bash
   gnome-extensions enable brightness-control@incrediblemac.github.io
   ```
   Or switch it on in the **Extensions** app.

### Option 2: from source

```bash
git clone https://github.com/incrediblemac/gnome-brightness-control.git
cd gnome-brightness-control
gnome-extensions pack brightness-control@incrediblemac.github.io --force
gnome-extensions install --force brightness-control@incrediblemac.github.io.shell-extension.zip
```

Then log out, log back in, and enable it as above.

## Optional: hardware brightness over DDC/CI

Skip this if your monitor has no DDC/CI. The overlay works without it.

```bash
sudo apt install ddcutil
sudo modprobe i2c-dev
echo i2c-dev | sudo tee /etc/modules-load.d/i2c-dev.conf
sudo usermod -aG i2c $USER
```

Turn on DDC/CI in the monitor's on-screen menu, then log out and back in. If
`ddcutil detect` lists your monitor, its badge switches from `SW` to `DDC`.

## Settings

```bash
gnome-extensions prefs brightness-control@incrediblemac.github.io
```

## Uninstall

```bash
gnome-extensions uninstall brightness-control@incrediblemac.github.io
```

## Limitations

- The software overlay dims the picture but doesn't lower the backlight, so it saves no
  power and blacks get darker along with everything else. Only DDC mode changes the backlight.
- Tested on GNOME on Wayland.
- Not published on extensions.gnome.org. Install from the releases page.

## Troubleshooting

- **Not showing after install:** log out and back in.
- **Errors:** `journalctl -b0 /usr/bin/gnome-shell | grep -i brightness`
- **DDC not detected:** run `ddcutil detect`. If it fails, the overlay is used automatically.
- **Shell problems:** from a TTY (`Ctrl+Alt+F3`) run
  `gnome-extensions disable brightness-control@incrediblemac.github.io`

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
