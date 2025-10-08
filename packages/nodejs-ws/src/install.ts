/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WsAdapter } from "#nodejs";
import { factory } from "./factory.js";

WsAdapter.defaultFactory = factory;
