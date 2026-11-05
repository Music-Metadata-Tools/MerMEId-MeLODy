#!/bin/sh
# Applies projectDomain from the trigger commit (HEAD) to the target branch: rewrites the IRIs, pushes config and
# data in one commit (up to 3 attempts) and deletes the trigger branch. On failure the target branch is unchanged.
# A trigger branch without own commit (just created) is left alone; it is only deleted if unchanged since the trigger.
# Aborts before pushing if the trigger commit is older than $MAX_AGE_SECONDS (default 1500).
# Usage: apply-project-domain.sh <trigger_branch> [target_branch]   (remote "origin" must allow push; needs git, jq)
set -eu

trigger_branch=${1:?Usage: apply-project-domain.sh <trigger_branch> [target_branch]}
target_branch=${2:-main}
max_age=${MAX_AGE_SECONDS:-1500}
retry_delay=${RETRY_DELAY_SECONDS:-10}
script_dir=$(cd "$(dirname "$0")" && pwd)
config=configuration/config.json

trigger_sha=$(git rev-parse HEAD)
trigger_time=$(git log -1 --format=%ct HEAD)
new_domain=$(git show "HEAD:$config" | jq -r '.projectDomain // ""')

check_deadline() {
    age=$(( $(date +%s) - trigger_time ))
    if [ "$age" -gt "$max_age" ]; then
        echo "Trigger commit is ${age}s old (limit ${max_age}s), aborting without push." >&2
        exit 1
    fi
}

attempt=1
while :; do
    git fetch --depth=1 origin "$target_branch"
    if [ "$(git rev-parse FETCH_HEAD)" = "$trigger_sha" ]; then
        echo "Trigger branch has no own commit yet, nothing to do."
        exit 0
    fi
    check_deadline
    git checkout -q -f -B melody-project-domain FETCH_HEAD

    old_domain=$(jq -r '.projectDomain // ""' "$config")
    jq --arg domain "$new_domain" '.projectDomain = $domain' "$config" > "$config.tmp"
    mv "$config.tmp" "$config"
    sh "$script_dir/change-project-domain.sh" "$old_domain" "$new_domain" .

    git add -u
    if git diff --cached --quiet; then
        echo "Project domain already set, nothing to push."
        break
    fi
    git commit -q -m "Changed project domain to $new_domain [skip ci]"

    check_deadline
    if git push origin "HEAD:refs/heads/$target_branch"; then
        break
    fi
    if [ "$attempt" -ge 3 ]; then
        echo "Push to $target_branch failed $attempt times, $target_branch unchanged." >&2
        exit 1
    fi
    attempt=$((attempt + 1))
    echo "Push rejected, retrying with the current $target_branch (attempt $attempt of 3)."
    sleep "$retry_delay"
done

git push --force-with-lease="refs/heads/$trigger_branch:$trigger_sha" origin --delete "$trigger_branch" \
    || echo "Branch $trigger_branch not deleted (changed meanwhile or not permitted)." >&2
