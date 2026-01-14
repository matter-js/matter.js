/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds, Time, Timestamp } from "#general";
import { uptime } from "node:os";

Time.startup.processMs = Timestamp(Time.nowMs - Seconds(process.uptime()));
Time.startup.systemMs = Timestamp(Time.nowMs - Seconds(uptime()));
