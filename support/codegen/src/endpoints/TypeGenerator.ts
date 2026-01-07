/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { int64, Metatype, uint64, ValueModel } from "#model";
import { ScopeFile } from "../util/ScopeFile.js";

/**
 * Generates TS types from models.
 *
 * Unlike TlvGenerator the TypeGenerator creates native TS types.
 */
export class TypeGenerator {
    constructor(private file: ScopeFile) {}

    reference(model: ValueModel | undefined, emptyAs = "any"): string {
        model = model?.definingModel;
        if (model === undefined) {
            return emptyAs;
        }

        const metabase = model?.metabase;
        if (metabase === undefined) {
            return emptyAs;
        }

        switch (metabase.metatype) {
            case Metatype.any:
                return "any";

            case Metatype.array:
                let arrayMember = this.reference(model.children[0]);
                if (arrayMember.replace(/\([^)]*\)/g, "").indexOf(" ") !== -1) {
                    arrayMember = `(${arrayMember})`;
                }
                return `${arrayMember}[]`;

            case Metatype.boolean:
                return "boolean";

            case Metatype.bytes:
                return "Uint8Array";

            case Metatype.integer:
                if (metabase.isGlobal && (metabase.name === uint64.name || metabase.name === int64.name)) {
                    return "number | bigint";
                }
                return "number";

            case Metatype.float:
                return "number";

            case Metatype.string:
                return "string";

            case Metatype.date:
                return "Date";

            case Metatype.duration:
                return "Duration";

            case Metatype.enum:
            case Metatype.bitmap:
            case Metatype.object:
                if (TypeGenerator.isEmpty(model)) {
                    return emptyAs;
                }
                return this.file.reference(model);
        }

        return emptyAs;
    }

    static isEmpty(model?: ValueModel) {
        if (model === undefined) {
            return true;
        }

        if (model.effectiveMetatype !== Metatype.object) {
            return true;
        }

        for (const child of model.children) {
            if (child.isDisallowed || (child.isDeprecated && !child.type)) {
                continue;
            }
            return false;
        }

        return true;
    }
}
