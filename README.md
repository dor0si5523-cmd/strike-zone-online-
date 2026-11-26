# STRIKE ZONE ONLINE

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

## Automated browser regression

```sh
npm test
```

Playwright starts a local server with an in-memory test account store. Test credentials and match results are not sent to the production member repository.

## Android Chrome audit

Connect an Android device with USB debugging enabled, then start the local app in test mode. For PowerShell:

```powershell
$env:NODE_ENV = 'test'
$env:SZ_TEST_LOCAL = '1'
$env:PORT = '3000'
npm start
```

In a second terminal, forward the app and Chrome DevTools ports over USB, open Chrome on the phone, then run the audit:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:3000 tcp:3000
& $adb forward tcp:9222 localabstract:chrome_devtools_remote
& $adb shell monkey -p com.android.chrome 1
node scripts/mobile-audit.cjs
```

The audit uses a disposable account held in the local test process. It records mobile layout, model dimensions, team assignment, AI movement and damage, touch movement/fire/reload, frame rate, JavaScript heap, console errors, and failed requests. The connected device must be in landscape orientation.
