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
    declare instance?: number;
    declare location?: RequirementElement.Location;

    #constraint: Constraint;
    #conformance: Conformance;
    #access: Access;
    #quality: Quality;

    override get discriminator() {
        return this.element;
    }

    /**
     * The instance this requirement is one of, where it states a number that counts instances.
     *
     * Instances are numbered from one, so a number that counts none states no instance at all.  This is the only
     * reading of {@link instance}: a requirement is told apart by the instance it belongs to, so a number that means
     * nothing must not make two requirements that are the same look different.
     */
    get instanceNumber() {
        const { instance } = this;
        return typeof instance === "number" && Number.isInteger(instance) && instance >= 1 ? instance : undefined;
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
     * The numeric range the requirement's constraint states, such as the number of endpoints a component device type
     * requirement requires.
     *
     * Undefined when the constraint bounds no number (`all`, `desc` or no constraint at all) and when it has several
     * parts (e.g. `1 to 2, 4`). An exact number (e.g. `1`) is both bounds. An undefined bound means there is no bound
     * on that side.
     */
    get componentCountRange(): RequirementModel.CountRange | undefined {
        const { value, min, max } = this.constraint;
        if (typeof value === "number") {
            return { min: value, max: value };
        }

        const lower = typeof min === "number" ? min : undefined;
        const upper = typeof max === "number" ? max : undefined;
        if (lower === undefined && upper === undefined) {
            return undefined;
        }
        return { min: lower, max: upper };
    }

    /**
     * Is the element mandatory?
     */
    get isMandatory() {
        return this.conformance.isMandatory;
    }

    /**
     * Is the element disallowed?
     */
    get isDisallowed() {
        return this.conformance.isDisallowed;
    }

    constructor(
        definition: Model.Definition<RequirementModel>,
        ...children: Model.ChildDefinition<RequirementModel>[]
    ) {
        super(definition, ...children);

        this.element = definition.element as RequirementElement.ElementType;
        this.default = definition.default;
        this.instance = definition.instance;
        this.location = definition.location as RequirementElement.Location;
        this.#constraint = Constraint.create(definition.constraint);
        this.#conformance = Conformance.create(definition.conformance);
        this.#access = Access.create(definition.access);
        this.#quality = Quality.create(definition.quality);
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            element: this.element,
            instance: this.instance,
            location: this.location,
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

    /**
     * The range of {@link RequirementModel.componentCountRange}, inclusive at both ends.
     */
    export interface CountRange {
        /**
         * The lowest number allowed, or undefined if there is no lower bound.
         */
        min?: number;

        /**
         * The highest number allowed, or undefined if there is no upper bound.
         */
        max?: number;
    }
}
