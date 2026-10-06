/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Metatype } from "../common/index.js";
import { Mei } from "../common/Mei.js";
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
     * Whether this is an enum member that stands for a range of values, such as a manufacturer-specific range.  Such a
     * member has no ID; its constraint states the range.
     */
    get isEnumRange() {
        return (
            this.id === undefined &&
            this.constraint.min !== undefined &&
            this.constraint.max !== undefined &&
            this.parent instanceof ValueModel &&
            this.parent.effectiveMetatype === Metatype.enum
        );
    }

    /**
     * Fields may omit their ID.  In this case we use their index within the parent as the ID, except for an
     * {@link isEnumRange enum range}, which has none.
     */
    override get effectiveId(): Mei | undefined {
        if (this.id !== undefined) {
            return this.id;
        }
        if (this.isEnumRange) {
            return undefined;
        }
        if (this.parent instanceof ValueModel) {
            const index = this.parent.children.indexOf(this);
            if (index !== -1) {
                return index;
            }
        }
    }

    /**
     * The key for bitmap fields and {@link isEnumRange enum ranges} is the constraint which defines the range.  All
     * other fields use the default key.
     */
    override get key() {
        if (
            (this.parent instanceof ValueModel && this.parent.effectiveMetatype === Metatype.bitmap) ||
            this.isEnumRange
        ) {
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
