/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Base type for semantic identifiers per Matter specification.  Formally a 32-bit unsigned integer with assigned bit
 * functions:
 *
 *     Bits 0-15 are the identifier's scope:
 *         0x0000: Standard (global) or scoped (within cluster) ID
 *         0x0001 - 0xfff0: Manufacturer code as defined by CSA group
 *         0xfff1 - 0xfff4: Test manufacturer codes
 *     Bits 16-31 are the actual identifier
 *
 * For this and following types, the specification defines restrictions that we do not express statically with
 * TypeScript.
 */
export type ManufacturerExtensibleIdentifier = number;
export type Mei = ManufacturerExtensibleIdentifier;
