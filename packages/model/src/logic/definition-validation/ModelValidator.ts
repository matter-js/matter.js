/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CrossReference } from "#models/CrossReference.js";
import { ElementTag } from "../../common/index.js";
import { CommandModel, Model, RequirementModel, ValueModel } from "../../models/index.js";

/**
 * Base class for all model validators.
 */
export class ModelValidator<T extends Model> {
    constructor(protected model: T) {}

    validate() {
        this.validateProperty({ name: "name", type: "string", required: true });
        this.validateProperty({ name: "description", type: "string" });
        this.validateProperty({ name: "details", type: "string" });
        this.validateProperty({ name: "children", type: Array });
        this.validateProperty({ name: "type", type: "string" });
        this.validateProperty({ name: "xref", type: CrossReference });
        this.validateProperty({ name: "root", type: "object", required: true });

        if (this.model.type) {
            const base = this.model.base;
            if (!base) {
                this.error("TYPE_UNKNOWN", `Type ${this.model.type} does not resolve`);
            }
        }

        if (this.model.xref) {
            const parentXref = this.model.parent?.effectiveXref;
            if (parentXref && this.model.xref === parentXref) {
                delete this.model.xref;
            }
        }

        this.validateChildUniqueness();
    }

    error(code: string, message: string) {
        this.model.error(code, message);
    }

    protected validateStructure(requireId: boolean, ...childTypes: Model.Type[]) {
        this.validateProperty({ name: "id", type: "number", required: requireId });
        if (this.model.children && childTypes.length) {
            let index = 0;
            for (const child of this.model.children) {
                let ok = false;
                for (const type of childTypes) {
                    if (child instanceof type) {
                        ok = true;
                        break;
                    }
                }
                if (!ok) {
                    this.error("UNACCEPTABLE_TYPE", `${child.path} type ${child.constructor.name} is not allowed`);
                }
                index++;
            }
        }
    }

    protected validateProperty({ name, type, required, nullable }: Model.PropertyValidation) {
        const value = (this.model as any)[name];
        if (value === undefined) {
            if (required) {
                this.error("REQUIRED_PROPERTY", `Missing required property ${name}`);
                return;
            }
            return;
        }
        if (value === null) {
            if (nullable) {
                this.error("NULL_PROPERTY", `Property ${name} is null`);
                return;
            }
            return;
        }
        if (Number.isNaN(value)) {
            this.error("NAN_PROPERTY", `Property ${name} is NaN`);
        }
        if (type === undefined) {
            return;
        }
        if (typeof type === "string") {
            if (typeof value !== type) {
                this.error("NON_STRING_PROPERTY", `Property ${name} type is ${typeof value} (expected ${type})`);
            }
            return;
        }
        if (typeof type === "function") {
            if (!(value instanceof type)) {
                this.error("PROPERTY_NOT_INSTANCE", `Property ${name} is not an instance of ${type.name}`);
            }
            return;
        }
        if (!Object.values(type).includes(value)) {
            this.error("INVALID_ENUM_KEY", `Property ${name} value ${value} is not in enum`);
        }
    }

    private validateChildUniqueness() {
        const identities = {} as { [identity: string]: number };

        for (const child of this.model.children) {
            function addIdentity(id: string | number) {
                if (child instanceof CommandModel) {
                    id = `${id}:${child.direction}`;
                } else if (child instanceof RequirementModel) {
                    id = `${id}:${child.element}`;
                }
                const identity = `${child.tag};${id};${(child as ValueModel).conformance}`;
                if (identities[identity]) {
                    identities[identity]++;
                } else {
                    identities[identity] = 1;
                }
            }

            addIdentity(child.name);

            if (child.effectiveId) {
                addIdentity(child.effectiveId);
            }
        }

        for (const identity in identities) {
            if (identities[identity] > 1) {
                const parts = identity.split(";");
                this.error("DUPLICATE_CHILD", `Duplicate ${parts[0]} ${parts[1]}`);
            }
        }
    }
}

export namespace ModelValidator {
    export const validators = {} as {
        [key in ElementTag]: new (model: any) => ModelValidator<any>;
    };
}
