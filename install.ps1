[CmdletBinding()]
param(
  [string]$Version = 'latest',
  [string]$BaseUrl,
  [string]$InstallDir,
  [switch]$NoPath
)

$ErrorActionPreference = 'Stop'
$script:InstallerVersion = '1'

function Get-DefaultInstallDirectory {
  if ($env:LOCALAPPDATA) {
    return Join-Path $env:LOCALAPPDATA 'punch\bin'
  }

  if ($env:USERPROFILE) {
    return Join-Path $env:USERPROFILE 'AppData\Local\punch\bin'
  }

  throw 'Could not determine a user-local installation directory.'
}

function Get-DefaultBaseUrl([string]$RequestedVersion) {
  $repository = 'https://github.com/squidllee/punch-in/releases'
  if ($RequestedVersion -eq 'latest') {
    return "$repository/latest/download"
  }

  if ($RequestedVersion -notmatch '^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw "Invalid version '$RequestedVersion'. Use 'latest' or a semantic version such as '0.1.0'."
  }

  $normalizedVersion = $RequestedVersion.TrimStart('v')
  return "$repository/download/v$normalizedVersion"
}

function ConvertTo-AbsolutePath([string]$Path, [string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "$Name cannot be empty."
  }

  if (-not [IO.Path]::IsPathRooted($Path)) {
    throw "$Name must be an absolute path: $Path"
  }

  try {
    $fullPath = [IO.Path]::GetFullPath($Path)
  } catch {
    throw "$Name is not a valid path: $Path"
  }

  return $fullPath
}

function ConvertTo-BaseUri([string]$Url) {
  $uri = $null
  if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri)) {
    throw "BaseUrl is not an absolute URL: $Url"
  }

  if ($uri.UserInfo -or $uri.Query -or $uri.Fragment) {
    throw 'BaseUrl must not contain credentials, a query string, or a fragment.'
  }

  if ($uri.Scheme -eq 'https') {
    return $uri
  }

  $localHosts = @('localhost', '127.0.0.1', '::1')
  if ($uri.Scheme -ne 'http' -or $localHosts -notcontains $uri.Host) {
    throw 'BaseUrl must use HTTPS. HTTP is allowed only for localhost testing.'
  }

  return $uri
}

function Join-DownloadUrl([Uri]$BaseUri, [string]$FileName) {
  $escapedName = [Uri]::EscapeDataString($FileName)
  return "$($BaseUri.AbsoluteUri.TrimEnd('/'))/$escapedName"
}

function Assert-SafeFileName([string]$FileName) {
  if ([string]::IsNullOrWhiteSpace($FileName) -or
      [IO.Path]::GetFileName($FileName) -ne $FileName -or
      $FileName -in @('.', '..')) {
    throw "Release manifest contains an unsafe file name: $FileName"
  }
}

function Get-TextDownload([Uri]$Url) {
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing
  if ($response.Content -is [byte[]]) {
    return [Text.Encoding]::UTF8.GetString($response.Content)
  }

  return [string]$response.Content
}

function Save-Download([Uri]$Url, [string]$Destination) {
  Invoke-WebRequest -Uri $Url -UseBasicParsing -OutFile $Destination
}

function Get-WindowsArtifact([object]$Manifest, [string]$RequestedVersion) {
  if ($null -eq $Manifest -or $Manifest.name -ne 'punch') {
    throw 'The release manifest is missing or is not a Punch manifest.'
  }

  if ($Manifest.version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw 'The release manifest contains an invalid version.'
  }

  if ($RequestedVersion -ne 'latest' -and $Manifest.version -ne $RequestedVersion.TrimStart('v')) {
    throw "Requested version '$RequestedVersion' does not match manifest version '$($Manifest.version)'."
  }

  $artifact = @(@($Manifest.artifacts) | Where-Object {
    $_.platform -eq 'windows' -and
    $_.architecture -eq 'x64' -and
    $_.target -eq 'bun-windows-x64'
  })

  if ($artifact.Count -ne 1) {
    throw 'The release manifest does not contain exactly one Windows x64 artifact.'
  }

  if ($artifact.file -notmatch '^punch-v[^/\\]+-windows-x64\.exe$') {
    throw "The release manifest contains an invalid Windows artifact name: $($artifact.file)"
  }

  Assert-SafeFileName $artifact.file

  if ($artifact.sha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'The release manifest contains an invalid SHA-256 digest.'
  }

  return $artifact
}

