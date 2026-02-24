#!/bin/bash
# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# NOTE: Runs after container is created as node user without sudo access

set -e

sudo /usr/local/share/docker-init.sh
sudo /usr/local/bin/init-firewall.sh
