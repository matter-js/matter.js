/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvalidMetadataError } from "#decoration/errors.js";
import { FieldSemantics } from "#decoration/semantics/FieldSemantics.js";
import { Decorator } from "#general";

/**
 * Mark a field as mandatory.
 */
export const mandatory = Decorator<Decorator.PropertyCollector>((_target, context) => {
    const model = FieldSemantics.of(context).mutableModel;
    if (!("conformance" in model)) {
        throw new InvalidMetadataError(
            `Cannot set ${model.path} to mandatory because ${model.tag} elements do not support conformance`,
        );
    }
    model.conformance = "M";
});
