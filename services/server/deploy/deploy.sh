#!/usr/bin/env bash
# Deploy the iris server and web app on devcloud_cpu from this checkout.
set -euo pipefail
export CI=true  # pnpm otherwise asks before purging node_modules, and there is no TTY
cd "$(dirname "$0")/../../.."
pnpm --dir services/server install --ignore-workspace --frozen-lockfile
pnpm --dir services/web install --ignore-workspace --frozen-lockfile
pnpm --dir services/web build
systemctl restart iris
sleep 3
systemctl is-active iris
