/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterType, EndpointNumber, GlobalAttributeNames, GlobalAttributes } from "#types";
import { MalformedRequestError } from "./MalformedRequestError.js";

const GlobalAttrMap = GlobalAttributes({}) as Record<string, ClusterType.Attribute>;

/**
 * A "specifier" addresses a specific element of the Matter data model in the context of a request.
 */
export namespace Specifier {
    /**
     * Clusters we designate with an object to convey structural and type information.  The second form of this union
     * allows for specification with a host object (such as a ClusterBehavior instance or class).
     */
    export type Cluster = ClusterType | { cluster: ClusterType };

    /**
     * You may address endpoints with a bare ID but the object form allows an "endpoint object" as input and optionally
     * conveys additional metadata.
     */
    export type Endpoint =
        | EndpointNumber
        | { number: EndpointNumber; versions?: Record<string, number>; minEvent?: number };

    /**
     * An attribute specifier may be the name of a cluster attribute or the name of a cluster or global attribute.
     */
    export type Attribute<C extends ClusterType = ClusterType> =
        | ClusterType.Attribute
        | (string & keyof C["attributes"])
        | GlobalAttributeNames<any>;

    /**
     * A command specifier may be the name of a cluster attribute or the name of a cluster command.
     */
    export type Command<C extends ClusterType = ClusterType> = ClusterType.Command | (string & keyof C["commands"]);

    /**
     * An event specifier may be the name of a cluster event or an event object.
     */
    export type Event<C extends ClusterType = ClusterType> = ClusterType.Event | (string & keyof C["events"]);

    /**
     * Extract a cluster type from a cluster specifier type.
     */
    export type ClusterFor<T extends Cluster> = T extends ClusterType
        ? T
        : T extends { cluster: ClusterType }
          ? T["cluster"]
          : never;

    /**
     * Extract a cluster type from a cluster specifier.
     */
    export function clusterFor<const T extends Cluster>(specifier: T) {
        if ("cluster" in specifier) {
            return specifier["cluster"] as ClusterFor<T>;
        }
        return specifier as ClusterFor<T>;
    }

    /**
     * Extract an attribute object from a cluster and attribute specifier.
     */
    export function attributeFor(cluster: ClusterType | undefined, specifier: Specifier.Attribute) {
        if (typeof specifier === "object") {
            return specifier;
        }

        if (cluster === undefined) {
            const attr = GlobalAttrMap[specifier];
            if (attr === undefined) {
                throw new MalformedRequestError(`Cannot designate event "${specifier}" without a cluster`);
            }
            return attr;
        }

        const attr = cluster.attributes?.[specifier];
        if (attr === undefined) {
            throw new MalformedRequestError(`Cluster ${cluster.name} does not define attribute ${specifier}`);
        }

        return attr;
    }

    /**
     * Extract a command type from a cluster type and command specifier.
     */
    export type CommandFor<C extends ClusterType, CMD extends Specifier.Command<C>> = CMD extends string
        ? C["commands"][CMD]
        : CMD extends ClusterType.Command
          ? CMD
          : never;

    export function commandFor<const C extends ClusterType, const CMD extends Specifier.Command<C>>(
        cluster: C | undefined,
        specifier: CMD,
    ): CommandFor<C, CMD> {
        if (typeof specifier !== "string") {
            return specifier as CommandFor<C, CMD>;
        }

        if (cluster === undefined) {
            throw new MalformedRequestError(`Cannot designate command "${specifier}" without a cluster`);
        }

        const command = cluster.commands?.[specifier];
        if (command === undefined) {
            throw new MalformedRequestError(`Cluster ${cluster.name} does not define command ${specifier}`);
        }

        return command as CommandFor<C, CMD>;
    }

