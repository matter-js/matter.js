/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import { Access, Aspect, Constraint } from "../aspects/index.js";
import { ElementTag, FieldValue, Metatype, Specification } from "../common/index.js";
import { AnyElement } from "../elements/index.js";
import { Children } from "../models/Children.js";
import {
    enum16,
    enum8,
    map16,
    map32,
    map64,
    map8,
    uint16,
    uint32,
    uint64,
    uint8,
} from "../standard/elements/definitions.js";

// These must be types to avoid circular references
import type { CommandModel, MatterModel, Model, ScopeModel, ValueModel } from "../models/index.js";

const OPERATION_DEPTH_LIMIT = 20;

let memos: Memos | undefined;

/**
 * This class performs lookups of models in the scope of a specific model.  We use a class so the lookup can maintain
 * state and guard against circular references.
 *
 * Any logic that requires traversal of a multi-model ownership or inheritance should use this class.
 *
 */
export class ModelTraversal {
    #operationDepth = 0;
    #dismissed?: Set<Model>;

    /**
     * Perform an operation with iteration tracking.  If iteration depth limit
     */
    operation<T>(operator: () => T, toDismiss?: Model): T {
        if (this.#operationDepth > OPERATION_DEPTH_LIMIT) {
            throw new InternalError("Likely cycle detected (or OPERATION_DEPTH_LIMIT needs to be bumped)");
        }

        if (toDismiss && this.#dismissed?.has(toDismiss)) {
            toDismiss = undefined;
        }

        if (toDismiss) {
            if (!this.#dismissed) {
                this.#dismissed = new Set();
            }
            this.#dismissed.add(toDismiss);
        }
        this.#operationDepth++;
        try {
            return operator();
        } finally {
            this.#operationDepth--;
            if (toDismiss) {
                this.#dismissed?.delete(toDismiss);
            }
        }
    }

    /**
     * Perform an operation with a model dismissed from consideration for type lookup.
     */
    operationWithDismissal<T>(toDismiss: Model | undefined, operator: () => T): T {
        return this.operation(operator, toDismiss);
    }

