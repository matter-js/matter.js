/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { int64, Metatype, uint64, ValueModel } from "#model";
import { SpecializedNumbers, specializedNumberTypeFor } from "../clusters/NumberConstants.js";
import { ScopeFile } from "../util/ScopeFile.js";

/**
 * Generates TS types from models.
 *
 * Unlike TlvGenerator the TypeGenerator creates native TS types.
 */
export class TypeGenerator {
    /**
     * Optional callback invoked when a complex type model is referenced.  Used by ComponentGenerator to track which
     * types need local definitions.
     */
    onReference?: (model: ValueModel) => void;

    constructor(private file: ScopeFile) {}

    reference(model: ValueModel | undefined, emptyAs = "any"): string {
        const defining = this.#definingModel(model);
        if (defining === undefined) {
            return emptyAs;
        }

        return this.#typeOf(defining, emptyAs);
    }

    /**
     * Resolve the TypeScript type for a value model directly, without going through definingModel first.  This is
     * useful for attributes and other models that may be primitive types without children.
     */
    valueType(model: ValueModel | undefined, emptyAs = "any"): string {
        if (model === undefined) {
            return emptyAs;
        }

        const metabase = model.metabase;
        if (metabase === undefined) {
            return emptyAs;
        }

        switch (metabase.metatype) {
            case Metatype.bitmap: {
                // Bitmaps have both a const (BitFlag/BitField values) and an interface (boolean/number
                // fields) via declaration merging.  Reference the type name to get the interface.
                const defining = this.#definingModel(model);
                if (defining === undefined) {
                    const primitive = model.primitiveBase;
                    if (primitive) {
                        return this.#typeOf(primitive, emptyAs);
                    }
                    return emptyAs;
                }

                this.onReference?.(defining);
                return this.file.reference(defining);
            }

            case Metatype.enum:
            case Metatype.object: {
                const defining = this.#definingModel(model);
                if (defining === undefined) {
                    const primitive = model.primitiveBase;
                    if (primitive) {
                        return this.#typeOf(primitive, emptyAs);
                    }
                    return emptyAs;
                }

                return this.#typeOf(defining, emptyAs);
            }

            default:
                // Primitive types can resolve directly from metatype
                return this.#typeOf(model, emptyAs);
        }
    }

    /**
     * Find the defining model using the scope's shadow/extension resolution when available.  Falls back to the
     * model's own definingModel property.
     */
    #definingModel(model: ValueModel | undefined): ValueModel | undefined {
        if (model === undefined) {
            return undefined;
        }

        const scope = this.file.scope;
        if (scope) {
            // Try the model's own definingModel first, canonicalized through the scope
            const defining = scope.canonicalModelFor(model).definingModel;
            if (defining) {
                return scope.canonicalModelFor(defining);
            }

            // Walk up ancestors to find a defining model (handles ACEs in inherited clusters)
            return scope.definingModelFor(model);
        }

        return model.definingModel;
    }

    #typeOf(model: ValueModel, emptyAs: string): string {
        const metabase = model.metabase;
        if (metabase === undefined) {
            return emptyAs;
        }

        switch (metabase.metatype) {
            case Metatype.any:
                return "any";

            case Metatype.array:
                let arrayMember = this.valueType(model.listEntry);
                if (arrayMember.replace(/\([^)]*\)/g, "").indexOf(" ") !== -1) {
                    arrayMember = `(${arrayMember})`;
                }
                return `${arrayMember}[]`;

            case Metatype.boolean:
                return "boolean";

            case Metatype.bytes:
                this.file.addImport("@matter/general", "Bytes");
                return "Bytes";

            case Metatype.integer: {
                const specialBase = specializedNumberTypeFor(model);
                if (specialBase) {
                    const mapping = SpecializedNumbers[specialBase.name as keyof typeof SpecializedNumbers];
                    if (mapping?.category === "datatype") {
                        const typeName = mapping.type.replace(/^Tlv/, "");
                        this.file.addImport(`!types/datatype/${typeName}.js`, typeName);
                        return typeName;
                    }
                }
                if (metabase.isGlobal && (metabase.name === uint64.name || metabase.name === int64.name)) {
                    return "number | bigint";
                }
                return "number";
            }

            case Metatype.float:
                return "number";

            case Metatype.string:
                return "string";

            case Metatype.date:
                return "Date";

            case Metatype.duration:
                return "Duration";

            case Metatype.enum: {
                // Walk up the inheritance chain collecting all enum types with children,
                // producing a union type that matches TypeFromSchema.  This ensures alias
                // clusters with extended enums (e.g. RvcCleanMode.ModeChangeStatus |
                // ModeBase.ModeChangeStatus) get the full union type.
                const types = Array<string>();
                for (let m: ValueModel | undefined = model; m; m = m.base) {
                    if (!m.children.length) {
                        continue;
                    }
                    this.onReference?.(m);
                    types.push(this.file.reference(m, false, true));
                }
                if (types.length) {
                    return types.join(" | ");
                }
                this.onReference?.(model);
                return this.file.reference(model);
            }

            case Metatype.bitmap:
                this.onReference?.(model);
                return this.file.reference(model);

            case Metatype.object:
                if (TypeGenerator.isEmpty(model)) {
                    return emptyAs;
                }
                this.onReference?.(model);
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

        for (const child of model.members) {
            if (child.isDisallowed || (child.isDeprecated && !child.type)) {
                continue;
            }
            return false;
        }

        return true;
    }
}
