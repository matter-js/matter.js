/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import { Constraint } from "../aspects/index.js";
import { ElementTag, Metatype, Specification } from "../common/index.js";
import { AnyElement } from "../elements/index.js";
import { Model, ValueModel } from "../models/index.js";
import { ModelVariantTraversal, TraverseMap, VariantDetail } from "./ModelVariantTraversal.js";

/**
 * Merge multiple variants of an element into a single element.
 */
export function MergedModel(
    revision: Specification.Revision,
    variants: TraverseMap,
    priorities = MergedModel.DefaultPriorities,
): Model {
    const priority = new PriorityHandler(priorities || MergedModel.DefaultPriorities);
    const visitor = new MergeTraversal<Model>(revision, priority, (variants, recurse) => {
        const merged = merge(variants);

        if (variants.tag === ElementTag.Cluster) {
            reparentToCanonicalParent(revision, priority, variants);
        }

        // If the manual override specifies a type but no children, ignore children from other variants.  This allows us
        // to override to a type that doesn't have children
        const manual = priority.get(variants.tag, "type")[0];
        if (merged.type && variants.map[manual]?.type === merged.type && !variants.map[manual].children?.length) {
            return merged;
        }

        // Update the type for any untyped variant.  This allows model logic relying on parent type to work without
        // overrides specifying the type explicitly
        if (merged.type) {
            for (const variant of Object.values(variants.map)) {
                if (variant.type === undefined) {
                    variant.type = merged.type;
                }
            }
        }

        merged.children = recurse() as Iterable<AnyElement>;

        return merged;
    });
    return visitor.traverse(variants);

    /**
     * Merge the fields (excluding children) of a specific model.
     */
    function merge(variants: VariantDetail): Model {
        const variantValues = Object.fromEntries(
            Object.entries(variants.map).map(([variantName, variant]) => [variantName, variant.valueOf()]),
        );

        const keys = new Set(Object.values(variantValues).flatMap(v => Object.keys(v)));
        keys.delete("children");

        const properties = Object.fromEntries([...keys].map(k => [k, visitor.pluck(variants.tag, k, variantValues)]));

        // Specialized support for type
        if (properties.type) {
            const type = visitor.chooseType(variants);
            if (type?.type !== undefined && type?.type !== null) {
                properties.type = type.type;
            }
        }

        // Specialized support for constraint -- non-empty constraints should override "desc"
        const constraint = new Constraint(properties.constraint);
        if (constraint.desc) {
            for (const key of priority.get("*", "constraint")) {
                const definition = (variants.map[key] as ValueModel | undefined)?.constraint;
                const constraint = new Constraint(definition);
                if (!constraint?.isEmpty && !constraint?.desc) {
                    properties.constraint = definition;
                    break;
                }
            }
        }

        return Model.create(properties as AnyElement);
    }
}

/**
 * Specialized tree traversal supporting element merge.
 */
class MergeTraversal<S> extends ModelVariantTraversal<S> {
    constructor(
        revision: Specification.Revision,
        public priority: PriorityHandler,
        public visitor: (variants: VariantDetail, recurse: () => S[]) => S,
    ) {
        super(revision, priority.get("*", "type"));
    }

    visit(variants: VariantDetail, recurse: () => S[]) {
        return this.visitor(variants, recurse);
    }

    /**
     * Use priority rules to select a single value from available variants.
     */
    pluck(
        tag: ElementTag | "*",
        fieldName: string,
        variantValues: { [variantName: string]: { [fieldName: string]: any } },
    ) {
        const variantPriorities = this.priority.get(tag, fieldName);

        for (const variantName of variantPriorities) {
            const variantValue = variantValues[variantName]?.[fieldName];
            if (variantValue !== undefined) {
                return variantValue;
            }
        }
    }

    /**
     * Type selection is more complicated than other fields.
     */
    chooseType(variants: VariantDetail) {
        const variantPriorities = this.priority.get(variants.tag, "type");

        let type: Model | undefined;
        let metatype: Metatype | undefined;
        for (const sourceName of variantPriorities) {
            const variant = variants.map[sourceName];
            if (!variant) {
                continue;
            }

            if (sourceName === variantPriorities[0]) {
                // Always prefer highest priority variant which is presumably a hand edit
                return variant;
            }

            if (!type) {
                type = variant;
                if (type instanceof ValueModel) {
                    metatype = type.effectiveMetatype;
                }
                continue;
            }
            if (!(type instanceof ValueModel) || !(variant instanceof ValueModel)) {
                continue;
            }

            let overridePriority;
            const variantMetatype = variant.effectiveMetatype;
            if (!metatype) {
                if (variantMetatype) {
                    // This is not the highest priority type but it's actually useful
                    overridePriority = true;
                }
            } else if (metatype === Metatype.integer) {
                const variantMetatype = variant.effectiveMetatype;
                if (variantMetatype === Metatype.enum || variantMetatype === Metatype.bitmap) {
                    // Even though this is not the highest priority type, it's more specific
                    overridePriority = true;
                }
            }

            if (overridePriority) {
                type = variant;
                metatype = variantMetatype;
            }
        }

        return type;
    }
}

