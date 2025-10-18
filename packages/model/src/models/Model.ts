/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, decamelize, ImplementationError } from "#general";
import { DefinitionError, ElementTag, Metatype, Specification } from "../common/index.js";
import { AnyElement, BaseElement } from "../elements/index.js";
import { ModelTraversal } from "../logic/ModelTraversal.js";
import { Children, InternalChildren } from "./Children.js";
import type { MatterModel } from "./MatterModel.js";
import { Resource, ResourceBundle } from "./Resource.js";

const inspect = Symbol.for("nodejs.util.inspect.custom");

/**
 * Thrown when model API is used incorrectly.
 */
export class StructuralModelError extends ImplementationError {}

/**
 * A "model" is a class that implements runtime functionality associated with the corresponding element type.
 *
 * @template E the element type this model implements
 */
export abstract class Model<E extends BaseElement = BaseElement, C extends Model = Model<BaseElement, any>> {
    abstract readonly tag: ElementTag;
    type?: string;
    isSeed?: boolean;

    #id: E["id"];
    #name: string;
    #isFinal?: boolean;
    #resource?: Resource;

    /**
     * Indicates that an element defines a datatype.
     */
    isType?: boolean;

    /**
     * Normally {@link base} performs lookup based on {@link type}.  Setting this field short circuits this resolution.
     *
     * The operational base also enables resolution from the operational base's tree.  This enables resolution on
     * operational models that are not installed in a parent hierarchy.
     *
     * We set the operational base when freezing the model.
     */
    operationalBase?: Model | null;

    /**
     * This is like {@link operationalBase} except for the element's shadow.
     */
    operationalShadow?: Model | null;

    #children?: InternalChildren<C>;
    #parent?: Model;
    #root?: MatterModel;

    get id(): E["id"] {
        return this.#id;
    }

