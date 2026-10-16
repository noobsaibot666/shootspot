# Local Android dev build on Windows: prebuild -> Gradle -> install over USB -> open on Metro.
# Usage (repo root):  powershell -File tools/android-local.ps1 [-Clean]
#   -Clean  regenerate android/ (after native dependency or app config changes) and drop native build caches.
# Needs: JDK 17, Android SDK (platform 37, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.31.6), a phone with
# USB debugging, and Metro running (`pnpm --filter @shootspot/mobile start --dev-client`).
# CMake 3.31 is required: the SDK default 3.22 loops forever ("build.ninja still dirty") on pnpm's linked folders.
param([switch]$Clean)
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $repo 'apps\mobile'
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
$phone = [bool]$env:ANDROID_SERIAL
if (-not $phone) { Write-Host 'No phone connected: building only (install skipped).' }

Set-Location $mobile
if ($Clean -or -not (Test-Path 'android')) {
  npx expo prebuild --platform android --clean
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
  .\gradlew.bat assembleDebug --console=plain "-PreactNativeArchitectures=$abi"
  if ($LASTEXITCODE) { throw "Gradle failed ($LASTEXITCODE)" }
} finally { Pop-Location }

# adb reports install failures on stderr; handle them here instead of stopping.
$ErrorActionPreference = 'Continue'
$apk = 'android\app\build\outputs\apk\debug\app-debug.apk'
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
adb reverse tcp:8081 tcp:8081 | Out-Null
adb shell am start -a android.intent.action.VIEW -d 'shootspot://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081' com.shootspot.app | Out-Null
Write-Host 'Done: app opened on Metro (localhost:8081 via adb reverse).'
