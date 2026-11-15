#!/usr/bin/env bash
# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# Prints the cert spec files that belong to one shard of the test-cert job, one path per line,
# relative to support/chip-testing.
#
# Usage: cert-shard-files.sh <shard index, 1-based> <shard count>
#
# A file's shard comes from a checksum of its path, so a new file lands in a shard without a list to
# maintain, and adding or removing other files never moves an existing file to a different shard.
# Every file belongs to exactly one shard.

set -euo pipefail

index=${1:?shard index missing}
count=${2:?shard count missing}

case "$index$count" in
  *[!0-9]*) echo "Shard index and count must be positive integers, got '$index' and '$count'" >&2; exit 2 ;;
esac
if [ "$index" -lt 1 ] || [ "$index" -gt "$count" ]; then
  echo "Shard index $index is outside 1..$count" >&2
  exit 2
fi

cd "$(dirname "$0")/../../support/chip-testing"

find test/cert -name '*.test.ts' | LC_ALL=C sort | while IFS= read -r file; do
  sum=$(printf '%s' "$file" | cksum | cut -d' ' -f1)
  if [ $((sum % count + 1)) -eq "$index" ]; then
    echo "$file"
  fi
done
