/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

/** Thrown when a Thread Operational Dataset cannot be decoded from malformed MeshCoP TLV bytes. */
export class ThreadDatasetError extends MatterError {}