    /**
     * Extract an event object from a cluster and event specifier.
     */
    export function eventFor(cluster: ClusterType | undefined, specifier: Specifier.Event) {
        if (typeof specifier === "object") {
            return specifier;
        }

        if (cluster === undefined) {
            throw new MalformedRequestError(`Cannot designate event "${specifier}" without a cluster`);
        }

        const event = cluster.events?.[specifier];
        if (event === undefined) {
            throw new MalformedRequestError(`Cluster ${cluster.name} does not define event ${specifier}`);
        }

        return event;
    }

    /**
     * Extract the cluster type from a cluster request type.
     */
    export type ClusterOf<T extends { cluster?: Cluster }> = T extends { cluster: Specifier.Cluster }
        ? Specifier.ClusterFor<T["cluster"]>
        : undefined;

    /**
     * Extract the cluster type from an element request.
     */
    export function clusterOf<const T extends { cluster?: Cluster }>(request: T): ClusterOf<T> {
        if (request.cluster) {
            return Specifier.clusterFor(request.cluster) as ClusterOf<T>;
        }
        return undefined as ClusterOf<T>;
    }

    /**
     * Determine endpoint number for an object with an endpoint specifier.
     */
    export function endpointIdOf<const T extends { endpoint?: Endpoint }>(request: T): EndpointNumber | undefined {
        if (typeof request.endpoint === "number") {
            return request.endpoint;
        }
        return request.endpoint?.number;
    }
}

export function toWildcardOrHexPath(name: string, value: number | bigint | undefined) {
    if (value === undefined) {
        return "*";
    }
    return `${name ? `${name}:` : ""}0x${value.toString(16)}`;
}

/**
 * Resolve a path into a human readable textual form for logging
 * TODO: Add a Diagnostic display formatter for this
 */
export function resolvePathForSpecifier<const C extends ClusterType>(location: {
    endpoint?: Specifier.Endpoint;
    cluster?: Specifier.Cluster;
    attribute?: Specifier.Attribute<Specifier.ClusterFor<C>>;
    event?: Specifier.Event<Specifier.ClusterFor<C>>;
    command?: Specifier.Command<Specifier.ClusterFor<C>>;
    isUrgent?: boolean;
    listIndex?: number | null;
}) {
    const endpointId = Specifier.endpointIdOf(location);
    const cluster = location.cluster ? Specifier.clusterFor(location.cluster) : undefined;
    const attribute = location.attribute && cluster ? Specifier.attributeFor(cluster, location.attribute) : undefined;
    const event = location.event && cluster ? Specifier.eventFor(cluster, location.event) : undefined;
    const command = location.command && cluster ? Specifier.commandFor(cluster, location.command) : undefined;
    const isUrgentString = "isUrgent" in location && location.isUrgent ? "!" : "";
    const listIndexString = "listIndex" in location && location.listIndex === null ? "[ADD]" : "";
    const postString = `${listIndexString}${isUrgentString}`;

    const clusterId = cluster?.id;
    const elementId = attribute ? attribute.id : event ? event.id : command ? command.requestId : undefined;

    if (endpointId === undefined) {
        return `*.${toWildcardOrHexPath("", clusterId)}.${toWildcardOrHexPath("", elementId)}${postString}`;
    }

    const endpointName = toWildcardOrHexPath("", endpointId);

    if (cluster === undefined || clusterId === undefined) {
        return `${endpointName}.*.${toWildcardOrHexPath("", elementId)}${postString}`;
    }

    const clusterName = toWildcardOrHexPath(cluster.name, clusterId);

    if (elementId !== undefined) {
        if (event) {
            return `${endpointName}.${clusterName}.${toWildcardOrHexPath(typeof location.event === "string" ? location.event : "?", elementId)}${postString}`;
        } else if (attribute) {
            return `${endpointName}.${clusterName}.${toWildcardOrHexPath(typeof location.attribute === "string" ? location.attribute : "?", elementId)}${postString}`;
        } else if (command) {
            return `${endpointName}.${clusterName}.${toWildcardOrHexPath(typeof location.command === "string" ? location.command : "?", elementId)}${postString}`;
        } else {
            return "unknown";
        }
    } else {
        return `${endpointName}.${clusterName}.*${postString}`;
    }
}
