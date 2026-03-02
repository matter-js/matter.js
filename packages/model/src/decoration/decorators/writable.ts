/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Access } from "#aspects/index.js";
import { InvalidMetadataError } from "#decoration/errors.js";
import { FieldSemantics } from "#decoration/semantics/FieldSemantics.js";
import { ValueModel } from "#models/ValueModel.js";
import { Decorator } from "@matter/general";

/**
 * Mark a field as writable
 */
export const writable = Decorator<Decorator.PropertyCollector>((_target, context) => {
    const model = FieldSemantics.of(context).mutableModel;
    if (!(model instanceof ValueModel)) {
        throw new InvalidMetadataError("Only value models may be writable");
    }
    model.access = new Access({ ...model.access, rw: Access.Rw.ReadWrite });
});
