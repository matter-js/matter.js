# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# Die on error
set -e

# Make the container's node_modules volume writable
sudo chown $USER node_modules

# Install matter.js
npm ci

# Configure playwright
sudo npx playwright install-deps
npx playwright install chromium-headless-shell
