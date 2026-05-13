/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Access } from "#aspects/index.js";
import { FieldSemantics } from "#decoration/semantics/FieldSemantics.js";
import { AttributeModel } from "#models/AttributeModel.js";
import { ValueModel } from "#models/ValueModel.js";
import { Decorator } from "@matter/general";
import { element } from "./element.js";

/**
 * Default access for decorator-declared attributes: read-only with View read privilege ("R V"), the Matter spec
 * convention for read-only attributes.
 *
 * `readPriv` must be set alongside `rw: Read`: without it, `Access.isEmpty` reports true and `Access.extend` discards
 * the value during effective-access resolution, causing `Access.Default` (`RW V O`) to win and silently reverting
 * this default.
 *
 * The `writable` decorator overrides `rw` to `ReadWrite`; the resulting access then extends against `Access.Default`
 * to recover `writePriv: Operate`.
 */
const defaultAttributeAccess = Decorator<Decorator.PropertyCollector>((_target, context) => {
    const model = FieldSemantics.of(context).mutableModel;
    if (model instanceof ValueModel && model.access.rw === undefined) {
        model.access = new Access({ ...model.access, rw: Access.Rw.Read, readPriv: Access.Privilege.View });
    }
});

/**
 * Decorates a property as a Matter attribute.
 *
 * Decorator-declared attributes default to read-only.  Apply the `writable` decorator to mark an attribute as
 * writable.
 */
export const attribute = (...modifiers: element.Modifier<Decorator.PropertyCollector>[]) =>
    element(AttributeModel, defaultAttributeAccess, ...modifiers);
