[CmdletBinding()]
param(
  [int]$Port = 18765,
  [string]$InstallDir,
  [switch]$AddToPath
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw (Join-Path $projectDir 'package.json') | ConvertFrom-Json
$version = $package.version
$releaseDir = (Resolve-Path (Join-Path $projectDir 'dist\releases')).Path
$installerPath = Join-Path $projectDir 'install.ps1'
$serverScript = Join-Path $PSScriptRoot 'serve-files.mjs'
$nodeCommand = Get-Command node.exe -All | Where-Object { $_.Source -notmatch '\\.vite-plus\\bin\\' } | Select-Object -First 1
if (-not $nodeCommand) {
  $nodeCommand = Get-Command node.exe
}
$nodePath = $nodeCommand.Source
$mirrorDir = Join-Path ([IO.Path]::GetTempPath()) "punch-installer-mirror-$([Guid]::NewGuid().ToString('N'))"
$dataRoot = Join-Path ([IO.Path]::GetTempPath()) "punch-installer-data-$([Guid]::NewGuid().ToString('N'))"
$ownsInstallDir = [string]::IsNullOrWhiteSpace($InstallDir)
$ownedInstallRoot = $null
$expectedInstallRoot = $null
if ($ownsInstallDir) {
  $ownedInstallRoot = Join-Path ([IO.Path]::GetTempPath()) "punch-installer-target-$([Guid]::NewGuid().ToString('N'))"
  $InstallDir = Join-Path $ownedInstallRoot 'punch\bin'
  $expectedInstallRoot = Split-Path -Parent $InstallDir
}
$badInstallDir = Join-Path ([IO.Path]::GetTempPath()) "punch-installer-bad-$([Guid]::NewGuid().ToString('N'))"
$serverProcess = $null
$oldData = $env:PUNCH_DATA
$oldPreferences = $env:PUNCH_PREFERENCES

function Invoke-Installer([string]$TargetDirectory) {
  $arguments = @(
    '-NoProfile'
    '-File'
    $installerPath
    '-Version'
    $version
    '-BaseUrl'
    "http://127.0.0.1:$Port"
    '-InstallDir'
    $TargetDirectory
  )
  if (-not $AddToPath) {
    $arguments += '-NoPath'
  }
  & pwsh @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Installer exited with code $LASTEXITCODE for $TargetDirectory."
  }
}

try {
  $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @("`"$serverScript`"", "`"$releaseDir`"", $Port) -WindowStyle Hidden -PassThru

  Start-Sleep -Milliseconds 800
  if ($serverProcess.HasExited) {
    throw 'The local release server exited before the test started.'
  }
  Invoke-Installer $installDir

  $executablePath = Join-Path $installDir 'punch.exe'
  $manifestPath = Join-Path $installDir 'punch-install.json'
  if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw 'Fresh install did not create punch.exe.'
  }
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'Fresh install did not create punch-install.json.'
  }

  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  if ($manifest.version -ne $version -or
      $manifest.platform -ne 'windows' -or
      $manifest.architecture -ne 'x64') {
    throw 'Install manifest contents are incorrect.'
  }

  $versionOutput = (& $executablePath --version | Out-String).Trim()
  if ($versionOutput -ne "punch $version") {
    throw "Installed executable returned '$versionOutput'."
  }

  Set-Content -LiteralPath $executablePath -Value 'old binary'
  Invoke-Installer $installDir
  $expectedArtifact = Join-Path $releaseDir "punch-v$version-windows-x64.exe"
  $expectedHash = (Get-FileHash -LiteralPath $expectedArtifact -Algorithm SHA256).Hash
  $actualHash = (Get-FileHash -LiteralPath $executablePath -Algorithm SHA256).Hash
  if ($actualHash -ne $expectedHash) {
    throw 'Upgrade did not restore the release executable.'
  }

  Copy-Item -LiteralPath $releaseDir -Destination $mirrorDir -Recurse
  $checksumFile = "punch-v$version-windows-x64.exe.sha256"
  $checksumPath = Join-Path $mirrorDir $checksumFile
  Set-Content -LiteralPath $checksumPath -Value ('0' * 64 + "  punch-v$version-windows-x64.exe")

  Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @("`"$serverScript`"", "`"$mirrorDir`"", $Port) -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 800
  if ($serverProcess.HasExited) {
    throw 'The local checksum-test server exited before the test started.'
  }

  $badArguments = @(
    '-NoProfile'
    '-File'
    $installerPath
    '-Version'
    $version
    '-BaseUrl'
    "http://127.0.0.1:$Port"
    '-InstallDir'
    $badInstallDir
    '-NoPath'
  )
  & pwsh @badArguments 2>$null
  if ($LASTEXITCODE -eq 0) {
    throw 'Checksum failure was not rejected.'
  }
  if (Test-Path -LiteralPath (Join-Path $badInstallDir 'punch.exe')) {
    throw 'Checksum failure left an executable behind.'
  }

  $dataPath = Join-Path $dataRoot 'punch.json'
  $preferencesPath = Join-Path $dataRoot 'preferences.json'
  New-Item -ItemType Directory -Path (Split-Path -Parent $dataPath) -Force | Out-Null
  Set-Content -LiteralPath $dataPath -Value '{}'
  Set-Content -LiteralPath $preferencesPath -Value '{}'
  $env:PUNCH_DATA = $dataPath
  $env:PUNCH_PREFERENCES = $preferencesPath

  $uninstallStarted = Get-Date
  $uninstallOutput = (& $executablePath uninstall 2>&1 | Out-String).Trim()
  $uninstallDuration = (Get-Date) - $uninstallStarted
  Write-Output "Uninstall command duration: $([math]::Round($uninstallDuration.TotalSeconds, 2)) seconds."
  if ($LASTEXITCODE -ne 0) {
    throw "Uninstaller exited with code ${LASTEXITCODE}: $uninstallOutput"
  }
  Start-Sleep -Seconds 3
  if (Test-Path -LiteralPath $executablePath) {
    throw "Uninstall left punch.exe behind: $uninstallOutput"
  }
  if (Test-Path -LiteralPath $manifestPath) {
    throw "Uninstall left punch-install.json behind: $uninstallOutput"
  }
  if (Test-Path -LiteralPath $installDir) {
    throw "Uninstall left the install directory behind: $uninstallOutput"
  }
  if ($expectedInstallRoot -and (Test-Path -LiteralPath $expectedInstallRoot)) {
    throw "Uninstall left the empty local Punch directory behind: $uninstallOutput"
  }
  if (-not (Test-Path -LiteralPath $dataPath) -or -not (Test-Path -LiteralPath $preferencesPath)) {
    throw 'Uninstall removed session data or preferences.'
  }

  Write-Output 'PASS: fresh install, executable launch, upgrade replacement, checksum rejection, uninstall preservation, and local directory cleanup.'
} finally {
  if ($serverProcess) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
  $cleanupPaths = @($mirrorDir, $badInstallDir, $dataRoot)
  if ($ownsInstallDir) {
    $cleanupPaths += $ownedInstallRoot
  }
  Remove-Item -LiteralPath $cleanupPaths -Recurse -Force -ErrorAction SilentlyContinue
  if ($null -eq $oldData) { Remove-Item Env:PUNCH_DATA -ErrorAction SilentlyContinue } else { $env:PUNCH_DATA = $oldData }
  if ($null -eq $oldPreferences) { Remove-Item Env:PUNCH_PREFERENCES -ErrorAction SilentlyContinue } else { $env:PUNCH_PREFERENCES = $oldPreferences }
}
