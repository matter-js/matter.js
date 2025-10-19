/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SchemaImplementationError } from "#common/errors.js";
import { BaseElement } from "#elements/BaseElement.js";
import { ModelTraversal } from "#logic/ModelTraversal.js";
import { Scope } from "#logic/Scope.js";
import { Model } from "./Model.js";

/**
 * A "scope" is a model provides name resolution for other models.
 *
 * {@link Model#type} must reference a model named in a parent scope.
 */
export abstract class ScopeModel<
    T extends BaseElement = BaseElement,
    C extends Model = Model<BaseElement, any>,
> extends Model<T, C> {
    #operationalScope: undefined | Scope;

    readonly isScope = true;

    /**
     * Obtain the {@link Scope} for this model.
     */
    get scope() {
        if (this.#operationalScope !== undefined) {
            return this.#operationalScope;
        }
        return Scope(this);
    }

    override finalize() {
        if (!this.#operationalScope) {
            this.#operationalScope = Scope(this);
        }
        super.finalize();
        return this;
    }

    static is(model: Model): model is ScopeModel {
        return !!(model as ScopeModel).isScope;
    }

    static of(model: Model) {
        if ((model as ScopeModel).isScope) {
            return model as ScopeModel;
        }

        const scope = new ModelTraversal().findScope(model);

        if (scope === undefined) {
            throw new SchemaImplementationError(model, `No parent scope`);
        }

        return scope;
    }
}
