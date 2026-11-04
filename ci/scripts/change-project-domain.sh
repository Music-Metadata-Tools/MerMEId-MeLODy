#!/bin/sh
# Replaces the IRI prefix <old_domain> with <new_domain> in all entity and index files (<dir>/*/*.ttl).
# Usage: change-project-domain.sh <old_domain> <new_domain> [dir]
# Domains are normalized like getProjectDomain() in the editor (modules/services/project-domain.js).
# POSIX sh, works with BusyBox (alpine).
set -eu

normalize() {
    domain=$(printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    case "$domain" in
        "") domain="urn:uuid:" ;;
        */ | *"#" | *:) ;;
        urn:*) domain="$domain:" ;;
        *) domain="$domain/" ;;
    esac
    case "$domain" in
        *"|"* | *"\\"* | *[[:space:]]* | *"<"* | *">"*)
            echo "Invalid project domain: $domain" >&2
            exit 1
            ;;
    esac
    printf '%s' "$domain"
}

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
    echo "Usage: $0 <old_domain> <new_domain> [dir]" >&2
    exit 2
fi

old_domain=$(normalize "$1")
new_domain=$(normalize "$2")
dir=${3:-.}

if [ "$old_domain" = "$new_domain" ]; then
    echo "Project domain unchanged ($new_domain), nothing to do."
    exit 0
fi

# Escape for a basic regex and for the replacement part of sed.
old_pattern=$(printf '%s' "<$old_domain" | sed 's/[].[\*^$]/\\&/g')
new_replacement=$(printf '%s' "<$new_domain" | sed 's/[&]/\\&/g')

cd "$dir"
file_list=$(mktemp)
trap 'rm -f "$file_list"' EXIT

find . -mindepth 2 -maxdepth 2 -type f -name '*.ttl' ! -path './.*' \
    -exec grep -lF -e "<$old_domain" {} + > "$file_list" || true

count=$(wc -l < "$file_list" | tr -d ' ')
echo "Replacing <$old_domain with <$new_domain in $count file(s)."

while IFS= read -r file; do
    sed -i "s|$old_pattern|$new_replacement|g" "$file"
done < "$file_list"
