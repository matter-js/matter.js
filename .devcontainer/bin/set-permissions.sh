#!/bin/bash
# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# ROLE: Installed during container build; run with sudo via post-start.sh

# Make the container's node_modules volume writable
chown -R matter:matter /matter.js/node_modules

# Have had an issue here too, make sure permissions are correct
chown -R matter:matter /home/matter/.claude
