/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { SchemaImplementationError } from "#common/errors.js";
import { BaseElement } from "#elements/BaseElement.js";
import { ModelIndex, MutableModelIndex } from "#logic/ModelIndex.js";
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

    /**
     * The members of {@link type}, reusing {@link cached} while the children of every model they derive from are
     * unchanged: the inheritance chain and, for attributes, the root, which supplies global attributes.
     */
    protected membersOfType<M extends Model>(
        type: Model.ConcreteType<M>,
        cached?: ScopeModel.Members<M>,
    ): ScopeModel.Members<M> {
        const { Tag } = type;
        if (cached !== undefined && isSame(cached.inputs, this.#memberInputs(Tag))) {
            return cached;
        }

        const isOfType = (model: Model): model is M => model.tag === Tag;
        const members = new Array<M>();
        const inputs = this.#memberInputs(Tag);

        // Without base or root the members are the children themselves
        const candidates = inputs.length === 2 ? this.children : this.scope.membersOf(this, { tags: [Tag] });
        for (const member of candidates) {
            if (isOfType(member)) {
                members.push(member);
            }
        }

        // Resolving members creates children lists that did not exist, so the inputs read afterward stay reusable
        return { inputs: this.#memberInputs(Tag), index: new MutableModelIndex(members) };
    }

    #memberInputs(tag: ElementTag) {
        const inputs = new Array<unknown>();
        const traversal = new ModelTraversal();
        traversal.visitInheritance(this, model => {
            inputs.push(model, model.childrenGeneration);
        });
        if (tag === ElementTag.Attribute) {
            const root = traversal.findRoot(this);
            if (root !== undefined && root !== this) {
                inputs.push(root, root.childrenGeneration);
            }
        }
        return inputs;
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

export namespace ScopeModel {
    /**
     * Members of one element type with the inputs they derive from.
     *
     * @internal
     */
    export interface Members<M extends Model> {
        inputs: unknown[];
        index: ModelIndex<M>;
    }
}

function isSame(a: unknown[], b: unknown[]) {
    return a.length === b.length && a.every((value, i) => value === b[i]);
}
