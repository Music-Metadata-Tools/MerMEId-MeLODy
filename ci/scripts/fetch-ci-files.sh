#!/bin/sh
# Downloads the CI scripts and SPARQL queries of the editor into <dir> (queries in <dir>/queries).
# Usage: fetch-ci-files.sh <dir>   (source: $EDITOR_REPO_URL/$EDITOR_REPO_REF, default editor on GitHub, main)
set -eu

dir=${1:?Usage: fetch-ci-files.sh <dir>}
ref=${EDITOR_REPO_REF:-main}
base_url=${EDITOR_REPO_URL:-https://raw.githubusercontent.com/Music-Metadata-Tools/MerMEId-MeLODy}/$ref

mkdir -p "$dir/queries"

for script_name in datasets-generator.sh change-project-domain.sh apply-project-domain.sh; do
  echo "fetching $script_name (ref: $ref)"
  curl --fail --silent --show-error --output "$dir/$script_name" "$base_url/ci/scripts/$script_name"
done

for query_name in persons institutions places venues events performanceEvents instrumentations works expressions manifestations items bibliography letters dataCatalogs dataCollections; do
  echo "fetching $query_name.sparql (ref: $ref)"
  curl --fail --silent --show-error --output "$dir/queries/$query_name.sparql" "$base_url/modules/datasets-generator/$query_name.sparql"
done
