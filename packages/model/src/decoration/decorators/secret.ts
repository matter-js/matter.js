/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvalidMetadataError } from "#decoration/errors.js";
import { FieldSemantics } from "#decoration/semantics/FieldSemantics.js";
import { ValueModel } from "#models/ValueModel.js";
import { Decorator } from "@matter/general";

/**
 * Mark a field as secret, such as a key or a password.  Log output replaces its value with a placeholder.
 *
 * @see {@link ValueModel.isSecret}
 */
export const secret = Decorator<Decorator.PropertyCollector>((_target, context) => {
    const model = FieldSemantics.of(context).mutableModel;
    if (!(model instanceof ValueModel)) {
        throw new InvalidMetadataError("Only value models may be secret");
    }
    model.isSecret = true;
});
