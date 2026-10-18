# Local Android build on Windows: prebuild -> Gradle -> install over USB.
# Usage (repo root):  powershell -File tools/android-local.ps1 [-Clean] [-Release]
#   -Clean    regenerate android/ (after native dependency or app config changes) and drop native build caches.
#   -Release  optimised build with the JS bundled in (no Metro): how the app really feels, and it
#             works away from the PC (e.g. via Tailscale). Signed with the debug key, so it installs
#             over the dev build and keeps the sign-in.
#   -Store    Play Store bundle (.aab, all ABIs) signed with the EAS upload keystore, using the
#             values in apps/mobile/.env.store (see .env.store.example): HTTPS API, no cleartext.
#             Always regenerates android/; the next test build regenerates it again. Not installed.
#             Bump android.versionCode in app.json before each upload.
#   default   dev build that loads JS from Metro.
# Needs: JDK 17, Android SDK (platform 37, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.31.6), a phone with
# USB debugging, and Metro running (`pnpm --filter @shootspot/mobile start --dev-client`).
# CMake 3.31 is required: the SDK default 3.22 loops forever ("build.ninja still dirty") on pnpm's linked folders.
param([switch]$Clean, [switch]$Release, [switch]$Store)
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $repo 'apps\mobile'

# Store values override apps/mobile/.env: Expo never overwrites variables already in the process.
if ($Store) {
  $envFile = Join-Path $mobile '.env.store'
  if (-not (Test-Path $envFile)) { throw "Missing $envFile (copy .env.store.example)" }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$') { Set-Item "env:$($Matches[1])" $Matches[2] }
  }
  if ($env:EXPO_PUBLIC_API_URL -notlike 'https://*') { throw 'EXPO_PUBLIC_API_URL in .env.store must be https' }
  foreach ($k in 'EXPO_PUBLIC_SENTRY_DSN', 'SHOOTSPOT_UPLOAD_STORE_FILE', 'SHOOTSPOT_UPLOAD_STORE_PASSWORD',
    'SHOOTSPOT_UPLOAD_KEY_ALIAS', 'SHOOTSPOT_UPLOAD_KEY_PASSWORD') {
    if (-not (Get-Item "env:$k" -ErrorAction SilentlyContinue)) { throw "$k is not set in .env.store" }
  }
  if (-not (Test-Path $env:SHOOTSPOT_UPLOAD_STORE_FILE)) { throw "Keystore not found: $env:SHOOTSPOT_UPLOAD_STORE_FILE" }
}
$mode = if ($Store) { 'store' } else { 'test' }
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$cmake = Join-Path $sdk 'cmake\3.31.6'
$env:ANDROID_HOME = $sdk
if (-not $env:JAVA_HOME) {
  $env:JAVA_HOME = Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-17*' |
    Select-Object -First 1 -ExpandProperty FullName
}
$env:Path = "$env:JAVA_HOME\bin;$sdk\platform-tools;$env:Path"
foreach ($p in $env:JAVA_HOME, $cmake) { if (-not (Test-Path $p)) { throw "Missing: $p" } }
# Target the first USB phone; ignore offline emulator entries.
if (-not $env:ANDROID_SERIAL) {
  $env:ANDROID_SERIAL = (adb devices | Select-String '^(\S+)\s+device$' | Where-Object { $_ -notmatch '^emulator' } |
    Select-Object -First 1 | ForEach-Object { $_.Matches[0].Groups[1].Value })
}
$phone = [bool]$env:ANDROID_SERIAL -and -not $Store
if (-not $phone -and -not $Store) { Write-Host 'No phone connected: building only (install skipped).' }

Set-Location $mobile
# android/ is generated with the build's API URL and cleartext setting, so switching between store
# and test builds regenerates it.
$marker = 'android\.shootspot-mode'
$lastMode = if (Test-Path $marker) { (Get-Content $marker -Raw).Trim() } else { 'test' }
if ($Store -or $lastMode -ne $mode) { $Clean = $true }
if ($Clean -or -not (Test-Path 'android')) {
  npx expo prebuild --platform android --clean
  if ($LASTEXITCODE) { throw "Prebuild failed ($LASTEXITCODE)" }
  Set-Content -Encoding ascii $marker $mode
  Get-ChildItem (Join-Path $repo 'node_modules\.pnpm') -Directory |
    ForEach-Object { Join-Path $_.FullName 'node_modules' } |
    Get-ChildItem -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'android\.cxx' } |
    Where-Object { Test-Path $_ } |
    ForEach-Object { Remove-Item -Recurse -Force $_ }
}

