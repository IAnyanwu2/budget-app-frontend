#!/usr/bin/env bash

load_local_env() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == export\ * ]] && line="${line#export }"
    [[ "$line" == *=* ]] || continue

    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    case "$key" in
      PLAID_CLIENT_ID|PLAID_SECRET|Plaid__ClientID|Plaid__Secret|Plaid__Environment|OLLAMA_BASE_URL|OLLAMA_MODEL|Ollama__BaseUrl|Ollama__Model) ;;
      *) continue ;;
    esac

    if [[ ${#value} -ge 2 ]]; then
      if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi

    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$env_file"
}