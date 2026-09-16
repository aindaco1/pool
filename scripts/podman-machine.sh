#!/usr/bin/env bash
# Projects consume the selected engine. VM lifecycle belongs to the host.
# Pin the default connection for child commands; never replace explicit endpoints.
pool_podman_uses_machine() {
  case "$(uname -s)" in Darwin|MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac
}

pool_podman_configure_connection() {
  pool_podman_uses_machine || return 0
  command -v podman >/dev/null 2>&1 || return 0
  if [ -z "${CONTAINER_HOST:-}" ] && [ -z "${CONTAINER_CONNECTION:-}" ]; then
    local selected=""
    selected="$(podman system connection list --format '{{if .Default}}{{.Name}}{{end}}' 2>/dev/null | awk 'NF {print; exit}')" || return 1
    if [ -n "$selected" ]; then export CONTAINER_CONNECTION="$selected"; fi
  fi
  POOL_PODMAN_MACHINE=""
  if [ -z "${CONTAINER_HOST:-}" ] && [ -n "${CONTAINER_CONNECTION:-}" ]; then
    # Only inspect a matching local machine. Remote connections remain remote.
    local candidate="${CONTAINER_CONNECTION%-root}"
    if podman machine inspect "$candidate" >/dev/null 2>&1; then
      POOL_PODMAN_MACHINE="$candidate"
    fi
  fi
  export POOL_PODMAN_MACHINE
}

pool_podman_socket() {
  [ -n "${POOL_PODMAN_MACHINE:-}" ] || return 0
  podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' "$POOL_PODMAN_MACHINE" 2>/dev/null || true
}

pool_podman_log_path() {
  local socket_path=""
  socket_path="$(pool_podman_socket)"
  [ -n "$socket_path" ] || return 0
  printf '%s/%s.log\n' "$(dirname "$socket_path")" "$POOL_PODMAN_MACHINE"
}

pool_podman_wait_ready() {
  local _=""
  for _ in $(seq 1 "${1:-15}"); do
    if podman info >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Podman API is unreachable. Check 'podman system connection list' and 'podman machine list'. Start your selected machine explicitly if stopped. Pool never restarts a shared VM." >&2
  return 1
}