/**
 * Utility class for working with merge priorities.
 */
class PriorityHandler {
    constructor(private priorities: MergedModel.Priorities) {}

    /**
     * Get the priority for a specific tag and field.
     */
    get(typeName: string, fieldName: string) {
        const priority =
            this.priorities[typeName]?.[fieldName] ||
            this.priorities["*"]?.[fieldName] ||
            this.priorities[typeName]?.["*"] ||
            this.priorities["*"]?.["*"];

        if (!priority) {
            throw new InternalError("No default (*, *) priority available");
        }

        return priority;
    }
}

/**
 * One complexity of merge is that types can either have children directly, or they can reference a type that contains
 * the children.  For example, the specification defines most attributes as enums and lists values without naming a
 * separate enum type.
 *
 * CHIP XML OTOH doesn't support this structure -- it makes up enum names if the spec doesn't define a separate type.
 *
 * We want to do whatever the spec does.  In this case this means we need to move the children from MyPropertyEnum into
 * MyPropertyAttribute if the final type will be enum8 rather than MyPropertyEnum.
 *
 * To keep things simple we do this in a separate preprocessing pass before performing the actual merge.
 *
 * Another simplifying assumption we make is that we will only ever move children *into* the direct parent from the
 * cluster-scoped type, not the other way around.  We know this is true because CHIP doesn't support direct children and
 * the structures we build ourselves are already in the preferred format.
 */
function reparentToCanonicalParent(
    revision: Specification.Revision,
    priority: PriorityHandler,
    variants: VariantDetail,
) {
    // Collect datatypes from which we move children so we can discard
    const deparented = Array<Model>();

    // Now visit the tree and reparent as necessary
    const traversal = new MergeTraversal(revision, priority, (variants, recurse) => {
        // Determine the canonical type for this element
        const type = traversal.chooseType(variants);
        if (!(type instanceof ValueModel)) {
            recurse();
            return;
        }

        // If the canonical type is a seed type that can have children, variants that reference a local type with
        // children need to be rewritten
        if (type.base?.isSeed && Metatype.hasChildren(type.effectiveMetatype)) {
            for (const variantName in variants.map) {
                // Skip if this is the canonical variant or this variant already has children
                const variant = variants.map[variantName];
                if (variant === type || variant.children.length) {
                    continue;
                }

                // Skip if the base type is not local to the cluster or doesn't have children
                const base = variant.base;
                if (!(base instanceof ValueModel) || base.parent?.tag !== ElementTag.Cluster || !base.children.length) {
                    continue;
                }

                // Skip if multiple models reference the type
                if (base.parent?.references(base).length > 1) {
                    continue;
                }

                // Rewrite
                deparented.push(base);
                variant.children = base.children;
                variant.type = base.type;
            }
        }

        recurse();
    });
    traversal.traverse(variants.map);

    // Remove deparented datatypes.  We do this after recursing because removing from a set we're actively visiting may
    // be problematic
    deparented.forEach(m => (m.parent = undefined));

    return variants;
}

export namespace MergedModel {
    /**
     * Priorities define rules that control how values are merged.
     */
    export type Priorities = {
        /**
         * An element type or "*" to match all elements.
         */
        [typeName: string]: {
            /**
             * A field name or "*" to match all fields.
             */
            [fieldName: string]: string[];
        };
    };

    /**
     * A default set of priorities for the variants included with matter.js. We currently have "chip" as preferred over
     * "spec" by default, but then have overridden to reverse this for a lot of fields.  Should probably revisit the
     * default at some point.
     */
    export const DefaultPriorities: Priorities = {
        "*": {
            "*": ["local", "chip", "spec"],

            // Prefer spec for elements that are insufficiently defined in chip
            conformance: ["local", "spec", "chip"],
            constraint: ["local", "spec", "chip"],
            quality: ["local", "spec", "chip"],
            access: ["local", "spec", "chip"],

            // Prefer spec for element names
            name: ["local", "spec", "chip"],

            // Prefer spec for datatype names (must match element names)
            type: ["local", "spec", "chip"],

            // Prefer spec for detailed documentation
            details: ["local", "spec", "chip"],

            // Prefer spec for default values
            default: ["local", "spec", "chip"],
        },
    };
}
