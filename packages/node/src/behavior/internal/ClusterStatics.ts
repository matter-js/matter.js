/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { hex, ImplementationError } from "@matter/general";
import { ClassSemantics, ClusterModel, ElementTag, Schema, Semantics } from "@matter/model";
import { ClusterType } from "@matter/types";
import type { Behavior } from "../Behavior.js";
import type { ClusterBehavior } from "../cluster/ClusterBehavior.js";
import { deriveOwnClusterStatics } from "./ClusterDerivation.js";
import { setModeledClasses } from "./ModeledState.js";

type ClusterStaticName = "cluster" | "features" | "id";

/**
 * The class-level values {@link ClusterBehavior} serves through its accessors, per class.  `decorated` marks values
 * derived from a class's decorations, as opposed to those a class assigned or inherited.
 */
interface ClusterStatics extends Partial<Record<ClusterStaticName, unknown>> {
    decorated?: boolean;
}

const clusterStatics = new WeakMap<object, ClusterStatics>();
const resolving = new WeakSet<object>();

/**
 * Define `cluster`, `features` and `id` on `root` as accessors that serve, for `root` and each subclass, the values
 * {@link installClusterStatics} records when the subclass's schema resolves.  The first read of a class without
 * recorded values resolves its schema; later reads are a map lookup.
 *
 * An assignment, as {@link ClusterBehaviorType} makes for a generated class and code compiled without
 * `useDefineForClassFields` makes for a static field, records the value until the class's schema resolves.
 */
export function defineClusterStatics(root: ClusterBehavior.Type) {
    for (const [name, fallback] of [
        ["cluster", ClusterType.Unknown],
        ["features", {}],
        ["id", undefined],
    ] as const) {
        Object.defineProperty(root, name, {
            get(this: Behavior.Type): unknown {
                const known = clusterStatics.get(this);
                if (known !== undefined && name in known) {
                    return known[name];
                }
                if (this === root) {
                    return fallback;
                }

                if (!resolving.has(this)) {
                    resolving.add(this);
                    try {
                        Schema(this);
                    } finally {
                        resolving.delete(this);
                    }
                }

                const resolved = clusterStatics.get(this);
                if (resolved === undefined || !(name in resolved)) {
                    throw new ImplementationError(
                        `Cannot read ${name} of behavior ${this.name} while its schema resolves, such as from a State field initializer`,
                    );
                }
                return resolved[name];
            },

            set(this: Behavior.Type, value: unknown) {
                if (ClassSemantics.hasOwnSemantics(this) && Semantics.classOf(this).isFinal) {
                    throw new ImplementationError(
                        `Cannot set ${name} of behavior ${this.name} because its schema is resolved`,
                    );
                }
                clusterStatics.set(this, { ...clusterStatics.get(this), [name]: value });
            },

            enumerable: true,
            configurable: true,
        });
    }

    Object.defineProperties(root, {
        [ClassSemantics.afterFinalize]: {
            value(this: Behavior.Type) {
                installClusterStatics(root, this);
            },
        },
    });
}

/**
 * Records the namespace, features and ID of `type` once its schema is final.
 *
 * A class whose lineage is decorated, or whose final schema adds an attribute, command or event to its parent's, gets
 * them, and its State and Events, derived from that schema like a generated class.  A class that declares or assigned
 * its own namespace, and any other class, keeps its own values and takes the rest from its parent.  Everything is
 * computed before anything is installed, so a failure leaves the class unchanged.
 *
 * @throws ImplementationError if the schema declares a cluster ID other than the one of the cluster behavior `type`
 * extends
 */
function installClusterStatics(root: ClusterBehavior.Type, type: Behavior.Type) {
    const parent: unknown = Object.getPrototypeOf(type);
    if (!isClusterBehaviorClass(root, parent)) {
        return;
    }
    const inherited = { cluster: parent.cluster, features: parent.features, id: parent.id };

    const schema = Schema(type);
    if (
        Object.hasOwn(type, "cluster") ||
        clusterStatics.get(type)?.cluster !== undefined ||
        !(schema instanceof ClusterModel) ||
        schema.id === undefined
    ) {
        addClusterStatics(type, inherited);
        return;
    }

    if (inherited.cluster !== ClusterType.Unknown && inherited.cluster.id !== schema.id) {
        throw new ImplementationError(
            `Behavior ${type.name} declares cluster 0x${hex.fixed(schema.id, 8)} but extends ${parent.name} for cluster ` +
                `0x${hex.fixed(inherited.cluster.id, 8)}; a different cluster needs its own class that extends ClusterBehavior`,
        );
    }

    const parentIsDecorated = clusterStatics.get(parent)?.decorated === true;
    if (!parentIsDecorated && !addsElements(schema, Schema(parent))) {
        addClusterStatics(type, inherited);
        return;
    }

    const { cluster, features, State, Events } = deriveOwnClusterStatics(type, schema);
    const id = typeof inherited.id === "string" ? inherited.id : schema.propertyName;

    Object.defineProperties(type, {
        State: { value: State, enumerable: true, writable: true, configurable: true },
        Events: { value: Events, enumerable: true, writable: true, configurable: true },
    });
    setModeledClasses(type, State, Events);
    addClusterStatics(type, { cluster, features, id, decorated: true });
}

/**
 * Records `values` for `type` except those the class assigned itself.
 */
function addClusterStatics(type: Behavior.Type, values: ClusterStatics) {
    clusterStatics.set(type, { ...values, ...clusterStatics.get(type) });
}

/**
 * Narrows `value` to a class the accessors serve.  {@link ClusterBehavior.isType} takes a behavior type, not an
 * arbitrary prototype.
 */
function isClusterBehaviorClass(root: ClusterBehavior.Type, value: unknown): value is ClusterBehavior.Type {
    return typeof value === "function" && (value === root || value.prototype instanceof root);
}

/**
 * Whether `schema` has an attribute, command or event whose ID `base` does not have.  The namespace of a class is
 * rebuilt only for such an element.  An element redeclared with the base's ID, such as one with changed access or
 * quality, changes the class's schema but leaves the inherited namespace in place.
 */
function addsElements(schema: ClusterModel, base: Schema | undefined) {
    const tags = [ElementTag.Attribute, ElementTag.Command, ElementTag.Event];
    const known = new Set<string>();
    if (base instanceof ClusterModel) {
        for (const member of base.scope.membersOf(base, { tags })) {
            known.add(`${member.tag}:${member.id}`);
        }
    }
    for (const member of schema.scope.membersOf(schema, { tags })) {
        if (member.id !== undefined && !known.has(`${member.tag}:${member.id}`)) {
            return true;
        }
    }
    return false;
}
