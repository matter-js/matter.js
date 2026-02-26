/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Directory } from "./Directory.js";

/**
 * Root directory and Environment service key for filesystem access.
 *
 * Register as an environment service:
 *
 *     env.set(Filesystem, new MyFilesystem(...))
 *
 * Retrieve from the environment:
 *
 *     const fs = env.get(Filesystem)
 */
export abstract class Filesystem extends Directory {}
