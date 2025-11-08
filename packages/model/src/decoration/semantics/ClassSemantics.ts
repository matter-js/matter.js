/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Must import these via index to ensure proper initialization
import { DatatypeModel, FieldModel, Model } from "#models/index.js";

import { camelize, InternalError } from "#general";
import { Scope } from "#logic/Scope.js";
import { any, struct } from "#standard/elements/models.js";
import { InvalidMetadataError, MetadataConflictError } from "../errors.js";
import { FieldSemantics } from "./FieldSemantics.js";
import { Semantics } from "./Semantics.js";

/**
 * Our key into {@link DecoratorContext.metadata}.
 *
 * This is where we store the {@link ClassSemantics} associated with a decorated class.
 */
const matter = Symbol("matter");

/**
 * Our view of {@link DecoratorContext.metadata}.
 *
 * Note that in the case of class inheritance, the metadata also inherits from the parent metadata.  So we need to use
 * {@link Object.hasOwn} to differentiate between the {@link ClassSemantics} for a class and that of its base class.
 */
interface MatterMetadata {
    [matter]?: ClassSemantics;
}

/**
 * Matter semantic metadata attached to a class via decorators.
 *
 * We use decorators to allow for definition of model elements in the context of a specific type.
 *
 * Currently there are JavaScript/TypeScript limitations to be aware of when decorating type definitions:
 *
 *   * Decorators may only be applied to JavaScript classes.  So if you want to define an interface without
 *     implementation, you must implement as a class and use as an interface.  That's why this is "class" metadata.
 *
 *   * Decorators may not affect the TypeScript type of an object.  This means that you must define both the Matter type
 *     (e.g. {@link uint32}) and TypeScript type (e.g. `number`).
 */
export class ClassSemantics extends Semantics {
    #new?: ClassSemantics.Constructor;
    #definedFields?: Map<string, FieldSemantics>;

    /**
     * The model that represents the semantics for this class.
     *
     * This may be {@link localModel} or {@link prototypeBaseModel}
     */
    get semanticModel() {
        if (this.localModel) {
            // Model is defined here
            return this.localModel;
        }

        if (this.#definedFields) {
            // Model has not been defined but should be due to decoration, so define it now
            return this.mutableModel;
        }

        // Return model inherited via prototype, if any.  Otherwise we do not express semantics
        return this.prototypeBaseModel;
    }

    /**
     * Get the class constructor
     */
    get new(): ClassSemantics.Constructor | undefined {
        return this.#new;
    }

    /**
     * Assign the constructor for the class.
     */
    set new(fn: ClassSemantics.Constructor) {
        if (this.#new === fn) {
            return;
        }

        if (this.isFinal) {
            throw new MetadataConflictError(
                `Cannot install semantic constructor ${fn.name} because semantics are final`,
            );
        }

        this.#new = fn;

        // Set name to match class
        if (this.localModel && !this.localModel.isFinal && this.localModel.name !== this.#new?.name) {
            this.localModel.name = this.#new?.name;
        }

        // Update local semantics based on inherited semantics
        if (this.localModel) {
            // I have a model defined already so update according to base semantics
            this.#applyBaseSemantics();
        } else {
            // I have no model defined yet so I am semantically equivalent to my base
            const base = this.prototypeBaseModel;
            if (base !== undefined) {
                this.mutableModel = base;
            }
        }
    }

    /**
     * The class {@link Model} inherited from {@link new}'s prototype chain, if any.
     */
    get prototypeBaseModel(): Model | undefined {
        let current = this.#new?.prototype;
        let base;

        while (current) {
            current = Object.getPrototypeOf(current) as unknown;
            if (typeof current !== "object" || current === null) {
                return;
            }
            const constructor = current.constructor;
            if (constructor === Object) {
                return;
            }
            base = ClassSemantics.maybeOf(constructor);

            if (base?.localModel) {
                // Semantics and model may not mutate once acting as a base
                base.finalize();

                return base.localModel;
            }
        }
    }

    /**
     * Obtain a {@link FieldSemantics} for the named field.
     */
    fieldFor(name: string | symbol) {
        if (typeof name !== "string") {
            throw new InvalidMetadataError(`Cannot decorate symbolic function ${String(name)}`);
        }

        if (this.#definedFields === undefined) {
            this.#definedFields = new Map();
        }
        let field = this.#definedFields.get(name);
        if (field === undefined) {
            if (this.isFinal) {
                throw new MetadataConflictError(`Cannot install field ${name} because semantics are final`);
            }

            this.#definedFields.set(name, (field = new FieldSemantics(this, name)));
        }
        return field;
    }