function Get-Checksum([string]$ChecksumText, [string]$ExpectedFile) {
  $line = ($ChecksumText -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
  if ($line -notmatch '^\s*([0-9a-fA-F]{64})\s+(.+?)\s*$') {
    throw "The checksum file for $ExpectedFile is malformed."
  }

  $actualFile = $Matches[2].Trim().TrimStart('*')
  if ($actualFile -ne $ExpectedFile) {
    throw "The checksum file names '$actualFile' instead of '$ExpectedFile'."
  }

  return $Matches[1].ToLowerInvariant()
}

function Add-ToUserPath([string]$Directory) {
  $currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @()
  if ($currentPath) {
    $entries = $currentPath -split ';' | Where-Object { $_ }
  }

  $alreadyPresent = $entries | Where-Object {
    try {
      [IO.Path]::GetFullPath($_).TrimEnd('\', '/') -ieq $Directory.TrimEnd('\', '/')
    } catch {
      $false
    }
  }

  if (-not $alreadyPresent) {
    $newPath = (@($entries) + $Directory) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "Added $Directory to the user PATH. Open a new terminal to use 'punch'."
  }
}

$tempDir = $null
$stagedExecutable = $null
$stagedManifest = $null

try {
  if (-not $InstallDir) {
    $InstallDir = Get-DefaultInstallDirectory
  }
  $InstallDir = ConvertTo-AbsolutePath $InstallDir 'InstallDir'

  if (-not $BaseUrl) {
    $BaseUrl = Get-DefaultBaseUrl $Version
  }
  $baseUri = ConvertTo-BaseUri $BaseUrl

  $tempDir = Join-Path ([IO.Path]::GetTempPath()) "punch-install-$([Guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

  Write-Host "Reading release manifest from $($baseUri.AbsoluteUri)..."
  $manifestText = Get-TextDownload (Join-DownloadUrl $baseUri 'release-manifest.json')
  $manifest = $manifestText | ConvertFrom-Json
  $artifact = Get-WindowsArtifact $manifest $Version
  $artifactFile = [IO.Path]::GetFileName($artifact.file)
  $checksumFile = "$artifactFile.sha256"
  $artifactPath = Join-Path $tempDir $artifactFile
  $checksumPath = Join-Path $tempDir $checksumFile

  Write-Host "Downloading $artifactFile..."
  Save-Download (Join-DownloadUrl $baseUri $artifactFile) $artifactPath
  Save-Download (Join-DownloadUrl $baseUri $checksumFile) $checksumPath

  $checksumText = [IO.File]::ReadAllText($checksumPath)
  $checksum = Get-Checksum $checksumText $artifactFile
  $manifestChecksum = $artifact.sha256.ToLowerInvariant()
  if ($checksum -ne $manifestChecksum) {
    throw 'The downloaded checksum does not match the release manifest.'
  }

  $actualChecksum = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualChecksum -ne $manifestChecksum) {
    throw "SHA-256 verification failed for $artifactFile."
  }

  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  $targetPath = Join-Path $InstallDir 'punch.exe'
  $stagedExecutable = Join-Path $InstallDir ".punch.exe.$([Guid]::NewGuid().ToString('N')).tmp"
  Copy-Item -LiteralPath $artifactPath -Destination $stagedExecutable

  Move-Item -LiteralPath $stagedExecutable -Destination $targetPath -Force
  $stagedExecutable = $null

  $installManifest = [ordered]@{
    name = 'punch'
    version = $manifest.version
    platform = 'windows'
    architecture = 'x64'
    installDirectory = $InstallDir
    executable = $targetPath
    installerVersion = $script:InstallerVersion
  }
  $manifestPath = Join-Path $InstallDir 'punch-install.json'
  $manifestJson = $installManifest | ConvertTo-Json
  $stagedManifest = Join-Path $InstallDir ".punch-install.$([Guid]::NewGuid().ToString('N')).tmp"
  [IO.File]::WriteAllText($stagedManifest, $manifestJson, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $stagedManifest -Destination $manifestPath -Force
  $stagedManifest = $null

  if (-not $NoPath) {
    Add-ToUserPath $InstallDir
  }

  Write-Host "Installed punch $($manifest.version) to $targetPath"
} catch {
  if ($stagedExecutable -and (Test-Path -LiteralPath $stagedExecutable)) {
    Remove-Item -LiteralPath $stagedExecutable -Force -ErrorAction SilentlyContinue
  }
  if ($stagedManifest -and (Test-Path -LiteralPath $stagedManifest)) {
    Remove-Item -LiteralPath $stagedManifest -Force -ErrorAction SilentlyContinue
  }
  throw
} finally {
  if ($tempDir -and (Test-Path -LiteralPath $tempDir)) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
