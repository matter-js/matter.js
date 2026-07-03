/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

/** Thrown when a MeshCoP diagnostic response carries malformed or missing TLVs. */
export class ThreadDiagError extends MatterError {}
