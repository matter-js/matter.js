/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import { DatatypeModel, Model } from "#model";
import { ScopeFile } from "../util/ScopeFile.js";
import { TlvGenerator } from "./TlvGenerator.js";

/**
 * Generate a standalone global datatype.  Currently we only generate compound datatypes this way.
 */
export function generateGlobal(model: Model) {
    if (!(model instanceof DatatypeModel)) {
        return;
    }

    if (!model.definesFields) {
        return;
    }

    const file = new ScopeFile({ scope: model });

    if (!model.parent) {
        throw new InternalError(`Cannot generated unparented global model ${model.name}`);
    }

    const tlv = new TlvGenerator(file);
    tlv.defineDatatype(model);

    return file;
}
