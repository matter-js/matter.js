/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Schema } from "@matter/model";

const declaredSchemas = new WeakMap<object, Schema>();

/**
 * Record the model a behavior class declares, either as a static `schema` value or as the model a generated class is
 * built for.
 *
 * Behavior's decoration hook uses it in place of the parent's model.
 */
export function setDeclaredSchema(type: object, schema: Schema) {
    declaredSchemas.set(type, schema);
}

/**
 * The model recorded by {@link setDeclaredSchema}, if any.
 */
export function declaredSchemaOf(type: object) {
    return declaredSchemas.get(type);
}
