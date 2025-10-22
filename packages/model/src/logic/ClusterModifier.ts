/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "#aspects/Constraint.js";
import type { ElementTag } from "#common/ElementTag.js";
import type { FieldValue } from "#common/FieldValue.js";
import { isDeepEqual } from "#general";
import type { ClusterModel } from "#models/ClusterModel.js";
import { Model as Schema, StructuralModelError } from "#models/Model.js";
import { ValueModel } from "#models/ValueModel.js";
import { Scope } from "./Scope.js";

/**
 * Apply a declarative set of modifications to a {@link ClusterModel}.
 *
 * We use this to apply a limited set of modifications such as those expressed by device type requirements.  We track
 * these modifications with individual fields because we use them to modify types in addition to the underlying model.
 */
export namespace ClusterModifier {
    /**
     * Apply the modifications defined by a device type.
     */
    export function applyRequirements(target: ClusterModel, modifications: ClusterModifier.RequirementModifications) {
        return apply(target, modifications, (element, patch) => {
            if (patch.optional !== undefined) {
                const desiredConformance = patch.optional ? "O" : "M";
                if (element.conformance.toString() !== desiredConformance) {
                    if (element.isFinal) {
                        element = element.clone();
                    }
                    element.conformance = desiredConformance;
                }
            }

            if (patch.default !== undefined) {
                if (!isDeepEqual(element.default, patch.default)) {
                    if (element.isFinal) {
                        element = element.clone();
                    }
                    element.default = patch.default;
                }
            }

            if (patch.min !== undefined) {
                const constraint = element.constraint;
                if (constraint.min !== patch.min) {
                    if (element.isFinal) {
                        element = element.clone();
                    }
                    element.constraint = new Constraint({ ...element.constraint, min: patch.min });
                }
            }

            if (patch.max !== undefined) {
                const constraint = element.constraint;
                if (constraint.max !== patch.max) {
                    if (element.isFinal) {
                        element = element.clone();
                    }
                    element.constraint = new Constraint({ ...element.constraint, max: patch.max });
                }
            }

            return element;
        });
    }

    /**
     * Set {@link Model#isPresent} for the specified elements.
     */
    export function applyPresence(target: ClusterModel, modifications: ClusterModifier.PresenceModifications) {
        return apply(target, modifications, (element, isSupported) => {
            if (element.isSupported === isSupported) {
                return;
            }

            if (element.isFinal) {
                element = element.clone();
            }
            element.isSupported = isSupported;

            return element;
        });
    }

    export function apply<T>(
        target: ClusterModel,
        modifications: ClusterModifier.ModificationSet<T>,
        apply: (model: ClusterModel.Child, modification: T) => ClusterModel.Child | undefined,
    ) {
        const scope = Scope(target);
        let model: ClusterModel | undefined;

        for (const [pluralTag, mods] of Object.entries(modifications)) {
            const tag = (
                pluralTag.endsWith("s") ? pluralTag.substring(0, pluralTag.length - 1) : pluralTag
            ) as ElementTag;
            if (Schema.types[tag] === undefined) {
                throw new StructuralModelError(`Unknown modifier set key ${pluralTag}`);
            }

            const members = scope.membersOf(target, { conformance: Scope.ConformantConformance, tags: [tag] });

            for (const [name, mod] of Object.entries(mods)) {
                const member = members.for(name);
                if (member === undefined) {
                    throw new StructuralModelError(`${member} has no ${tag} "${name}"`);
                }

                if (!(member instanceof ValueModel)) {
                    throw new StructuralModelError(`Tag ${tag} cannot be modified because it is not a value element`);
                }

                const replacement = apply(member, mod as T);
                if (replacement === member || replacement === undefined) {
                    return;
                }

                if (model === undefined) {
                    model = target.extend();
                }

                model.children.push(replacement);
            }
        }

        return model ?? target;
    }
}

export namespace ClusterModifier {
    /**
     * Apply modifications as defined by device type requirements.
     */
    export interface RequirementModifications extends ModificationSet<RequirementModification> {}

    /**
     * Mark elements as active or inactive by default (if allowed by conformance).
     */
    export interface PresenceModifications extends ModificationSet<boolean> {}

    export interface RequirementModification {
        /**
         * If present, forces conformance to O or M.
         */
        optional?: boolean;

        /**
         * Replaces the default for the element.
         */
        default?: FieldValue;

        /**
         * Modifies the lower bound of the element's constraint.
         */
        min?: FieldValue;

        /**
         * Modifies the upper bound of the element's constraint.
         */
        max?: FieldValue;
    }

    /**
     * A set of element modifications keyed by tag and name
     */
    export interface ModificationSet<T> extends Partial<Record<`${ElementTag}s`, Record<string, T | undefined>>> {}
}
