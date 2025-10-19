/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Quality } from "#aspects/Quality.js";
import { InvalidMetadataError } from "#decoration/errors.js";
import { FieldSemantics } from "#decoration/semantics/FieldSemantics.js";
import { Decorator } from "#general";
import { ValueModel } from "#models/ValueModel.js";

/**
 * Mark a field as nonvolatile (persistent).
 */
export const nonvolatile = Decorator<Decorator.PropertyCollector>((_target, context) => {
    const model = FieldSemantics.of(context).mutableModel;
    if (!(model instanceof ValueModel)) {
        throw new InvalidMetadataError("Only a value models may be nonvolatile");
    }
    model.quality = new Quality({ ...model.quality, nonvolatile: true });
});
