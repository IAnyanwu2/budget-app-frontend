#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/load-local-env.sh"
load_local_env "$REPO_ROOT/.env"

export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-${Ollama__BaseUrl:-http://localhost:11434}}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-${Ollama__Model:-mistral:7b}}"

cd "$REPO_ROOT"
dotnet test budget-app-backend.OllamaTests/budget-app-backend.OllamaTests.csproj --logger "console;verbosity=normal"