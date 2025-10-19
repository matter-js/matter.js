/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetadataConflictError } from "#decoration/errors.js";
import { InternalError } from "#general";
import type { Model } from "#models/Model.js";
import * as models from "#standard/elements/models.js";
import type { ClassSemantics } from "./ClassSemantics.js";

const standardModels = new Set(Object.values(models) as Model[]);

/**
 * Base class for Matter semantics associated with JavaScript classes and properties.
 *
 * We model semantics using {@link Model}.  The model may be built declaratively with decorators or programmatically
 * using this interface directly.
 */
export abstract class Semantics {
    #localModel?: Model;
    #isFinal = false;

    /**
     * Determine whether these semantics are final.
     *
     * Once final no further mutation is allowed.
     */
    get isFinal(): boolean {
        return this.#isFinal;
    }

    /**
     * Finalize the model.
     */
    finalize() {
        if (this.#isFinal) {
            return;
        }

        this.#isFinal = true;
        Object.freeze(this);
        this.#localModel?.finalize();
    }

    /**
     * The {@link Model} defined by local decoration, if any.
     */
    get localModel() {
        return this.#localModel;
    }

    /**
     * Set the model.
     *
     * When "setting" the model we need to merge semantics coming from decorators, the prototype hierarchy, and models
     * provided programmatically.
     *
     * This may set the local model, change it or set its operational base.  We use local state and the finalization
     * status of the model to determine how to integrate.
     */
    set mutableModel(model: Model) {
        if (this.#isFinal) {
            throw new MetadataConflictError(`Cannot modify final semantics of ${this.#localModel?.name ?? "(none)"}`);
        }

        if (this.#localModel === model) {
            return;
        }

        // We don't finalize global models by default for performance reasons, but do finalize them here to prevent
        // accidental mutation
        if (standardModels.has(model)) {
            model.finalize();
        }

        this.#localModel = this.integrateModel(model);
    }

    /**
     * Replace the "base" of {@link localModel} and return an updated model.
     */
    protected abstract integrateModel(model: Model): Model;

    /**
     * Obtain a model unconditionally for mutation purposes.
     */
    get mutableModel() {
        if (this.#isFinal) {
            throw new MetadataConflictError(`Cannot modify final semantics of ${this.#localModel?.name ?? "(none)"}`);
        }

        if (this.#localModel === undefined) {
            this.#localModel = this.createModel();
        } else if (this.#localModel.isFinal) {
            this.#localModel = this.#localModel.extend();
        }
        return this.#localModel;
    }

    /**
     * The model's {@link Model.Type}.
     *
     * Field decorators operate prior to class decorators, so we may need to transition the model to a new type when the
     * class is decorated.  This is slightly lossy so type-specific decoration should always occur after assigning kind.
     */
    get modelType(): Model.Type | undefined {
        if (this.#localModel === undefined) {
            return;
        }
        return this.mutableModel.constructor as Model.ConcreteType;
    }

    set modelType(type: Model.ConcreteType) {
        if (this.#localModel === undefined) {
            this.#localModel = this.createModel(type);
            return;
        }

        if (this.#localModel instanceof type) {
            return;
        }

        // Detach original model
        const original = this.#localModel as Model;
        const { parent } = original;
        original.parent = undefined;

        // Create replacement
        const replacement = new type({
            name: original.name,
            id: original.id,
            type: original.type,
            parent,
            operationalBase: original.operationalBase,
            children: original.children,
        });

        if ("quality" in original && "quality" in replacement) {
            replacement.quality = original.quality;
        }

        this.#localModel = replacement;
    }

    protected abstract createModel(type?: Model.ConcreteType): Model;
}

export namespace Semantics {
    /**
     * Access the {@link Semantics} of a {@link DecoratorContext}.
     */
    export function of(context: DecoratorContext) {
        const classSemantics = classOf(context);
        if (context.kind === "class") {
            return classSemantics;
        }
        return classSemantics.fieldFor(context.name);
    }

    /**
     * Access the {@link ClassSemantics} of a constructor or decorator context.
     */
    // eslint-disable-next-line prefer-const
    export let classOf = (_source: ClassSemantics.Source): ClassSemantics => {
        // This should be replaced by ClassSemantics
        throw new InternalError(`Class decoration lookup not installed`);
    };
}
