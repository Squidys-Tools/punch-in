#!/usr/bin/env sh
set -eu

REPOSITORY='https://github.com/exodus712/punch-in/releases'
INSTALLER_VERSION='1'
VERSION="${PUNCH_VERSION:-latest}"
BASE_URL="${PUNCH_BASE_URL:-}"
INSTALL_DIR="${PUNCH_INSTALL_DIR:-$HOME/.local/bin}"
ALLOW_HTTP="${PUNCH_ALLOW_HTTP:-0}"

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Install Punch from a GitHub Release.

Options:
  --version VERSION       Install a specific version instead of latest.
  --base-url URL          Override the release asset base URL for testing.
  --install-dir DIRECTORY Install to a different directory.
  --allow-http            Allow HTTP only for local testing.
  -h, --help              Show this help.

Examples:
  curl -fsSL https://raw.githubusercontent.com/exodus712/punch-in/main/install.sh | sh
  curl -fsSL https://raw.githubusercontent.com/exodus712/punch-in/main/install.sh | sh -s -- --version 0.1.0
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      [ "$#" -ge 2 ] || die '--version requires a value'
      VERSION=$2
      shift 2
      ;;
    --base-url)
      [ "$#" -ge 2 ] || die '--base-url requires a value'
      BASE_URL=$2
      shift 2
      ;;
    --install-dir)
      [ "$#" -ge 2 ] || die '--install-dir requires a value'
      INSTALL_DIR=$2
      shift 2
      ;;
    --allow-http)
      ALLOW_HTTP=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option '$1'"
      ;;
  esac
done

case "$(uname -s)" in
  Darwin)
    PLATFORM='macos'
    ;;
  Linux)
    PLATFORM='linux'
    ;;
  *)
    die 'install.sh supports macOS and Linux only'
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64)
    ARCHITECTURE='x64'
    ;;
  arm64|aarch64)
    ARCHITECTURE='arm64'
    ;;
  *)
    die "unsupported CPU architecture: $(uname -m)"
    ;;
esac

case "$VERSION" in
  latest) ;;
  v[0-9]*|[0-9]*)
    VERSION=${VERSION#v}
    printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([.+-][0-9A-Za-z.-]+)?$' || die "invalid version: $VERSION"
    ;;
  *)
    die "invalid version: $VERSION"
    ;;
esac

case "$INSTALL_DIR" in
  /*) ;;
  *) die '--install-dir must be an absolute path' ;;
esac

case "$INSTALL_DIR" in
  /|"$HOME") die '--install-dir cannot be a filesystem root or home directory' ;;
esac

case "$INSTALL_DIR" in
  *'"'*) die '--install-dir contains characters that cannot be written to the install manifest' ;;
esac

if [ -z "$BASE_URL" ]; then
  if [ "$VERSION" = 'latest' ]; then
    BASE_URL="$REPOSITORY/latest/download"
  else
    BASE_URL="$REPOSITORY/download/v$VERSION"
  fi
fi

case "$BASE_URL" in
  https://*) ;;
  http://localhost/*|http://localhost|http://127.0.0.1/*|http://127.0.0.1|http://\[::1\]/*|http://\[::1\])
    [ "$ALLOW_HTTP" = '1' ] || die 'HTTP is allowed only with --allow-http for local testing'
    ;;
  *)
    die 'base URL must use HTTPS'
    ;;
esac

case "$BASE_URL" in
  *'?'*|*'#'*) die 'base URL must not contain a query string or fragment' ;;
esac

command -v curl >/dev/null 2>&1 || die 'curl is required'

if command -v sha256sum >/dev/null 2>&1; then
  hash_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  hash_file() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  die 'sha256sum or shasum is required'
fi

download() {
  curl --fail --silent --show-error --location --proto '=https,http' --tlsv1.2 "$1" --output "$2"
}

json_string() {
  key=$1
  file=$2
  sed -n "s/^[[:space:]]*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$file" | head -n 1
}

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/punch-install.XXXXXX") || die 'could not create a temporary directory'
staged_path=''
staged_manifest=''
cleanup() {
  rm -rf "$temp_dir"
  [ -z "$staged_path" ] || rm -f "$staged_path"
  [ -z "$staged_manifest" ] || rm -f "$staged_manifest"
}
trap cleanup EXIT HUP INT TERM
umask 077

manifest_file="$temp_dir/release-manifest.json"
manifest_url="${BASE_URL%/}/release-manifest.json"
printf 'Reading release manifest from %s...\n' "$manifest_url"
download "$manifest_url" "$manifest_file"

manifest_version=$(json_string version "$manifest_file")
manifest_name=$(json_string name "$manifest_file")
[ "$manifest_name" = 'punch' ] || die 'release manifest is not a Punch manifest'
[ -n "$manifest_version" ] || die 'release manifest does not contain a version'
printf '%s\n' "$manifest_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([.+-][0-9A-Za-z.-]+)?$' || die "release manifest contains an invalid version: $manifest_version"

if [ "$VERSION" != 'latest' ] && [ "$manifest_version" != "$VERSION" ]; then
  die "requested version $VERSION does not match release manifest version $manifest_version"
fi

artifact_file="punch-v${manifest_version}-${PLATFORM}-${ARCHITECTURE}"
case "$PLATFORM" in
  windows) artifact_file="${artifact_file}.exe" ;;
esac

grep -Fq "\"file\": \"$artifact_file\"" "$manifest_file" || die "release does not contain $artifact_file"

artifact_path="$temp_dir/$artifact_file"
checksum_path="$temp_dir/$artifact_file.sha256"
download "${BASE_URL%/}/$artifact_file" "$artifact_path"
download "${BASE_URL%/}/$artifact_file.sha256" "$checksum_path"

checksum_line=$(sed -n '1p' "$checksum_path")
expected_checksum=$(printf '%s\n' "$checksum_line" | awk '{print $1}')
checksum_name=$(printf '%s\n' "$checksum_line" | awk '{print $2}' | sed 's/^\*//')
printf '%s\n' "$expected_checksum" | grep -Eq '^[0-9a-fA-F]{64}$' || die "checksum file for $artifact_file is malformed"
[ "$checksum_name" = "$artifact_file" ] || die "checksum file names $checksum_name instead of $artifact_file"

actual_checksum=$(hash_file "$artifact_path")
[ "$actual_checksum" = "$expected_checksum" ] || die "SHA-256 verification failed for $artifact_file"

mkdir -p "$INSTALL_DIR"
target_path="$INSTALL_DIR/punch"
staged_path="$INSTALL_DIR/.punch.$$.tmp"
manifest_target="$INSTALL_DIR/punch-install.json"
staged_manifest="$INSTALL_DIR/.punch-install.$$.tmp"

cp "$artifact_path" "$staged_path"
chmod 755 "$staged_path"
mv -f "$staged_path" "$target_path"

printf '{\n  "name": "punch",\n  "version": "%s",\n  "platform": "%s",\n  "architecture": "%s",\n  "installDirectory": "%s",\n  "executable": "%s",\n  "installerVersion": "%s"\n}\n' \
  "$manifest_version" "$PLATFORM" "$ARCHITECTURE" "$INSTALL_DIR" "$target_path" "$INSTALLER_VERSION" \
  > "$staged_manifest"
mv -f "$staged_manifest" "$manifest_target"

printf 'Installed punch %s to %s\n' "$manifest_version" "$target_path"
case ":${PATH:-}:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    printf 'Add this directory to PATH in your shell profile:\n  export PATH="%s:$PATH"\n' "$INSTALL_DIR"
    ;;
esac
