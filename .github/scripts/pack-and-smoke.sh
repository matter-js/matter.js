#!/usr/bin/env bash
# Installs a packed @matter/general into a scratch project and runs the crypto smoke test under the runtime given as
# arguments, e.g. "pack-and-smoke.sh deno run --allow-read --allow-env --allow-sys".
#
# Deno cannot run matter.js from a workspace checkout, so an installed package is the only way to exercise it there —
# and it is how an application consumes matter.js anyway.
set -euo pipefail

if [ $# -eq 0 ]; then
    echo "usage: $0 <runtime> [runtime args...]" >&2
    exit 2
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
pack=$(mktemp -d)
smoke=$(mktemp -d)
trap 'rm -rf "$pack" "$smoke"' EXIT

# npm pack reports success even where it wrote nothing, so the tarball is checked rather than the exit status
(cd "$root" && npm pack --pack-destination "$pack" --workspace @matter/general)
tarball=$(find "$pack" -name "*.tgz" -print -quit)
if [ -z "$tarball" ]; then
    echo "npm pack produced no tarball in $pack" >&2
    exit 1
fi

cd "$smoke"
echo '{"name":"smoke","type":"module","private":true}' >package.json
npm install "$tarball"
cp "$root/.github/scripts/crypto-smoke.mjs" .

echo "Running crypto smoke test with: $*"
"$@" crypto-smoke.mjs
