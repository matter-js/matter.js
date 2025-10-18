/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#general";

export class MetadataError extends ImplementationError {}

/**
 * Thrown when a type is assigned to a class or property that is already typed.
 */
export class MetadataConflictError extends MetadataError {}

/**
 * Thrown when metadata is inappropriate for the decorated language element.
 */
export class InvalidMetadataError extends MetadataError {}

/**
 * Thrown when an error occurs instantiating a dummy instance of a class for introspection purposes.
 */
export class ClassIntrospectionError extends MetadataError {}

/**
 * Thrown when required metadata is missing.
 */
export class MissingMetadataError extends MetadataError {}
