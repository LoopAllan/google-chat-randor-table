#!/usr/bin/env bash
# Uploads an extension package to the Chrome Web Store and submits it for review
# (Chrome Web Store API v2: https://developer.chrome.com/docs/webstore/using-api).
#
# Usage: publish-chrome-web-store.sh <package.zip>
# Environment:
#   CWS_ACCESS_TOKEN  OAuth access token with the chromewebstore scope
#   CWS_PUBLISHER_ID  Developer Dashboard > Account (publisher ID)
#   CWS_EXTENSION_ID  the item's 32-character ID
#   CWS_API_BASE      optional, for tests against a fake API (default: the real one)
set -euo pipefail

zip_path="${1:?usage: $0 <package.zip>}"
: "${CWS_ACCESS_TOKEN:?CWS_ACCESS_TOKEN is not set}"
: "${CWS_PUBLISHER_ID:?CWS_PUBLISHER_ID is not set}"
: "${CWS_EXTENSION_ID:?CWS_EXTENSION_ID is not set}"
api="${CWS_API_BASE:-https://chromewebstore.googleapis.com}"
item="publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}"
poll_seconds="${CWS_POLL_SECONDS:-10}"
max_polls=30

# call METHOD URL [curl args...]: prints the response body; on an HTTP error prints it and fails.
call() {
  local method="$1" url="$2" response status body
  shift 2
  response="$(curl -sS -w '\n%{http_code}' -X "$method" -H "Authorization: Bearer ${CWS_ACCESS_TOKEN}" "$@" "$url")"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [ "$status" -ge 400 ]; then
    echo "::error::${method} ${url} failed with HTTP ${status}: ${body}" >&2
    return 1
  fi
  printf '%s' "$body"
}

[ -f "$zip_path" ] || { echo "::error::package not found: ${zip_path}" >&2; exit 1; }

upload="$(call POST "${api}/upload/v2/${item}:upload" -H 'Content-Type: application/zip' --data-binary "@${zip_path}")"
state="$(jq -r '.uploadState // empty' <<<"$upload")"

# Large packages are processed asynchronously; the docs name the state both ways.
polls=0
while [ "$state" = IN_PROGRESS ] || [ "$state" = UPLOAD_IN_PROGRESS ]; do
  polls=$((polls + 1))
  if [ "$polls" -gt "$max_polls" ]; then
    echo "::error::upload still processing after ${max_polls} checks" >&2
    exit 1
  fi
  sleep "$poll_seconds"
  state="$(call GET "${api}/v2/${item}:fetchStatus" | jq -r '.lastAsyncUploadState // empty')"
done

if [ "$state" != SUCCEEDED ]; then
  # A FAILED upload is most often a version that was not raised in manifest.json.
  echo "::error::upload ended in state '${state}': ${upload}" >&2
  exit 1
fi
version="$(jq -r '.crxVersion // empty' <<<"$upload")"
echo "Upload succeeded${version:+ (version ${version})}"

publish="$(call POST "${api}/v2/${item}:publish" -H 'Content-Type: application/json' -d '{}')"
echo "Submitted for review: $(jq -c '{state, warnings: .warningInfo.warnings}' <<<"$publish")"
