# GNOME Extension Store Publishing Checklist

Based on https://gjs.guide/extensions/review-guidelines/review-guidelines.html

## Critical Issues (Must Fix)

### 1. UUID Namespace
- **Current:** `brightness-control@local`
- **Problem:** `@local` is not valid for the store
- **Fix:** Change to `brightness-control@yourusername.github.io` or similar
- **Files:** `metadata.json`, folder name

### 2. Shell Versions
- **Current:** `["45", "46", "47", "48", "49"]`
- **Problem:** Only stable releases + max 1 development release allowed
- **Fix:** Remove `48`, `49` (or check which are currently stable)
- **File:** `metadata.json`

### 3. Synchronous Command Execution
- **Location:** `extension.js:358`
- **Problem:** `GLib.spawn_command_line_sync()` blocks GNOME Shell
- **Fix:** Use `Gio.Subprocess` with async methods
```javascript
// Replace this:
const [success, stdout, stderr, status] = GLib.spawn_command_line_sync('ddcutil detect --brief');

// With async version using Gio.Subprocess
```

### 4. Missing LICENSE File
- **Problem:** No license file included
- **Fix:** Add `LICENSE` file with GPL-2.0-or-later (or compatible)

## High Priority Issues

### 5. Excessive Logging
- **Locations:** Lines 217, 242, 329, 349, 367, 376, 409
- **Problem:** Extensions must not print excessively to log
- **Fix:** Remove or wrap in debug flag:
```javascript
// Remove these log() calls or use:
if (this._debug) log('...');
```

### 6. Hardcoded DDC Bus Number
- **Location:** `extension.js:338`
- **Current:** `const bus = '5';`
- **Problem:** Won't work on other systems
- **Fix:** Detect bus dynamically from `ddcutil detect` output

## Medium Priority Issues

### 7. Global Variable
- **Location:** `extension.js:17`
- **Current:** `let _brightnessOverlay = null;`
- **Problem:** Should be managed within extension class
- **Fix:** Move to `this._brightnessOverlay` in BrightnessIndicator class

## Recommended Additions

### 8. Metadata URL
Add repository URL to `metadata.json`:
```json
{
  "url": "https://github.com/username/brightness-control"
}
```

### 9. Gettext Domain (for translations)
```json
{
  "gettext-domain": "brightness-control"
}
```

## Submission Checklist

- [ ] Fix UUID namespace
- [ ] Update shell-version to stable releases only
- [ ] Replace sync spawn with async
- [ ] Add LICENSE file
- [ ] Remove excessive logging
- [ ] Fix hardcoded DDC bus
- [ ] Move global variable into class
- [ ] Add metadata URL
- [ ] Create extension icon (optional but recommended)
- [ ] Prepare screenshots for store listing
- [ ] Write proper description for store
- [ ] Test on clean GNOME Shell installation

## Store Submission

1. Create a zip file: `gnome-extensions pack`
2. Go to https://extensions.gnome.org/upload/
3. Upload the zip file
4. Wait for review (can take days to weeks)

## Review Guidelines Summary

- All objects/signals must be cleaned up in `disable()`
- No deprecated modules (ByteArray, Lang, Mainloop)
- No GTK imports in extension.js (only in prefs.js)
- No minified/obfuscated code
- Schema ID must use `org.gnome.shell.extensions` base
- No telemetry or user tracking
- Must be functional and have a purpose
