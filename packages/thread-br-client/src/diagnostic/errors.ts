/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

/** Thrown when a MeshCoP diagnostic exchange fails — a malformed/missing TLV or a timed-out response. */
export class ThreadDiagError extends MatterError {}
