#!/usr/bin/env bash
set -euo pipefail

# Called only after the reusable Merge Smoke workflow succeeds for this commit.
base="${1:?base commit required}"
branch="${2:?temporary branch required}"
commit="${3:?tested commit required}"
[[ "${GITHUB_REF:-}" == refs/heads/main ]] || { echo 'Publication requires the main workflow.' >&2; exit 1; }
[[ "$base" =~ ^[a-f0-9]{40}$ && "$commit" =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ "$branch" =~ ^bot/media-optimization-[0-9]+-[0-9]+$ ]] || exit 1
[[ "$(git rev-parse HEAD)" == "$commit" ]] || exit 1
[[ "$(git rev-parse "$commit^")" == "$base" ]] || exit 1
[[ "$(git ls-remote origin "refs/heads/$branch" | cut -f1)" == "$commit" ]] || exit 1

retry_current_sources() {
  echo 'Main advanced during validation; rebuilding from current sources.'
  gh workflow run media-optimization.yml --ref main -f scope=changed
}

git fetch origin main
if [[ "$(git rev-parse origin/main)" != "$base" ]]; then
  retry_current_sources
  exit 0
fi

# A normal fast-forward push also protects the race after the read above.
# Never rebase tested output onto untested campaign/configuration changes.
if ! git push origin "$commit:refs/heads/main"; then
  git fetch origin main
  if [[ "$(git rev-parse origin/main)" != "$base" ]]; then
    retry_current_sources
    exit 0
  fi
  echo 'Unable to publish media; main was not replaced.' >&2
  exit 1
fi

# GITHUB_TOKEN pushes do not trigger push workflows. Dispatch Pages explicitly.
gh workflow run deploy.yml --ref main -f "reason=validated image optimization $commit"
