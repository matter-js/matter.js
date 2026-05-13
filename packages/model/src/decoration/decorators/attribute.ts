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
 * Default access for decorator-declared attributes: read-only with View read privilege.  Matches the spec convention
 * "R V" so decorator-declared attributes inherit the same default as spec-defined attributes.  Use the `writable`
 * decorator to mark an attribute as writable.
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
