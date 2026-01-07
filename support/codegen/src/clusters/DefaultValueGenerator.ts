/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Properties } from "#general";
import { DefaultValue, Metatype, Scope, ValueModel } from "#model";
import { camelize, serialize } from "../util/string.js";
import { SpecializedNumbers, specializedNumberTypeFor } from "./NumberConstants.js";
import { TlvGenerator } from "./TlvGenerator.js";

/**
 * Generates a default value for fields based on model definitions.
 */
export class DefaultValueGenerator {
    #tlv: TlvGenerator;
    #scope: Scope;

    constructor(tlv: TlvGenerator) {
        this.#tlv = tlv;
        this.#scope = tlv.scope.scope;
    }

    create(model: ValueModel, defaultValue = DefaultValue(this.#scope, model, true)) {
        // We can't express "this field should default to the value of another field" in clusters so that isn't
        // contemplated here.  We do support that in the Behavior API but it runs directly off the model

        if (defaultValue === undefined || defaultValue === null) {
            return defaultValue;
        }

        switch (model.effectiveMetatype) {
            case Metatype.integer:
            case Metatype.float:
                return this.#createNumeric(defaultValue, model);

            case Metatype.enum:
                return this.#createEnum(defaultValue, model);

            case Metatype.bitmap:
                return this.#createBitmap(defaultValue, model);

            case Metatype.object:
                return this.#createObject(defaultValue, model);

            default:
                return defaultValue;
        }
    }

    /**
     * Simple numbers serialize either as one of our "wrapped ID" things or just as a numeric literal.
     */
    #createNumeric(defaultValue: any, model: ValueModel) {
        if (typeof defaultValue !== "number" && typeof defaultValue !== "bigint") return;
        const type = specializedNumberTypeFor(model);
        if (type && SpecializedNumbers[type.name]?.category === "datatype") {
            const specialized = SpecializedNumbers[type.name];
            if (!specialized) {
                throw new Error(`Unable to ascertain constructor for wrapped ID type ${type}`);
            }
            const constructor = specialized.type.replace("Tlv", "");
            this.#tlv.importTlv(specialized.category, constructor);
            return serialize.asIs(`${constructor}(${defaultValue})`);
        }
        return defaultValue;
    }

    /**
     * For enums, translate ID or string into an enum constant.
     */
    #createEnum(defaultValue: any, model: ValueModel) {
        if (typeof defaultValue === "number" || typeof defaultValue === "string") {
            const value = model.member(defaultValue);
            if (value?.parent) {
                const enumName = this.#tlv.file.reference(value.parent);
                if (enumName) {
                    return serialize.asIs(`${enumName}.${value.name}`);
                }
            }
        }
    }

    /**
     * Bitmaps are more complicated.  Input is an object of bit fields.  We generate a value for each field depending on
     * the field type.
     */
    #createBitmap(defaultValue: any, model: ValueModel) {
        if (typeof defaultValue !== "object" || defaultValue === null) {
            return;
        }

        const members = this.#scope.membersOf(model);
        const fields = Object.fromEntries(members.map(member => [camelize(member.name), member]));

        const properties = {} as { [name: string]: boolean | number | string };
        for (const name in defaultValue) {
            const field = fields[name];
            if (field === undefined) {
                throw new Error(`No model for bit field ${name}`);
            }

            const bits = defaultValue[name];
            const constraint = field.effectiveConstraint;
            if (typeof constraint.value === "number") {
                properties[name] = true;
            } else {
                let valueName: string | undefined;
                const defining = field.definingModel;
                const enumValue = defining?.member(bits);
                if (defining && enumValue) {
                    valueName = serialize.asIs(`${this.#tlv.file.reference(defining)}.${enumValue.name}`);
                }
                properties[name] = valueName ?? bits;
            }
        }

        if (!Object.keys(properties).length) {
            return;
        }

        const defining = model.definingModel;
        if (!defining) {
            throw new InternalError(`No defining model for ${model}`);
        }

        this.#tlv.file.addImport("!types/schema/BitmapSchema.js", "BitsFromPartial");
        return serialize.asIs(`BitsFromPartial(${this.#tlv.file.reference(defining)}, ${serialize(properties)})`);
    }

    /**
     * For objects, we need to recurse into each property.
     */
    #createObject(defaultValue: any, model: ValueModel) {
        // Neither of these should be true, this is more for TS's benefit
        if (typeof defaultValue !== "object" || defaultValue === undefined || defaultValue === null) {
            return;
        }

        const alreadyProcessed = new Set<string>();
        let result: Properties | undefined;
        for (const member of this.#scope.membersOf(model, { conformance: "deconflicted" })) {
            const name = camelize(member.name);

            // Members are listed with overrides first so we ignore subsequent definitions for the same name
            if (alreadyProcessed.has(name)) {
                continue;
            }
            alreadyProcessed.add(name);

            let value = defaultValue[name];
            if (value !== undefined) {
                value = this.create(member, value);
                if (value !== undefined) {
                    if (result === undefined) {
                        result = {};
                    }
                    result[name] = value;
                }
            }
        }

        return result;
    }
}