    /**
     * Determine the type for a model.  This is the string name of the base model.  Usually this is simply the type
     * field but we infer the type in some cases where it is not supplied explicitly:
     *
     * - Children of maps and enums are uints of corresponding size
     * - Models that shadow another model in their parent's inheritance effectively inherit from the shadow so have
     *   their own name as the type name
     */
    getTypeName(model: Model | undefined): string | undefined {
        if (!model) {
            return undefined;
        }

        if (model.type) {
            return model.type;
        }

        // Commands, events and clusters always represent structs
        if (model.tag === ElementTag.Command || model.tag === ElementTag.Event || model.tag === ElementTag.Cluster) {
            return "struct";
        }

        const getTypeNameOp = () => {
            let result: string | undefined;
            const name = model.name;
            this.visitInheritance(this.findParent(model), ancestor => {
                // If parented by enum or bitmap, infer type as uint of same size
                if ((ancestor as { effectiveMetatype?: string }).effectiveMetatype) {
                    switch (ancestor.name) {
                        case enum8.name:
                        case map8.name:
                            result = uint8.name;
                            return false;

                        case enum16.name:
                        case map16.name:
                            result = uint16.name;
                            return false;

                        case map32.name:
                            result = uint32.name;
                            return false;

                        case map64.name:
                            result = uint64.name;
                            return false;
                    }
                }

                // If I shadow a field my type is the same as the overridden field
                const shadow = ancestor.children.select(name, [model.tag], this.#dismissed);
                if (shadow?.type) {
                    // The shadow's name is the same as mine so this is actually my own name
                    result = shadow.name;
                    return false;
                }
            });

            return result;
        };

        return this.operation(getTypeNameOp);
    }

    /**
     * Find the model in my inheritance hierarchy that has semantic meaning. This will be the first inherited model with
     * a metatype.
     */
    findMetabase(model: Model | undefined): Model | undefined {
        return this.operation(() => {
            while (model && !(model as any).metatype) {
                model = this.findBase(model);
            }
            return model;
        });
    }

    /**
     * Find the model a model derives from, if any.
     */
    findBase(model: Model | undefined): Model | undefined {
        if (!model) {
            return;
        }

        if (model.operationalBase) {
            return model.operationalBase;
        }

        if (memos?.bases.has(model)) {
            return memos.bases.get(model);
        }

        const findBaseOp = () => {
            // If I override another element (same identity and tag in parent's inheritance hierarchy) and don't specify
            // a type then I implicitly inherit from the shadow.
            const shadow = this.findShadow(model);
            if (
                shadow !== undefined &&
                (model.type === undefined || model.type === shadow.type || model.type === shadow.name)
            ) {
                return shadow;
            }

            // Obtain the name of my base type
            const type = this.getTypeName(model);
            if (type === undefined) {
                return;
            }

            const path = type.split(".");

            // Unqualified path.  This is the common case
            if (path.length === 1) {
                // Allowed tags represent a priority so search each tag independently
                for (const tag of model.allowedBaseTags) {
                    const found = this.findType(this.findParent(model), path[0], tag);
                    if (found) {
                        return found;
                    }
                }
                return;
            }

            // Qualified path.  Identify the leaf parent then perform name/tag search within.  This is fun because we
            // have to search scopes until we match the full path
            for (const tag of model.allowedBaseTags) {
                const found = this.findQualifiedType(this.findParent(model), path, tag);
                if (found) {
                    return found;
                }
            }
        };

        const base = this.operationWithDismissal(model, findBaseOp);

        memos?.bases.set(model, base);

        return base;
    }

    /**
     * Find the first global model this model derives from, if any.
     */
    findGlobalBase(model: Model | undefined): Model | undefined {
        if (!model) {
            return;
        }
        let result: Model | undefined;

        const globalBaseSearchOp = (model: Model) => {
            if (model.isGlobal) {
                result = model;
                return false;
            }
        };

        this.visitInheritance(model, globalBaseSearchOp);

        return result;
    }

    /**
     * Determine whether this model derives from another.
     */
    instanceOf(model: Model | undefined, other: Model | AnyElement | undefined): boolean {
        if (!model || !other) {
            return false;
        }
        if (model === other) {
            return true;
        }
        let result = false;

        this.visitInheritance(model, model => {
            if (model.name === other.name && model.isGlobal === other.isGlobal) {
                result = true;
                return false;
            }
        });

        return result;
    }

    /**
     * Find an xref from this model or a parent.
     */
    findXref(model: Model | undefined): Specification.CrossReference | undefined {
        return this.operationWithDismissal(model, () => {
            if (!model) {
                return;
            }
            if (model.xref) {
                return model.xref;
            }
            return this.findXref(this.findParent(model));
        });
    }

    /**
     * Find the model this model derives from that has children, if any.
     */
    findDefiningModel(model: ValueModel | undefined): ValueModel | undefined {
        let result: ValueModel | undefined;
        this.visitInheritance(model, model => {
            if (!model.isType) {
                return false;
            }
            if (model.children.length) {
                result = model as ValueModel;
                return false;
            }
        });
        return result;
    }

    /**
     * Find a child in the parent's inheritance hierarchy with the same tag and ID/name.
     */
    findShadow(model: Model | undefined): Model | undefined {
        if (model === undefined) {
            return undefined;
        }

        if (model.operationalShadow !== undefined) {
            return model.operationalShadow ?? undefined;
        }

        if (memos?.shadows.has(model)) {
            return memos.shadows.get(model);
        }

        let shadow: Model | undefined;

        const shadowSearchOp = () => {
            this.visitInheritance(this.findBase(this.findParent(model)), parent => {
                if (model.id !== undefined && model.tag !== ElementTag.Command) {
                    shadow = parent.children.select(model.id, [model.tag], this.#dismissed);
                    if (shadow) {
                        return false;
                    }
                }
                shadow = parent.children.select(model.name, [model.tag], this.#dismissed);
                if (shadow) {
                    return false;
                }
            });
        };

        this.operationWithDismissal(model, shadowSearchOp);

        memos?.shadows.set(model, shadow);

        return shadow;
    }

    /**
     * Get an aspect that reflects extension of any shadowed aspects.  Note that this searches the parent's inheritance
     * and the model's inheritance. This is because aspects can be inherited by overriding an element in the parent or
     * by direct type inheritance.  Aspects in shadowed elements take priority as they are presumably more specific.
     */
    findAspect<T extends Aspect, N extends string, M extends Model & { [n in N]: T }>(
        model: M | undefined,
        name: N,
        factory: new (definition: undefined) => T,
    ): T | undefined {
        if (!model) {
            // We do not specify "create" in factory argument type because it breaks TS type inference
            return;
        }

        const findAspectOp = () => {
            let aspect = model[name] as T;

            const inheritedAspect = this.findAspect(this.findBase(model) as M | undefined, name, factory);
            if (inheritedAspect) {
                if (aspect) {
                    aspect = inheritedAspect.extend(aspect) as T;
                } else {
                    aspect = inheritedAspect;
                }
            }

            return aspect;
        };

        return this.operation(findAspectOp);
    }

    /**
     * Constraint aspects are specialized because we infer constraint fields that are referenced in other models.
     */
    findConstraint(model: ValueModel, field?: "value" | "min" | "max"): Constraint | undefined {
        return this.operation(() => {
            let constraint = this.findAspect(model, "constraint", Constraint);
            if (constraint === undefined) {
                return;
            }

            const bounds = {} as Constraint.Ast;

            const resolve = (field: "value" | "min" | "max") => {
                const value = constraint![field];
                const name = FieldValue.referenced(value);
                if (name === undefined) {
                    return;
                }

                const referenced = this.findMember(this.findParent(model), name, [
                    ElementTag.Attribute,
                    ElementTag.Field,
                ]) as ValueModel;
                if (!referenced) {
                    return;
                }

                const otherConstraint = this.findConstraint(referenced, field);
                if (otherConstraint?.[field]) {
                    bounds[field] = otherConstraint[field];
                }
            };

            // The only reason the field filter exists is that some fields referenced in constraints are circularly
            // constrained (e.g. min of max field is max of min field and vice versa).  By only loading the field of
            // interest we avoid infinite loops
            if (field) {
                resolve(field);
            } else {
                resolve("value");
                resolve("min");
                resolve("max");
            }

            if (Object.keys(bounds).length) {
                constraint = constraint.extend(Constraint.create(bounds as Constraint.Definition));
            }

            return constraint;
        });
    }

    /**
     * Access aspects are specialized because access controls are inherited from the owner if not otherwise defined.
     *
     * That means access controls may come from 5 places, in order of priority:
     *
     *   1. The model itself
     *   2. A shadowed model in the owner hierarchy
     *   3. An overridden model in the model's class hierarchy
     *   4. A model in the parent hierarchy
     *   5. Access.Default
     *
     * This method uses {@link findAspect} for 1-3 then extends the result with 4 & 5 as necessary until
     * {@link Access.complete} is true.
     */
    findAccess(model: ValueModel | undefined, VM: typeof ValueModel): Access {
        if (model === undefined) {
            return Access.Default;
        }

        return this.operation(() => {
            const access = this.findAspect(model, "access", Access);

            if (!access) {
                return this.findAccess(this.findOwner(VM, model), VM);
            }

            if (access.complete) {
                return access;
            }

            return this.findAccess(this.findOwner(VM, model), VM).extend(access);
        });
    }

    /**
     * Search inherited scope for a named member.
     */
    findMember(scope: Model | undefined, key: Children.Selector, allowedTags: ElementTag[]): Model | undefined {
        return this.operation(() => {
            while (scope) {
                const result = scope.children.select(key, allowedTags, this.#dismissed);
                if (result) {
                    return result;
                }
                scope = this.findBase(scope);
            }
        });
    }

    /**
     * Search inherited scope for a bit definition.
     */
    findBitDefinition(scope: Model | undefined, bit: number) {
        return this.operation(() => {
            while (scope) {
                if (!scope.isType) {
                    return;
                }

                if ((scope as ValueModel).effectiveMetatype !== Metatype.bitmap) {
                    scope = this.findParent(scope);
                    continue;
                }

                for (const c of (scope as ValueModel).children) {
                    if (c.constraint.test(bit)) {
                        return c;
                    }
                }

                scope = this.findBase(scope);
            }
        });
    }

    /**
     * Search inherited and structural type scope for a named type.
     */
    findType(owner: Model | undefined, name: string, tag: ElementTag): Model | undefined {
        if (!owner) {
            return;
        }

        // We do not allow for extension of "permanent" datatypes.  This allows us to short circuit most scope search
        // logic for global types
        const permanent = (owner.root ?? ModelTraversal.fallbackRoot)?.permanentDatatypes[name];
        if (permanent) {
            return permanent;
        }

        //console.log(`${"".padStart(this.#operationDepth * 2)}${owner.name}.${name}`);

        const memoKey = `${name} ${tag}`;
        const memosForScope = memos?.types.get(owner);
        if (memosForScope && memoKey in memosForScope) {
            return memosForScope[memoKey];
        }

        const findTypeOp = () => {
            const queue = Array<Model>(owner);
            for (let scope = queue.shift(); scope; scope = queue.shift()) {
                if ((scope as ScopeModel).isScope) {
                    const result = scope.children.select(name, tag, this.#dismissed);
                    if (result) {
                        return result;
                    }
                }

                // Search inherited scope next
                const inheritedScope = this.findBase(scope);
                if (inheritedScope) {
                    queue.unshift(inheritedScope);
                }

                // Search parent scope once all inherited scope is searched
                const parent = this.findParent(scope);
                if (parent) {
                    queue.push(parent);
                }
            }

            // If the model is not part of a MatterModel hierarchy, findBase and findParent will use the fallback model for
            // resolution.  However, if the model is part of an incomplete MatterModel hierarchy, that logic is not
            // triggered.  So handle the case where a global type is missing here
            if (ModelTraversal.fallbackRoot && owner !== ModelTraversal.fallbackRoot) {
                return this.findType(ModelTraversal.fallbackRoot, name, tag);
            }
        };
        const type = this.operation(findTypeOp);

        if (memos) {
            const memosForScope = memos.types.get(owner);
            if (memosForScope) {
                memosForScope[memoKey] = type;
            } else {
                memos.types.set(owner, { [memoKey]: type });
            }
        }

        return type;
    }

    /**
     * Similar to findType but operates with a qualified type name.
     *
     * Unlike findType, a qualified type may reference an element parented by any other, not just those within
     * ScopeModels.
     *
     * This is quite complicated and would be painfully slow except in practice we don't use many qualified types and
     * those we do use resolve with few failing branches in the search once the root qualifier of the name matches.
     */
    findQualifiedType(scope: Model | undefined, path: string[], tag: ElementTag): Model | undefined {
        if (!scope) {
            return;
        }

        function resolve(scope: Model, position = 0): Model | undefined {
            // The last position is the target model and must match tag type
            if (position === path.length - 1) {
                return scope.children.select(path[position], tag);
            }

            // Intermediate positions are just namespaces into which we recurse
            for (const subscope of scope.children.selectAll(path[position])) {
                const result = resolve(subscope, position + 1);
                if (result) {
                    return result;
                }
            }

            // Special case for "Matter" element which normally cannot be referenced.  This allows for creating
            // "absolute" paths by prefixing with "Matter.".
            if (position === 0 && scope.tag === ElementTag.Matter && path[0] === "Matter") {
                const result = resolve(scope, position + 1);
                if (result) {
                    return result;
                }
            }

            // Path is not resolvable in this scope
        }

        return this.operation(() => {
            const queue = Array<Model>(scope as Model);
            for (scope = queue.shift(); scope; scope = queue.shift()) {
                // First attempt to resolve in the current scope
                const resolved = resolve(scope);
                if (resolved) {
                    return resolved;
                }

                // Search inherited scope next
                const inheritedScope = this.findBase(scope);
                if (inheritedScope) {
                    queue.unshift(inheritedScope);
                }

                // Search parent scope once all inherited scope is searched
                const parent = this.findParent(scope);
                if (parent) {
                    queue.push(parent);
                }
            }
        });
    }

    /**
     * Find the response model for a command.
     */
    findResponse(command: CommandModel) {
        let response: undefined | CommandModel;

        this.visitInheritance(command, model => {
            const command = model as CommandModel;
            if (command.response && command.response !== "status") {
                response = this.findType(model, command.response, ElementTag.Command) as CommandModel;
                return false;
            }
        });

        return response;
    }

    /**
     * Find all children of a node that reference a specific type.
     */
    findReferences(scope: Model | undefined, type: Model | undefined): Model[] {
        if (!scope || !type) {
            return [];
        }

        const references = Array<Model>();
        this.visit(scope, model => {
            // This is the most common method for referencing
            if (this.findBase(model) === type) {
                references.push(model);
                return;
            }

            // A command may reference its response
            if (model.tag === ElementTag.Command && this.findResponse(model as CommandModel) === type) {
                references.push(model);
                return;
            }

            // This is not common but the default value can reference another field
            if (model.isType) {
                const defaultValue = (model as ValueModel).default;
                if (FieldValue.is(defaultValue, FieldValue.reference)) {
                    if ((defaultValue as FieldValue.Reference).name === type.name) {
                        references.push(model);
                    }
                }
            }
        });

        return references;
    }

    /**
     * Find an owning model of a specific type.
     */
    findOwner<T extends Model>(constructor: Model.Type<T>, model: Model | undefined): T | undefined {
        const parent = this.findParent(model);

        if (!parent || parent instanceof constructor) {
            return parent;
        }

        return this.operation(() => {
            return this.findOwner(constructor, parent);
        });
    }

    /**
     * Find the root model.
     */
    findRoot(model: Model | undefined): Model | undefined {
        if (!model) {
            return undefined;
        }

        const parent = this.findParent(model);
        if (!parent) {
            return model;
        }

        return this.operation(() => {
            return this.findRoot(parent);
        });
    }

    /**
     * Visit all nodes in the model tree.
     */
    visit(model: Model, visitor: (model: Model) => boolean | void): boolean | undefined {
        return this.operation(() => {
            if (visitor(model) === false) {
                return false;
            }
            for (const c of model.children) {
                if (this.visit(c, visitor) === false) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Visit all nodes in the inheritance hierarchy until the visitor returns false.
     */
    visitInheritance(model: Model | undefined, visitor: (model: Model) => boolean | void): boolean | undefined {
        if (!model) {
            return;
        }

        return this.operation(() => {
            if (visitor(model) === false) {
                return false;
            }
            const base = this.findBase(model);
            return this.visitInheritance(base, visitor);
        });
    }

    /**
     * Find the parent for this model.
     */
    findParent(model?: Model) {
        if (model === undefined) {
            return;
        }

        if (model.parent) {
            return model.parent;
        }

        // MatterModel is the scope root so there is no fallback
        if (model.tag === ElementTag.Matter) {
            return undefined;
        }

        // Identify a fallback scope
        return this.findScope(model);
    }

    /**
     * Find an owner that defines type scope for a model.
     */
    findScope(model?: Model): ScopeModel | undefined {
        if (model === undefined) {
            return;
        }

        // First, examine parents
        if (model.parent) {
            if ((model.parent as ScopeModel).isScope) {
                return model.parent as ScopeModel;
            }

            return this.operationWithDismissal(model, () => this.findScope(model.parent));
        }

        // Next, search operational base hierarchy
        if (model.operationalBase) {
            return this.operationWithDismissal(model, () => this.findScope(model.operationalBase ?? undefined));
        }

        // Finally, fall back to the canonical MatterModel
        return ModelTraversal.fallbackRoot;
    }

    /**
     * If a model is not owned by a MatterModel, global resolution won't work.  This model acts as a fallback to work
     * around this.
     */
    static fallbackRoot: MatterModel | undefined;

    /**
     * This is a cheap hack to optimize analysis of large static models.  It temporarily memoizes key operations.
     *
     * It's not a huge win but does speed up model validation by approximately 50%
     */
    static memoize(fn: () => void) {
        if (memos) {
            fn();
            return;
        }

        try {
            memos = { bases: new Map(), shadows: new Map(), types: new Map() };
            fn();
        } finally {
            memos = undefined;
        }
    }
}

interface Memos {
    bases: Map<Model, Model | undefined>;
    shadows: Map<Model, Model | undefined>;
    types: Map<Model, Record<string, Model | undefined>>;
}