    /**
     * Add logical fields for unrecognized members of an object.
     *
     * This extends the model with untyped fields for properties that are not otherwise typed.
     */
    defineUnknownMembers(instance: unknown) {
        if (instance === undefined || instance === null) {
            return;
        }

        const known = this.semanticModel
            ? new Set(
                  Scope(this.semanticModel)
                      .membersOf(this.semanticModel)
                      .map(model => camelize(model.name)),
              )
            : new Set();

        const descriptors = Object.getOwnPropertyDescriptors(instance);

        for (const name in descriptors) {
            // Skip if name is already known
            if (known.has(camelize(name))) {
                continue;
            }

            // We only model string properties
            if (typeof name !== "string") {
                continue;
            }

            // We do not support write-only fields
            const descriptor = descriptors[name];
            if (descriptor.set && !descriptor.get) {
                continue;
            }

            // Methods are not fields
            try {
                if (typeof (instance as Record<string, unknown>)[name] === "function") {
                    continue;
                }
            } catch (e) {
                // We do not support inaccessible fields
                continue;
            }

            const model = this.fieldFor(name).mutableModel as FieldModel;

            model.operationalBase = any;

            // Default to fixed if read-only
            if (!descriptor.writable && !descriptor.set) {
                model.quality = { ...model.quality, fixed: true };
            }

            this.fieldFor(name).mutableModel.operationalBase = any;
        }
    }

    /**
     * Obtain the {@link ClassSemantics} for {@link source}.
     */
    static override of(source: ClassSemantics.Source) {
        // Source is the semantics
        if (source instanceof ClassSemantics) {
            return source;
        }

        // Source is decorator context
        if (typeof source !== "function") {
            const metadata = source.metadata as MatterMetadata;
            if (Object.hasOwn(metadata, matter)) {
                return metadata[matter]!;
            }
            return (metadata[matter] = new ClassSemantics());
        }

        // Source is a constructor
        let metadata: MatterMetadata;
        if (!Object.hasOwn(source, Symbol.metadata)) {
            metadata = source[Symbol.metadata] = {};
        } else {
            metadata = source[Symbol.metadata] as MatterMetadata;
        }

        let semantics: ClassSemantics;
        if (!Object.hasOwn(metadata, matter)) {
            semantics = metadata[matter] = new ClassSemantics();
        } else {
            semantics = metadata[matter] as ClassSemantics;
        }

        // If the parent class is not decorated then this may be the first time we've seen the constructor associated
        // with the metadata.  So always inform the metadata of its constructor
        if (!semantics.new) {
            semantics.new = source;
        }

        return semantics;
    }

    /**
     * Determine {@link new} has semantic decoration.
     */
    static hasOwnSemantics(source: ClassSemantics.Constructor) {
        if (typeof source !== "function") {
            throw new InternalError(`Missing constructor for class semantic check`);
        }
        return Object.hasOwn(source, Symbol.metadata) && Object.hasOwn(source[Symbol.metadata]!, matter);
    }

    /**
     * Access the {@link ClassSemantics} of {@link new} if it is defined.
     */
    static maybeOf(source: ClassSemantics.Constructor) {
        if (this.hasOwnSemantics(source)) {
            return ClassSemantics.of(source);
        }
    }

    static {
        Semantics.classOf = this.of;
    }

    override finalize() {
        if (this.isFinal) {
            return;
        }

        // Invoke any custom extension logic
        this.#new?.[ClassSemantics.extend]?.(this);

        // Apply base finalization
        super.finalize();

        // Finalize fields
        if (this.#definedFields) {
            for (const field of this.#definedFields.values()) {
                field.finalize();
            }
        }
    }

    #applyBaseSemantics() {
        const base = this.prototypeBaseModel;
        if (base === undefined) {
            return;
        }

        // If my model does not yet have an explicit base, I extend my parent class's model
        const { type, base: currentBase } = this.mutableModel;
        if (type === undefined && (currentBase === undefined || currentBase === struct)) {
            const operationalBase = this.prototypeBaseModel;
            if (operationalBase) {
                this.mutableModel.operationalBase = operationalBase;
            }
        }

        // If my base is not a datatype, it forces the type of my model
        if (base && base.tag !== "datatype" && this.mutableModel.tag !== base.tag) {
            this.modelType = base.constructor as Model.ConcreteType;
        }

        // If ID is not already set, force ID to match base
        if (this.mutableModel.id === undefined && base.id !== undefined) {
            this.mutableModel.id = base.id;
        }
    }

    protected override integrateModel(model: Model) {
        // If local model is not yet set or is final, we have not extended; this is "swap base with no decoration" case
        if (this.localModel === undefined || this.localModel.isFinal) {
            return model;
        }

        // If incoming model is final, replace operational base of local model.  This is "swap base with decoration"
        // case
        if (model.isFinal) {
            this.localModel.operationalBase = model;
            return this.localModel;
        }

        // Neither model is final.  Move any children to new model.  This is "replace temporary model created by
        // decorators" case
        model.children.push(...this.localModel.children);

        return model;
    }

    protected override createModel(type: Model.ConcreteType = DatatypeModel) {
        let name = this.#new?.name;
        if (name === undefined || name === "") {
            name = "Unnamed";
        }
        return new type({ name, operationalBase: struct });
    }
}

export namespace ClassSemantics {
    /**
     * A standard constructor with an optional decoration extension point.
     */
    export interface Constructor extends NewableFunction {
        /**
         * If present, invoked for custom decoration after installing constructor.
         */
        [extend]?: (semantics: ClassSemantics) => void;
    }

    /**
     * An object for which you may obtain {@link ClassSemantics}.
     */
    export type Source = Constructor | DecoratorContext | ClassSemantics;

    export const extend = Symbol("extend");
}
