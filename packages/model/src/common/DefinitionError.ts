/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Describes an error in model construction.
 */
export type DefinitionError = {
    code: string;
    source: string;
    message: string;
    xref?: string;
};
