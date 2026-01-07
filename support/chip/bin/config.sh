# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

set -e

export CHIP_IMAGE=ghcr.io/matter-js/chip
if [ -n "$(docker images -q $CHIP_IMAGE)" ]; then
    export CHIP_ARCH=$(docker inspect --format '{{ .Architecture }}' ghcr.io/matter-js/chip)
else
    # Adjust for ARM if we ever publish those images
    export CHIP_ARCH=amd64
fi
export CHIP_PLATFORM="linux/$CHIP_ARCH"
export CHIP_DIR=$(dirname "$(realpath "$(dirname "${BASH_SOURCE[0]}")")")