    set id(value: E["id"]) {
        const oldId = this.effectiveId;
        this.#id = value;
        (this.#parent?.children as InternalChildren | undefined)?.updateId(this, oldId);
    }

    get name() {
        return this.#name;
    }

    set name(value: string) {
        const oldName = this.#name;
        this.#name = value;
        (this.#parent?.children as InternalChildren | undefined)?.updateName(this, oldName);
    }

    /**
     * Did validation find errors?
     */
    get valid() {
        return !this.errors;
    }

    /**
     * The path ("." delimited) in the Matter tree.
     *
     * This is informational and generally tries to adhere to JS API conventions.
     */
    get path(): string {
        if (this.parent && this.parent.tag !== ElementTag.Matter) {
            if (this.parent.tag === ElementTag.Field) {
                return `${this.parent.path}.${camelize(this.name)}`;
            }

            if (this.parent.tag === ElementTag.Cluster) {
                switch (this.tag) {
                    case ElementTag.Attribute:
                        return `${this.parent.path}.state.${camelize(this.name, false)}`;

                    case ElementTag.Command:
                        return `${this.parent.path}.${camelize(this.name, false)}`;

                    case ElementTag.Event:
                        return `${this.parent.path}.events.${camelize(this.name, false)}`;
                }
            }

            const parent = this.parent;
            if (parent.tag !== ElementTag.Cluster) {
                const parentMetatype = (parent as { effectiveMetatype?: Metatype })?.effectiveMetatype;
                if (parentMetatype === Metatype.object || parentMetatype === Metatype.array) {
                    return `${parent.path}.${camelize(this.name, false)}`;
                }
            }

            return `${parent.path}.${this.name}`;
        } else {
            return this.name;
        }
    }

    /**
     * Determine if this model resides in the global namespace.
     */
    get isGlobal() {
        return this.tag === "matter" || this.parent?.tag === "matter";
    }

    /**
     * The structural parent.  This is the model for the element that contains this element's definition.
     */
    get parent(): Model | undefined {
        return this.#parent;
    }

    /**
     * The structural root.  This is the MatterModel that owns this model.
     */
    get root() {
        return this.#root;
    }

    set parent(parent: Model | undefined) {
        if (this.parent === parent) {
            return;
        }

        if (this.parent) {
            const index = this.parent.children.indexOf(this);
            if (index !== -1) {
                this.parent.children.splice(index, 1);
            }
        }

        if (parent) {
            parent.children.push(this);
        }

        // Note that parent updates this.#parent so don't touch that
    }

    /**
     * Allows subclasses to pull a working ID from an alternate source.
     */
    get effectiveId() {
        return this.id;
    }

    /**
     * Get a string that uniquely identifies this model.  This is normally the effective ID but some models require a
     * generated identifier.
     */
    get key() {
        const key = this.effectiveId?.toString();
        if (key === undefined) {
            return key;
        }
        const discriminator = this.discriminator;
        if (discriminator === undefined) {
            return key;
        }
        return `${key}␜${discriminator}`;
    }

    /**
     * Obtain a discriminator that differentiates different models with the same name
     */
    get discriminator(): string | undefined {
        return;
    }

    /**
     * Children of models are always models.
     */
    get children(): Children<C> {
        if (!this.#children) {
            // Construct new Children instance via setter
            this.children = [];
        }
        return this.#children as Children<C>;
    }

    get hasChildren(): boolean {
        return !!this.#children?.length;
    }

    /**
     * Set the children of the model.
     */
    set children(children: Children.InputIterable<C>) {
        this.#children = Children(
            children,

            child => {
                if (child.#parent === this) {
                    return;
                }

                if (child.#parent) {
                    const position = child.#parent.children.indexOf(child);
                    if (position !== -1) {
                        child.#parent.children.splice(position, 1);
                    }
                }

                child.#parent = this;
            },

            (child, sharesRoot) => {
                const root = sharesRoot ? this.root : undefined;

                if (child.#root === root) {
                    return false;
                }

                child.#root = root;

                return true;
            },

            child => {
                if (child.#parent === this) {
                    child.#parent = undefined;
                    return true;
                }
                return false;
            },
        );
    }

    /**
     * Factory support.
     */
    static types = {} as { [type: string]: Model.ConcreteType };

    /**
     * Add a new model implementation.
     */
    static register(this: Model.ConcreteType) {
        Model.types[this.Tag] = this;
    }

    /**
     * All possible tags for registered models of this type.
     */
    static get tags() {
        return Object.values(Model.types)
            .filter(type => type instanceof this)
            .map(type => type.Tag);
    }

    /**
     * In some circumstances the base type can be inferred.  This inference happens here.
     *
     * Does not recurse so only returns the direct base type.
     */
    get effectiveType() {
        return this.type;
    }

    /**
     * Get a model for my base type as defined by {@link type}, if any.
     */
    get base(): Model | undefined {
        if (this.operationalBase !== undefined) {
            return this.operationalBase ?? undefined;
        }
        return new ModelTraversal().findBase(this);
    }

    /**
     * Get shadow model, if any.  A "shadow" is an element in my parent's inheritance hierarchy that I override.
     */
    get shadow(): Model | undefined {
        if (this.operationalShadow !== undefined) {
            return this.operationalShadow ?? undefined;
        }
        return new ModelTraversal().findShadow(this);
    }

    /**
     * Get the first global base type.  This may have semantic meaning more specific than the base primitive type.
     */
    get globalBase() {
        return new ModelTraversal().findGlobalBase(this);
    }

    /**
     * A local or parent xref.
     */
    get effectiveXref() {
        return new ModelTraversal().findXref(this);
    }

    /**
     * The set of tags from which this model may derive.
     */
    get allowedBaseTags() {
        return [this.tag];
    }

    /**
     * Update a subset of fields.
     *
     * Only allows for updates to element properties.  Recurses to children.
     */
    patch(values: Model.Patch<E>) {
        for (const [name, value] of Object.entries(values.valueOf())) {
            this[name as keyof typeof this] = value;
        }
    }

    /**
     * Determine whether this element applies to a specific revision.
     */
    appliesTo(revision: Specification.Revision) {
        // Stick to simple string comparison for now as it is efficient; update if versioning ever gets more complex
        // (or Matter reaches version 10)
        return (
            (this.asOf === undefined || revision >= this.asOf) && (this.until === undefined || revision < this.until)
        );
    }

    /**
     * Create a model for an element.
     */
    static create(definition: AnyElement) {
        if (typeof definition !== "object") {
            throw new StructuralModelError(`Model definition must be object, not ${typeof definition}`);
        }
        const t = definition["tag"];
        const constructor = Model.types[t];
        if (!constructor) {
            throw new StructuralModelError(`Unknown element tag "${t}"`);
        }
        return new constructor(definition);
    }

    /**
     * Retrieve all models of a specific element type from local scope.
     *
     * @param type model class or a predicate object
     * @param key filters to models matching a specific type
     */
    all<T extends Model>(type: Model.Type<T>, key?: number | string): T[] {
        return this.children.all(type, key);
    }

    /**
     * Retrieve a specific child by ID or name.
     */
    get<T extends Model>(type: Model.Type<T>, key: number | string): T | undefined {
        return this.children.get(type, key);
    }

    /**
     * Retrieve a model of a specific type from the ownership hierarchy.
     */
    owner<T extends Model>(constructor: Model.Type<T>) {
        return new ModelTraversal().findOwner(constructor, this);
    }

    /**
     * Record a validation error for this model.
     */
    error(code: string, message: string) {
        if (!this.errors) {
            this.errors = [];
        }

        this.errors.push({
            code,
            source: this.path,
            message,
            xref: this.effectiveXref?.toString(),
        });
    }

    /**
     * Convert model to JSON.
     */
    toJSON() {
        const fields = this.valueOf();
        if (this.children.length) {
            fields.children = this.children.map(child => child.toJSON());
        }
        return fields;
    }

    /**
     * Convert to non-class structure.
     */
    valueOf() {
        return this.toElement();
    }

    /**
     * Convert to elemental form.
     */
    toElement(omitResources = false, extra?: Record<string, unknown>) {
        if (omitResources) {
            return {
                tag: this.tag,
                type: this.type,
                isSeed: this.isSeed,
                id: this.id,
                name: this.name,
                ...extra,
            } as unknown as E;
        }

        const result = {
            tag: this.tag,
            type: this.type,
            isSeed: this.isSeed,
            id: this.#id,
            name: this.#name,
            ...this.resource,
            ...extra,
        };

        delete result.errors;

        return result as unknown as E;
    }

    /**
     * Apply a function to all tree elements.
     */
    visit(visitor: (model: Model) => boolean | void) {
        return new ModelTraversal().visit(this, visitor);
    }

    /**
     * Visit this model and each of its ancestors.
     */
    forEachAncestor(fn: (model: Model) => boolean | void) {
        new ModelTraversal().visitInheritance(this, fn);
    }

    /**
     * Find all children that reference a specific type.
     */
    references(type: Model) {
        return new ModelTraversal().findReferences(this, type);
    }

    /**
     * Search the inheritance chain for a child property.
     */
    member(key: Children.Selector, allowedTags = [ElementTag.Field, ElementTag.Attribute]): Model | undefined {
        return new ModelTraversal().findMember(this, key, allowedTags);
    }

    /**
     * Access a member that must exist.
     */
    require<T extends Model>(type: Model.ConcreteType<T>, key: Children.Selector): T {
        let member = this.member(key, [type.Tag]);
        if (member === undefined && typeof key === "string") {
            member = this.member(camelize(key, true));
        }
        if (member !== undefined) {
            return member as T;
        }

        let what;
        switch (typeof key) {
            case "string":
                what = `"${key}"`;
                break;

            case "number":
                what = `#${key}"`;
                break;

            default:
                what = `selected`;
        }

        throw new StructuralModelError(`No ${type.Tag} ${what} for ${this.tag} ${this.name}`);
    }

    /**
     * Does this model derive from another?
     */
    instanceOf(other: Model | AnyElement) {
        return new ModelTraversal().instanceOf(this, other);
    }

    /**
     * Clone the model.  This deep copies all descendant child models but not other properties.
     */
    clone<This extends Model>(this: This): This {
        const Type = this.constructor as new (model: Model) => This;
        return new Type(this);
    }

    /**
     * Create an operational extension of the model.  This creates a new model that inherits from this model for
     * operational purposes.
     */
    extend<This extends Model>(
        this: This,
        properties?: Partial<BaseElement.Properties<E>>,
        ...children: Model.ChildDefinition<Model>[]
    ): This {
        const constructor = this.constructor as new (properties: unknown) => This;

        const definition = {
            id: this.id,
            name: this.name,

            ...properties,

            tag: this.tag,
            operationalBase: this,
        };

        if (children.length) {
            if (definition.children) {
                definition.children = [...definition.children, ...children];
            } else {
                definition.children = children;
            }
        }

        const extension = new constructor(definition);

        return extension;
    }

    constructor(definition: Model.Definition<Model<E>>, ...children: Model.TaggedDefinition<C>[]) {
        if (typeof definition !== "object") {
            throw new StructuralModelError(`Model definition must be an object, not ${typeof definition}`);
        }

        const isClone = definition instanceof Model;

        this.#id = definition.id;
        this.#name = definition.name;
        this.type = definition.type;
        this.isSeed = definition.isSeed;
        this.operationalBase = definition.operationalBase;
        this.operationalShadow = definition.operationalShadow;

        if (isClone) {
            if (definition.hasLocalResource) {
                this.resource = definition.resource;
            }
        } else {
            if (
                "description" in definition ||
                "xref" in definition ||
                "details" in definition ||
                "xref" in definition ||
                "errors" in definition ||
                "asOf" in definition ||
                "until" in definition ||
                "matchTo" in definition
            ) {
                this.resource = new Resource(definition);
            }
        }

        if (isClone) {
            for (const child of definition.children) {
                this.children.push(child.clone() as Model.ChildOf<typeof this>);
            }
        } else if (definition.children) {
            this.children.push(...(definition.children as Iterable<Model.ChildOf<typeof this>>));
        }

        if (children.length) {
            this.children.push(...children);
        }

        if (!isClone && definition.parent) {
            this.parent = definition.parent;
        }
    }

    /**
     * Finalize the model hierarchy rooted at this model.
     *
     * When using a model as operational schema we implement various optimizations that assume the schema is immutable.
     * This function enforces that assumption and caches a few values that only make sense with frozen schema.
     *
     * To make changes to a final model use {@link clone}.
     */
    finalize() {
        if (this.#isFinal) {
            return;
        }

        const base = this.operationalBase ?? (this.operationalBase = this.base ?? null);
        const shadow = this.operationalShadow ?? (this.operationalShadow = this.shadow ?? null);
        this.#isFinal = true;
        (this.children as InternalChildren<C>).freeze();
        Object.freeze(this);
        base?.finalize();
        shadow?.finalize();
    }

    get isFinal() {
        return this.#isFinal;
    }

    toString() {
        return `${this.tag}${this.type ? `<${this.type}>` : ""}#${this.path}`;
    }

    get resource() {
        return this.#resource || (this.#root?.resources || ResourceBundle.default).get(this);
    }

    set resource(resource: Resource | undefined) {
        if (resource instanceof Resource) {
            this.#resource = resource;
        } else {
            this.#resource = new Resource(resource);
        }
    }

    get description() {
        return this.resource?.description;
    }

    set description(description: string | undefined) {
        this.localResource.description = description;
    }

    get details() {
        return this.resource?.details;
    }

    set details(details: string | undefined) {
        this.localResource.details = details;
    }

    get xref() {
        return this.resource?.xref;
    }

    set xref(xref: Specification.CrossReference | undefined) {
        this.localResource.xref = xref;
    }

    get errors() {
        return this.resource?.errors;
    }

    set errors(errors: DefinitionError[] | undefined) {
        this.localResource.errors = errors;
    }

    get asOf() {
        return this.resource?.asOf;
    }

    set asOf(asOf: Specification.Revision | undefined) {
        this.localResource.asOf = asOf;
    }

    get until() {
        return this.resource?.until;
    }

    set until(until: Specification.Revision | undefined) {
        this.localResource.until = until;
    }

    get matchTo() {
        return this.resource?.matchTo;
    }

    set matchTo(matchTo: { id?: string | number; name?: string } | undefined) {
        this.localResource.matchTo = matchTo;
    }

    get localResource() {
        return this.resource ?? (this.resource = new Resource());
    }

    get hasLocalResource() {
        return !!(this.#resource || (this.#root?.resources || ResourceBundle.default).get(this));
    }

    [inspect](_depth: any, options: any, inspect: any) {
        const json = this.valueOf() as Record<string, unknown>;
        const props = {
            name: json.name,
        } as Record<string, unknown>;
        if (json.id !== undefined) {
            props.id = json.id;
        }
        for (const key in json) {
            if (key === "id" || key === "name" || key === "tag") {
                continue;
            }
            props[key] = json[key];
        }
        if (this.#children !== undefined && this.#children.length) {
            props.children = this.#children.length;
        }
        if (!inspect) {
            inspect = (value: unknown) => `${value}`;
        }
        return `${inspect(props, options)}`.replace(/^\{/, `${decamelize(this.tag)} {`);
    }
}

export namespace Model {
    /**
     * Obtain the element type of a model type.
     */
    export type ElementOf<T extends Model> = T extends Model<infer E extends BaseElement> ? E : never;

    /**
     * Obtain the child type of a model type.
     */
    export type ChildOf<T extends Model> = T extends Model<any, infer C extends Model> ? C : never;

    /**
     * Constructor input.
     *
     * In most places elements and models are interchangeable on input.
     */
    export type Definition<T extends Model> =
        | (BaseElement.Properties<ElementOf<T>> & {
              parent?: Model;
              operationalBase?: Model;
              operationalShadow?: Model;
          })
        | T;

    /**
     * An object that may be used in some places where a model is required.
     *
     * This is either a model, a class constructor or a DecoratorContext.
     */
    export type Source = Model | NewableFunction;

    /**
     * Tagged input.  Like {@link Definition} but for places where model type is not implied.
     */
    export type TaggedDefinition<T extends Model> =
        | (ElementOf<T> & {
              operationalBase?: Model;
              operationalShadow?: Model;
          })
        | T;

    /**
     * Input model for children.
     */
    export type ChildDefinition<T extends Model> = TaggedDefinition<ChildOf<T>>;

    /**
     * A model constructor.
     */
    export type Type<T extends Model = Model> = abstract new (definition: any) => T;

    /**
     * A model constructor for a specific element type.
     */
    export type ConcreteType<T extends Model = Model> = (new (definition: any) => T) & {
        Tag: ElementTag;
        requiresId?: boolean;
    };

    /**
     * A patch to a model tree.
     */
    export type Patch<T extends BaseElement> = Omit<Partial<T>, "children" | "tag"> & {
        children?: (Patch<Exclude<T["children"], undefined>[number]> | undefined)[];
    };

    export type Properties<T extends BaseElement.Properties = BaseElement.Properties> = T & {
        operationalBase?: Model;
        operationalShadow?: Model;
    };

    export type LookupPredicate<T extends Model> = Type<T> | { type: Type<T>; test: (model: Model) => boolean };

    export type PropertyValidation = {
        name: string;
        type: string | (new (...args: any[]) => any) | { [key: string | number]: any } | undefined;
        required?: boolean;
        nullable?: boolean;
        values?: { [name: string]: any };
    };
}

Children.installModelConstructor(Model);
