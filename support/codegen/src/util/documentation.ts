/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Model, ValueModel } from "#model";
import { Documentation } from "./TsFile.js";

/**
 * Documentation of a value, falling back to the definition it refines.
 *
 * A derived cluster restates a value to change one aspect of it; the specification documents the value only where it
 * is first defined.
 */
export function documentationOf(model: Model): Documentation {
    const documentation: Documentation = {
        description: model.description,
        details: model.details,
        xref: model.xref,
        isDeprecated: model instanceof ValueModel ? model.isDeprecated : undefined,
    };

    if (documentation.details !== undefined) {
        return documentation;
    }

    const shadow = model.shadow;
    if (shadow === undefined) {
        return documentation;
    }

    return {
        ...documentation,
        description: documentation.description ?? shadow.description,
        details: shadow.details,
        xref: documentation.xref ?? shadow.xref,
    };
}
