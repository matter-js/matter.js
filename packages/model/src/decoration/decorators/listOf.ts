/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Semantics } from "#decoration/semantics/Semantics.js";
import { FieldModel } from "#models/FieldModel.js";
import type { Model } from "#models/Model.js";
import { Schema } from "#models/Schema.js";
import { Decorator } from "@matter/general";

/**
 * Decorate a property as an array.
 */
export function listOf(entry: Model.Source): Decorator.PropertyCollector {
    return Decorator((_target, context) => {
        Semantics.of(context).mutableModel.operationalBase = new FieldModel(
            {
                name: context.name.toString(),
                type: "list",
            },

            new FieldModel({
                name: "entry",
                operationalBase: Schema(entry),
            }),
        );
    });
}
