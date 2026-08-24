/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/main";
import { ClusterModel, Matter, Schema } from "@matter/model";

const byId = new Map<number, ClusterModel>();
const byName = new Map<string, ClusterModel>();
const registered = new Set<NewableFunction>();

/**
 * Makes a cluster the standard Matter model does not define resolvable by a cert test's controller.
 *
 * A TC driving a cluster outside the specification — CHIP's own `FaultInjection` test cluster, a
 * vendor's extension — declares it with the model annotations (`@cluster`/`@command`/`@field`) and
 * registers the class here. Both controller adapters then accept its id or name wherever they accept a
 * standard cluster's, and encode payloads through the declared schema.
 *
 * Registering the same class twice is a no-op, so several test files may declare the same dependency;
 * registering a different definition for an id or name already taken throws rather than silently
 * changing what an earlier declaration resolves to.
 */
export function registerCertCustomCluster(definition: NewableFunction): ClusterModel {
    const schema = Schema.Required(definition);
    if (!(schema instanceof ClusterModel)) {
        throw new ImplementationError(
            `Custom cert cluster ${definition.name} decorates a ${schema.tag}, not a cluster; annotate the class ` +
                "with @cluster(<id>)",
        );
    }

    const { id, name } = schema;
    if (id === undefined) {
        throw new ImplementationError(
            `Custom cert cluster ${definition.name} has no id; @cluster requires one so a request can address it`,
        );
    }

    if (registered.has(definition)) {
        return schema;
    }

    if (Matter.clusters(id) !== undefined || Matter.clusters(name) !== undefined) {
        throw new ImplementationError(
            `Custom cert cluster ${definition.name} (id ${id}, name "${name}") is already defined by the standard ` +
                "Matter model; use the standard definition instead of shadowing it",
        );
    }

    for (const [key, existing] of [
        [id, byId.get(id)],
        [name, byName.get(name)],
    ] as const) {
        if (existing !== undefined) {
            throw new ImplementationError(
                `Custom cert cluster ${definition.name} claims ${JSON.stringify(key)}, which is already registered ` +
                    `for cluster "${existing.name}" (id ${existing.id})`,
            );
        }
    }

    byId.set(id, schema);
    byName.set(name, schema);
    registered.add(definition);

    return schema;
}

/**
 * Resolves `cluster` through the standard Matter model, falling back to a
 * {@link registerCertCustomCluster | registered} custom definition. Undefined for a cluster neither
 * defines — a write to an out-of-model cluster infers its schema instead of failing.
 */
export function findCertCluster(cluster: string | number): ClusterModel | undefined {
    return Matter.clusters(cluster) ?? (typeof cluster === "number" ? byId.get(cluster) : byName.get(cluster));
}

/**
 * As {@link findCertCluster}, for a caller that cannot proceed without the definition and its id.
 */
export function certClusterModelFor(cluster: string | number): { model: ClusterModel; id: number } {
    const model = findCertCluster(cluster);
    if (model === undefined) {
        throw new ImplementationError(`Unknown cluster ${cluster}`);
    }

    const { id } = model;
    if (id === undefined) {
        throw new ImplementationError(`Cluster model for ${cluster} has no id`);
    }

    return { model, id };
}
