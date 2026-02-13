#!/bin/bash
# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# NOTE: Runs from source tree via devcontainer.json

# Die on error
set -e

# Configure filesystem permissions
sudo /usr/local/bin/set-permissions.sh

# Install matter.js
npm ci

# Configure playwright
npx playwright install chromium-headless-shell
