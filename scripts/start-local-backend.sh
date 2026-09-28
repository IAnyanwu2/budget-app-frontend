#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/load-local-env.sh"
load_local_env "$REPO_ROOT/.env"

cd "$REPO_ROOT/budget-app-backend"
exec dotnet run