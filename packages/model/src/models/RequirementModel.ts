/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Access, Conformance, Constraint, Quality } from "../aspects/index.js";
import { ElementTag } from "../common/index.js";
import { RequirementElement } from "../elements/index.js";
import { FieldModel } from "./FieldModel.js";
import { Model } from "./Model.js";

export class RequirementModel extends Model<RequirementElement, RequirementModel.Child> implements RequirementElement {
    override tag: RequirementElement.Tag = RequirementElement.Tag;
    declare element: RequirementElement.ElementType;
    declare default?: any;

    #constraint: Constraint;
    #conformance: Conformance;
    #access: Access;
    #quality: Quality;

    override get discriminator() {
        return this.element;
    }

    get constraint(): Constraint {
        return this.#constraint;
    }
    set constraint(definition: Constraint | Constraint.Definition) {
        this.#constraint = Constraint.create(definition);
    }

    get conformance(): Conformance {
        return this.#conformance;
    }
    set conformance(definition: Conformance | Conformance.Definition) {
        this.#conformance = Conformance.create(definition);
    }

    get access(): Access {
        return this.#access;
    }
    set access(definition: Access | Access.Definition) {
        this.#access = Access.create(definition);
    }

    get quality(): Quality {
        return this.#quality;
    }
    set quality(definition: Quality | Quality.Definition) {
        this.#quality = Quality.create(definition);
    }

    /**
     * Condition requirements may derive from ConditionElement models via qualified types
     * (e.g. type: "RootNode.AclExtensionCond").
     */
    override get allowedBaseTags() {
        if (this.element === RequirementElement.ElementType.Condition) {
            return [this.tag, ElementTag.Condition];
        }
        return [this.tag];
    }

    get requirements() {
        return this.all(RequirementModel);
    }

    /**
     * Is the element mandatory?
     */
    get isMandatory() {
        return this.conformance.isMandatory;
    }

    constructor(
        definition: Model.Definition<RequirementModel>,
        ...children: Model.ChildDefinition<RequirementModel>[]
    ) {
        super(definition, ...children);

        this.element = definition.element as RequirementElement.ElementType;
        this.default = definition.default;
        this.#constraint = Constraint.create(definition.constraint);
        this.#conformance = Conformance.create(definition.conformance);
        this.#access = Access.create(definition.access);
        this.#quality = Quality.create(definition.quality);
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            element: this.element,
            default: this.default,
            constraint: this.#constraint.valueOf(),
            conformance: this.#conformance.valueOf(),
            access: this.#access.valueOf(),
            quality: this.#quality.valueOf(),
            ...extra,
        });
    }

    static Tag = RequirementElement.Tag;
}

RequirementModel.register();

export namespace RequirementModel {
    export type Child = RequirementModel | FieldModel;
}
