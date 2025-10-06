/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Scope } from "#logic/Scope.js";
import { Access, Aspect, Conformance, Constraint, Quality } from "../aspects/index.js";
import { ElementTag, FieldValue, Metatype } from "../common/index.js";
import { ValueElement } from "../elements/index.js";
import { ModelTraversal } from "../logic/ModelTraversal.js";
import { Model } from "./Model.js";
import type { PropertyModel } from "./PropertyModel.js";

// These are circular dependencies so just to be safe we only import the types.  We also need the class, though, at
// runtime.  So we use the references in the Model.constructors factory pool.
import { ModelIndex } from "#logic/ModelIndex.js";
import type { FieldModel } from "./FieldModel.js";

/**
 * Each {@link ValueElement} type has a corresponding implementation that derives from this class.
 */
export abstract class ValueModel<T extends ValueElement = ValueElement>
    extends Model<T, FieldModel>
    implements ValueElement
{
    byteSize?: ValueElement.ByteSize;
    default?: FieldValue;
    metatype?: Metatype;
    override isType? = true;

    #constraint: Constraint;
    #conformance: Conformance;
    #access: Access;
    #quality: Quality;

    get constraint(): Constraint {
        return this.#constraint;
    }
    set constraint(definition: Constraint | Constraint.Definition) {
        this.#constraint = Constraint.create(definition);
    }
    get effectiveConstraint(): Constraint {
        return new ModelTraversal().findConstraint(this) || this.constraint;
    }

    get conformance(): Conformance {
        return this.#conformance;
    }
    set conformance(definition: Conformance | Conformance.Definition) {
        this.#conformance = Conformance.create(definition);
    }
    get effectiveConformance(): Conformance {
        return new ModelTraversal().findAspect(this, "conformance", Conformance) ?? this.#conformance;
    }

    get access(): Access {
        return this.#access;
    }
    set access(definition: Access | Access.Definition) {
        this.#access = Access.create(definition);
    }
    get effectiveAccess(): Access {
        return new ModelTraversal().findAccess(this, ValueModel);
    }

    get quality(): Quality {
        return this.#quality;
    }
    set quality(definition: Quality | Quality.Definition) {
        this.#quality = Quality.create(definition);
    }
    get effectiveQuality(): Quality {
        return new ModelTraversal().findAspect(this, "quality", Quality) ?? this.#quality;
    }

    get fields() {
        return Scope(this).membersOf(this, { tags: [ElementTag.Field] }) as ModelIndex<FieldModel>;
    }

    get conformant() {
        return new ValueModel.Conformant(this);
    }

    /**
     * Metatype is only present on global types with specific semantic meaning. This model is significant because it
     * gives us information about how to manipulate the data.  This accessor retrieves this model.
     */
    get metabase(): ValueModel | undefined {
        return new ModelTraversal().findMetabase(this) as ValueModel | undefined;
    }

    /**
     * Get the primitive type for this value model.  This is an integer type for enums and bitmaps.  Otherwise it's the
     * metabase.
     */
    get primitiveBase(): ValueModel | undefined {
        const metabase = this.metabase;
        if (!metabase) {
            return;
        }

        // Enum is a derived type so we can just return its base
        if (metabase.metatype === Metatype.enum) {
            return metabase.base;
        }

        // Bitmaps are not derived types so we have to map manually
        if (metabase.metatype === Metatype.bitmap) {
            const primitiveName = metabase.name.replace("map", "uint");
            return metabase.parent?.children.find(c => c.name === primitiveName) as ValueModel | undefined;
        }

        return metabase;
    }

    /**
     * The "effective type" may be inferred from context.
     */
    override get effectiveType(): string | undefined {
        const type = super.effectiveType;
        if (type) {
            return type;
        }
        return new ModelTraversal().getTypeName(this);
    }

    /**
     * The working metatype for this object.
     */
    get effectiveMetatype() {
        const metaBase = this.metabase;
        if (metaBase) {
            return metaBase.metatype;
        }
    }

    /**
     * Get the first derived ancestor with children, if any.
     */
    get definingModel() {
        return new ModelTraversal().findDefiningModel(this);
    }

    /**
     * Get the entry type for lists, if any.
     */
    get listEntry() {
        return this.member("entry", [ElementTag.Field]) as FieldModel | undefined;
    }

    /**
     * ValueModels may only derive from ValueModels.
     */
    override get base() {
        return super.base as ValueModel | undefined;
    }

    /**
     * ValueModels may derive from models of the same type or from generic Datatype models.
     */
    override get allowedBaseTags() {
        if (this.tag === ElementTag.Field) {
            // Allow fields to derive from attributes.  We use this for referencing options in masks and bitmaps
            return [ElementTag.Field, ElementTag.Datatype, ElementTag.Attribute];
        }
        return [this.tag, ElementTag.Datatype];
    }

    /**
     * All {@link FieldModel} children in the context of the model's containing scope.
     */
    get members() {
        return Scope(this).membersOf(this) as ModelIndex<PropertyModel>;
    }

    /**
     * Collect constraints and conformance for this type and all base types.
     */
    get validationAspects() {
        const aspects = Array<Aspect<any>>();

        new ModelTraversal().visitInheritance(this, model => {
            if (model instanceof ValueModel) {
                if (!model.conformance.isEmpty && model.conformance.type !== Conformance.Special.Desc) {
                    aspects.push(model.conformance);
                }
                if (!model.constraint.isEmpty && !model.constraint.desc) {
                    aspects.push(model.constraint);
                }
                if (model.quality.nullable === false) {
                    aspects.push(model.quality);
                }
            }
        });

        return aspects;
    }

    /**
     * Is this model deprecated?
     */
    get isDeprecated() {
        return this.effectiveConformance.type === Conformance.Flag.Deprecated;
    }

    /**
     * Is this model disallowed?
     */
    get isDisallowed() {
        return this.effectiveConformance.type === Conformance.Flag.Disallowed;
    }

    /**
     * Can this model be omitted?
     */
    get nullable() {
        return !!this.effectiveQuality.nullable;
    }

    /**
     * Is the model mandatory?
     */
    get mandatory() {
        return this.effectiveConformance.isMandatory;
    }

    /**
     * Determine whether this element overrides key properties of its shadow.
     */
    get overridesShadow() {
        const shadow = this.shadow;
        if (!shadow || !(shadow instanceof ValueModel)) {
            return;
        }

        if (this.type && this.type !== shadow.type) {
            return true;
        }
        if (!this.conformance.isEmpty && !this.conformance.equals(shadow.conformance)) {
            return true;
        }
        if (!this.quality.isEmpty && !this.quality.equals(shadow.quality)) {
            return true;
        }
        if (!this.constraint.isEmpty && !this.constraint.equals(shadow.constraint)) {
            return true;
        }
        if (!this.access.isEmpty && !this.access.equals(shadow.access)) {
            return true;
        }
    }

    /**
     * Search the inheritance chain for a bitmap field defining a specific bit.
     */
    bitDefinition(bit: number) {
        return new ModelTraversal().findBitDefinition(this, bit);
    }

    /**
     * Clone the model with minimum metadata required to ensure model is valid.
     */
    cloneAsReference<This extends ValueModel>(this: This): This {
        const Type = this.constructor as new (definition: T) => This;
        return new Type(this.requiredFields as T);
    }

    get requiredFields() {
        return { name: this.name } as T;
    }

    constructor(definition: Model.Definition<ValueModel<T>>, ...children: Model.ChildDefinition<FieldModel>[]) {
        super(definition, ...children);

        this.byteSize = definition.byteSize;
        this.default = definition.default;
        this.#constraint = Constraint.create(definition.constraint);
        this.#conformance = Conformance.create(definition.conformance);
        this.#access = Access.create(definition.access);
        this.#quality = Quality.create(definition.quality);

        const match = this.type?.match(/^list\[(.*)\]$/);
        if (match) {
            this.type = "list";
            this.children.push(new Model.types.field({ name: "entry", type: match[1] }) as FieldModel);
        }
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            byteSize: this.byteSize,
            default: this.default,
            constraint: this.#constraint.valueOf(),
            conformance: this.#conformance.valueOf(),
            access: this.#access.valueOf(),
            quality: this.#quality.valueOf(),
            ...extra,
        });
    }
}

export namespace ValueModel {
    export class Conformant {
        #model: Model;

        constructor(model: Model) {
            this.#model = model;
        }

        /**
         * The model's conformant fields.
         */
        get fields() {
            return Scope(this.#model).membersOf(this.#model, {
                tags: [ElementTag.Field],
                conformance: "conformant",
            }) as ModelIndex<FieldModel>;
        }

        /**
         * An alias for {@link fields} that offers compatibility with the same field for clusters.
         */
        get properties() {
            return this.fields;
        }
    }
}
