#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/load-local-env.sh"
load_local_env "$REPO_ROOT/.env"

export PLAID_CLIENT_ID="${PLAID_CLIENT_ID:-${Plaid__ClientID:-}}"
export PLAID_SECRET="${PLAID_SECRET:-${Plaid__Secret:-}}"

: "${PLAID_CLIENT_ID:?Set PLAID_CLIENT_ID or Plaid__ClientID in the repository .env}"
: "${PLAID_SECRET:?Set PLAID_SECRET or Plaid__Secret in the repository .env}"

cd "$REPO_ROOT"
dotnet test budget-app-backend.SandboxTests/budget-app-backend.SandboxTests.csproj --logger "console;verbosity=normal"