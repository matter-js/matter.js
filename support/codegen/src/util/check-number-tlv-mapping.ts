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
        // Root datatypes such as int24 declare their metatype directly and have no `type` of their
        // own; only a reference to one (a field, attribute, or derived datatype naming it) is a use
        // that needs a codec.
        if (model instanceof ValueModel && model.type !== undefined && !hasNumberTlvMapping(model)) {
            unmapped.push(`${model.path} (type ${model.type})`);
        }
    });

    if (unmapped.length) {
        throw new InternalError(
            `${unmapped.length} model element${unmapped.length === 1 ? " uses" : "s use"} an integer or bitmap width with no TLV codec in @matter/types: ${unmapped.join(", ")}`,
        );
    }
}
