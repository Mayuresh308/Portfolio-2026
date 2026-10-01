#!/usr/bin/env bash
# Vercel build: installs pinned Hugo (extended) and, if needed, Go into a local
# tools dir, installs npm deps, then builds the site with the deployment URL.
set -euo pipefail

HUGO_VERSION="0.162.0"
GO_VERSION="1.23.6"   # go.mod requires >= 1.19; Hugo Modules need the go binary
PNPM_VERSION="10.14.0"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="${ROOT}/.tools"
mkdir -p "${TOOLS}/bin"
export PATH="${TOOLS}/bin:${PATH}"
cd "${ROOT}"

echo "==> Installing Hugo extended ${HUGO_VERSION}"
if ! hugo version 2>/dev/null | grep -q "v${HUGO_VERSION}.*extended"; then
  curl -fsSL "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz" \
    | tar -xz -C "${TOOLS}/bin" hugo
fi

if ! command -v go >/dev/null 2>&1; then
  echo "==> Go not found; installing Go ${GO_VERSION}"
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" | tar -xz -C "${TOOLS}"
  export PATH="${TOOLS}/go/bin:${PATH}"
fi
export GOPATH="${TOOLS}/gopath"
export HUGO_CACHEDIR="${TOOLS}/hugo_cache"

echo "==> Tool versions"
hugo version
go version
node --version

# Hugo >= 0.161 runs the Tailwind CLI with Node's --permission flag (Node >= 22.13).
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "${NODE_MAJOR}" -lt 22 ] || { [ "${NODE_MAJOR}" -eq 22 ] && [ "${NODE_MINOR}" -lt 13 ]; }; then
  echo "ERROR: Node $(node --version) is too old; Hugo needs Node >= 22.13 (package.json pins 24.x)." >&2
  exit 1
fi

echo "==> Installing npm dependencies"
if command -v pnpm >/dev/null 2>&1 && [ "$(pnpm --version | cut -d. -f1)" = "${PNPM_VERSION%%.*}" ]; then
  pnpm install --frozen-lockfile
else
  npx --yes "pnpm@${PNPM_VERSION}" install --frozen-lockfile
fi

if [ "${VERCEL_ENV:-}" = "production" ] && [ -n "${VERCEL_PROJECT_PRODUCTION_URL:-}" ]; then
  BASE_URL="https://${VERCEL_PROJECT_PRODUCTION_URL}/"
elif [ -n "${VERCEL_URL:-}" ]; then
  BASE_URL="https://${VERCEL_URL}/"
else
  echo "ERROR: VERCEL_URL is not set; enable 'Automatically expose System Environment Variables' in Vercel." >&2
  exit 1
fi

echo "==> Building with baseURL ${BASE_URL} (VERCEL_ENV=${VERCEL_ENV:-unset})"
hugo --gc --minify -b "${BASE_URL}"

test -f public/404.html || { echo "ERROR: public/404.html missing" >&2; exit 1; }
echo "==> Build complete"
