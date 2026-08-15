/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "#general";

/** Raised when the CHIP data model cannot be obtained. */
export class DataModelSourceError extends MatterError {}

/** Raised when CHIP data model XML contains a construct the translator does not understand. */
export class DataModelSyntaxError extends MatterError {}
