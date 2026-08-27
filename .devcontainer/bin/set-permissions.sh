#!/bin/bash
# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# ROLE: Installed during container build; run with sudo via post-create.sh

# Make the container's node_modules volume writable
chown -R matter:matter /matter.js/node_modules

# A volume mounted over a build-time directory arrives root-owned, undoing the Dockerfile's chown
chown -R matter:matter /home/matter/.claude /home/matter/.commandhistory
