/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mei } from "../common/Mei.js";
import { Metatype } from "../common/index.js";
import { FieldElement } from "../elements/index.js";
import { Model } from "./Model.js";
import { PropertyModel } from "./PropertyModel.js";
import { ValueModel } from "./ValueModel.js";

export class FieldModel extends PropertyModel<FieldElement> implements FieldElement {
    override tag: FieldElement.Tag = FieldElement.Tag;

    title?: string;

    get fabricSensitive() {
        return this.effectiveAccess.fabricSensitive;
    }

    /**
     * Fields may omit their ID.  In this case we use their index within the parent as the ID.
     */
    override get effectiveId(): Mei | undefined {
        if (this.id !== undefined) {
            return this.id;
        }
        if (this.parent instanceof ValueModel) {
            const index = this.parent.children.indexOf(this);
            if (index !== -1) {
                return index;
            }
        }
    }

    /**
     * The key for bitmap fields is actually the constraint which defines the bit range.  All other datatypes use the
     * default key.
     */
    override get key() {
        if (this.parent instanceof ValueModel && this.parent.effectiveMetatype === Metatype.bitmap) {
            return this.constraint.toString();
        }
        return super.key;
    }

    constructor(definition: Model.Definition<FieldModel>, ...children: Model.ChildDefinition<FieldModel>[]) {
        super(definition, ...children);

        this.title = definition.title;
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            title: this.title,
            ...extra,
        });
    }

    static Tag = FieldElement.Tag;
}

FieldModel.register();
