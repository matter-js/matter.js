/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "../MatterError.js";

/**
 * Base error for filesystem operations.
 */
export class FilesystemError extends MatterError {}

/**
 * Thrown when a file or directory is not found.
 */
export class FileNotFoundError extends FilesystemError {}