# Machine-specific Gradle settings (android/ is generated and gitignored).
$esc = { param($s) $s.Replace('\', '\\').Replace(':', '\:') }
Set-Content -Encoding ascii 'android\local.properties' @(
  "sdk.dir=$(& $esc $sdk)",
  "cmake.dir=$(& $esc $cmake)"
)

Push-Location android
try {
  # Only the connected phone's ABI: about half the native compile time of all four.
  $abi = if ($phone) { (adb shell getprop ro.product.cpu.abi 2>$null | Out-String).Trim() } else { '' }
  if (-not $abi) { $abi = 'arm64-v8a' }
  $task = if ($Store) { 'bundleRelease' } elseif ($Release) { 'assembleRelease' } else { 'assembleDebug' }
  # Store bundles carry every ABI and are signed with the upload key (AGP's injected signing,
  # as Android Studio does), so the generated build.gradle stays untouched.
  $gradleArgs = if ($Store) {
    @("-Pandroid.injected.signing.store.file=$env:SHOOTSPOT_UPLOAD_STORE_FILE",
      "-Pandroid.injected.signing.store.password=$env:SHOOTSPOT_UPLOAD_STORE_PASSWORD",
      "-Pandroid.injected.signing.key.alias=$env:SHOOTSPOT_UPLOAD_KEY_ALIAS",
      "-Pandroid.injected.signing.key.password=$env:SHOOTSPOT_UPLOAD_KEY_PASSWORD")
  } else { @("-PreactNativeArchitectures=$abi") }
  # Library build folders on a short path (Windows path limit; see the init script). It must end
  # in `android`: Expo's code generator refuses build folders outside an android directory.
  $env:SHOOTSPOT_GRADLE_BUILD_ROOT = Join-Path $env:USERPROFILE '.ssb\android'
  if ($Clean -and (Test-Path $env:SHOOTSPOT_GRADLE_BUILD_ROOT)) { Remove-Item -Recurse -Force $env:SHOOTSPOT_GRADLE_BUILD_ROOT }
  $init = Join-Path $PSScriptRoot 'android-short-build.gradle'
  .\gradlew.bat $task --console=plain --init-script $init @gradleArgs
  if ($LASTEXITCODE) { throw "Gradle failed ($LASTEXITCODE)" }
} finally { Pop-Location }

if ($Store) {
  $app = (Get-Content 'app.json' -Raw | ConvertFrom-Json).expo
  $outDir = New-Item -ItemType Directory -Force 'build-store'
  $aab = Join-Path $outDir "shootspot-$($app.version)-$($app.android.versionCode).aab"
  Copy-Item 'android\app\build\outputs\bundle\release\app-release.aab' $aab -Force
  Write-Host "Done: $aab (API $env:EXPO_PUBLIC_API_URL). Upload it in Play Console."
  exit 0
}

# adb reports install failures on stderr; handle them here instead of stopping.
$ErrorActionPreference = 'Continue'
$apk = if ($Release) { 'android\app\build\outputs\apk\release\app-release.apk' } else { 'android\app\build\outputs\apk\debug\app-debug.apk' }
if (-not $phone) {
  Write-Host "Built: $mobile\$apk. Connect the phone and run again (no -Clean) to install."
  exit 0
}
$out = adb install -r $apk 2>&1 | Out-String
if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match') {
  Write-Host 'Installed app has a different signature (EAS build): reinstalling. Sign in again afterwards.'
  adb uninstall com.shootspot.app | Out-Null
  $out = adb install $apk 2>&1 | Out-String
}
Write-Host $out.Trim()
if ($Release) {
  adb shell monkey -p com.shootspot.app -c android.intent.category.LAUNCHER 1 | Out-Null
  Write-Host 'Done: release build installed and opened (no Metro needed).'
  exit 0
}
adb reverse tcp:8081 tcp:8081 | Out-Null
adb shell am start -a android.intent.action.VIEW -d 'shootspot://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081' com.shootspot.app | Out-Null
Write-Host 'Done: app opened on Metro (localhost:8081 via adb reverse).'
