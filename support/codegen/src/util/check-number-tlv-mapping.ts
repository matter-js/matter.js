/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import { MatterModel, ValueModel } from "#model";
import { hasNumberTlvMapping } from "@matter/types";

/**
 * Fail generation if any element's declared type resolves to an integer or bitmap width that
 * {@link hasNumberTlvMapping} cannot map to a TLV codec.
 *
 * Without this, such a width reaches Invoke/Write undetected and only throws InternalError there,
 * per operation, once someone ships a cluster that uses it.
 */
export function checkNumberTlvMapping(matter: MatterModel) {
    const unmapped = new Array<string>();

    matter.visit(model => {
        // A root datatype such as int24 is a declaration, not a use, and needs no codec of its own. Everything that
        // resolves through one is a use, including a field that states no type and inherits it — checking only an
        // explicit `type` would miss those.
        if (model instanceof ValueModel && model.metabase !== model && !hasNumberTlvMapping(model)) {
            // The resolved width, not the declaration: an alias states the alias name and an element that inherits
            // its type states nothing, and neither says which codec is missing
            unmapped.push(`${model.path} (${model.metabase?.name ?? "unresolved type"})`);
        }
    });

    if (unmapped.length) {
        throw new InternalError(
            `${unmapped.length} model element${unmapped.length === 1 ? " uses" : "s use"} an integer or bitmap width with no TLV codec in @matter/types: ${unmapped.join(", ")}`,
        );
    }
}
