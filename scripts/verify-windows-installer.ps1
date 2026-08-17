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
$ownsInstallDir = [string]::IsNullOrWhiteSpace($InstallDir)
if ($ownsInstallDir) {
  $InstallDir = Join-Path ([IO.Path]::GetTempPath()) "punch-installer-target-$([Guid]::NewGuid().ToString('N'))"
}
$badInstallDir = Join-Path ([IO.Path]::GetTempPath()) "punch-installer-bad-$([Guid]::NewGuid().ToString('N'))"
$serverProcess = $null

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

  $env:PUNCH_DATA = Join-Path $installDir 'data\punch.json'
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

  Write-Output 'PASS: fresh install, executable launch, upgrade replacement, and checksum rejection.'
} finally {
  if ($serverProcess) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
  $cleanupPaths = @($mirrorDir, $badInstallDir)
  if ($ownsInstallDir) {
    $cleanupPaths += $installDir
  }
  Remove-Item -LiteralPath $cleanupPaths -Recurse -Force -ErrorAction SilentlyContinue
}
