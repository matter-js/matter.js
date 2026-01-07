/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#general";
import { NodeJsEnvironment } from "./NodeJsEnvironment.js";

Environment.default = NodeJsEnvironment();
