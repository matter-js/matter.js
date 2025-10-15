/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, Diagnostic } from "#general";
import { Specification } from "#model";
import {
    AttributePath,
    ClusterType,
    DataVersionFilter,
    EventFilter,
    EventPath,
    GlobalAttributes,
    ReadRequest,
} from "#types";
import { MalformedRequestError } from "./MalformedRequestError.js";
import { resolvePathForSpecifier, Specifier } from "./Specifier.js";

/**
 * A read request formulated using Matter protocol semantics.
 */
export interface Read extends ReadRequest {}

/**
 * Formulate a read request with extended options and name-based IDs.
 */
export function Read(options: Read.Options, ...selectors: Read.Selector[]): Read;

/**
 * Formulate a read request with name-based IDs.
 */
export function Read(...selectors: Read.Selector[]): Read;

export function Read(optionsOrSelector: Read.Options | Read.Selector, ...selectors: Read.Selector[]): Read {
    if (optionsOrSelector === undefined) {
        throw new MalformedRequestError(`Read action designates no attributes or events`);
    }

    let options;
    if ("kind" in optionsOrSelector) {
        selectors = [optionsOrSelector, ...selectors];
        options = {};
    } else {
        options = optionsOrSelector;
    }
    let { attributes: attributeRequests, versionFilters, events: eventRequests, eventFilters } = options;

    const result = {
        isFabricFiltered: options.fabricFilter ?? true,
        interactionModelRevision: options.interactionModelRevision ?? Specification.INTERACTION_MODEL_REVISION,
        [Diagnostic.value]: () =>
            Diagnostic.dict({
                attributes: attributeRequests?.length
                    ? attributeRequests?.map(path => resolvePathForSpecifier(path)).join(", ")
                    : undefined,
                events: eventRequests?.length
                    ? eventRequests?.map(path => resolvePathForSpecifier(path)).join(", ")
                    : undefined,
                dataVersionFilters: versionFilters?.length
                    ? versionFilters
                          .map(
                              ({ path: { endpointId, clusterId }, dataVersion }) =>
                                  `${endpointId}/${clusterId}=${dataVersion}`,
                          )
                          .join(", ")
                    : undefined,
                eventFilters: eventFilters?.length
                    ? eventFilters.map(({ nodeId, eventMin }) => `${nodeId}=${eventMin}`).join(", ")
                    : undefined,
            }),
    } as Read;

    for (const selector of selectors) {
        reifySelector(selector);
    }

    if (!attributeRequests?.length && !eventRequests?.length) {
        throw new MalformedRequestError(`Read action designates no attributes or events`);
    }

    if (attributeRequests) {
        result.attributeRequests = attributeRequests;
    }

    if (versionFilters) {
        result.dataVersionFilters = versionFilters;
    }

    if (eventRequests) {
        result.eventRequests = eventRequests;
    }

    if (eventFilters !== undefined) {
        result.eventFilters = eventFilters;
    }

    return result;

    function reifySelector(selector: Read.Selector) {
        switch (selector.kind) {
            case "attribute":
                reifyAttributeSelector(selector);
                break;

            case "event":
                reifyEventSelector(selector);
                break;

            default:
                throw new MalformedRequestError(`Invalid selector kind "${(selector as Read.Selector).kind}"`);
        }
    }

    /**
     * Update "real" ReadRequest fields from our convenience attribute "selector".
     */
    function reifyAttributeSelector(selector: Read.AttributeSelector) {
        const cluster = Specifier.clusterOf(selector);
        const { endpoint } = selector;

        // Install data version filter if the endpoint reports it has complete version information
        if (typeof endpoint === "object" && endpoint?.versions && typeof cluster === "object" && cluster !== null) {
            const version = endpoint.versions?.[camelize(cluster.name)];
            if (version !== undefined) {
                const filter = {
                    path: { endpointId: endpoint.number, clusterId: cluster.id },
                    dataVersion: version,
                };
                if (versionFilters === undefined) {
                    versionFilters = [filter];
                } else if (
                    versionFilters.find(
                        ({ path: { endpointId, clusterId } }) =>
                            endpointId === endpoint.number && clusterId === cluster.id,
                    ) === undefined
                ) {
                    versionFilters.push(filter);
                }
            }
        }

        // Configure base AttributePath
        if (attributeRequests === undefined) {
            attributeRequests = [];
        }
        const prototype: AttributePath = {};
        if (endpoint !== undefined) {
            prototype.endpointId = Specifier.endpointIdOf(selector);
        }
        if (cluster !== undefined) {
            prototype.clusterId = cluster.id;
        }

        // If the attribute is a wildcard we are done
        let { attributes } = selector;
        if (attributes === undefined) {
            attributeRequests.push(prototype);
            return;
        }

        // Add concrete attribute requests
        if (!Array.isArray(attributes)) {
            attributes = [attributes];
        }
        for (const specifier of attributes) {
            attributeRequests.push({ ...prototype, attributeId: Specifier.attributeFor(cluster, specifier).id });
        }
    }

    /**
     * Update "real" ReadRequest fields from our convenience event "selector"
     */
    function reifyEventSelector(selector: Read.EventSelector) {
        const cluster = Specifier.clusterOf(selector);
        const { endpoint } = selector;

        // Install event minimum if the endpoint reports ingested events
        if (typeof endpoint === "object" && endpoint.minEvent !== undefined) {
            if (eventFilters === undefined) {
                eventFilters = [{ eventMin: endpoint.minEvent }];
            }
        }

        // Configure base EventPath
        if (eventRequests === undefined) {
            eventRequests = [];
        }
        const prototype: EventPath = {};
        if (endpoint !== undefined) {
            prototype.endpointId = Specifier.endpointIdOf(selector);
        }
        if (cluster !== undefined) {
            prototype.clusterId = cluster.id;
        }

        // If the event is a wildcard we are done
        let { events } = selector;
        if (events === undefined) {
            eventRequests.push(prototype);
            return;
        }

        // Add concrete event requests
        if (!Array.isArray(events)) {
            events = [events];
        }
        for (const specifier of events) {
            eventRequests.push({ ...prototype, eventId: Specifier.eventFor(cluster, specifier).id });
        }
    }
}

export namespace Read {
    export interface Options {
        attributes?: AttributePath[];
        versionFilters?: DataVersionFilter[];
        events?: EventPath[];
        eventFilters?: EventFilter[];
        fabricFilter?: boolean;
        interactionModelRevision?: number;
    }

    export interface Attributes extends Read {
        attributeRequests: Exclude<Read["attributeRequests"], undefined>;
    }

    export function containsAttribute(request: Read): request is Attributes {
        return !!request.attributeRequests?.length;
    }

    export interface Events extends Read {
        eventRequests: Exclude<Read["eventRequests"], undefined>;
    }

    export function containsEvent(request: Read): request is Events {
        return !!request.eventRequests?.length;
    }

    /**
     * Selects attributes or events to read.
     */
    export type Selector<C extends Specifier.Cluster = Specifier.Cluster> =
        | ({ kind: "attribute" } & AttributeSelector<C>)
        | ({ kind: "event" } & EventSelector<C>);

    /**
     * Selects attributes to read.  Limits fields to legal permutations per the Matter specification.
     */
    export type AttributeSelector<C extends Specifier.Cluster = Specifier.Cluster> =
        | AttributeSelector.Concrete<C>
        | AttributeSelector.FullWildcard
        | AttributeSelector.Global
        | AttributeSelector.WildcardEndpoint<C>
        | AttributeSelector.WildcardAttribute
        | AttributeSelector.Endpoint;

    /**
     * Selects events to read.  Limits fields to legal permutations per the Matter specification.
     */
    export type EventSelector<C extends Specifier.Cluster = Specifier.Cluster> =
        | EventSelector.Concrete<C>
        | EventSelector.FullWildcard
        | EventSelector.WildcardEndpoint<C>
        | EventSelector.WildcardEvent
        | EventSelector.Endpoint;

    export function Attribute<const C extends ClusterType>(
        selector?: AttributeSelector<C>,
    ): { kind: "attribute" } & AttributeSelector<C> {
        return {
            kind: "attribute",
            ...selector,
        };
    }

    export function Event<const T extends EventSelector>(selector: T): { kind: "event" } & T {
        return {
            kind: "event",
            ...selector,
        };
    }

    export interface WildcardFlags {
        skipRoot?: boolean;
        skipCustom?: boolean;
        skipDiagnostics?: boolean;
        skipGlobals?: boolean;
        skipAttributeList?: boolean;
        skipCommandList?: boolean;
        skipFixed?: boolean;
        skipChangesOmitted?: boolean;
    }

    export type GlobalAttributeSpecifier = ClusterType.Attribute | keyof GlobalAttributes<any>;

    export namespace AttributeSelector {
        export interface Concrete<C extends Specifier.Cluster> {
            endpoint: Specifier.Endpoint;
            cluster: C;
            attributes: Specifier.Attribute<Specifier.ClusterFor<C>> | Specifier.Attribute<Specifier.ClusterFor<C>>[];
        }

        export interface Wildcard {
            flags?: WildcardFlags;
        }

        export interface FullWildcard extends Wildcard {
            endpoint?: undefined;
            cluster?: undefined;
            attributes?: undefined;
        }

        export interface Global extends Wildcard {
            endpoint?: Specifier.Endpoint;
            cluster?: undefined;
            attributes: GlobalAttributeSpecifier | GlobalAttributeSpecifier[];
        }

        export interface WildcardEndpoint<C extends Specifier.Cluster> extends Wildcard {
            endpoint?: undefined;
            cluster: C;
            attributes: Specifier.Attribute<Specifier.ClusterFor<C>> | Specifier.Attribute<Specifier.ClusterFor<C>>[];
        }

        export interface WildcardAttribute extends Wildcard {
            endpoint?: Specifier.Endpoint;
            cluster: Specifier.Cluster;
            attributes?: undefined;
        }

        export interface Endpoint extends Wildcard {
            endpoint: Specifier.Endpoint;
            cluster?: undefined;
            attributes?: undefined;
        }
    }

    export namespace EventSelector {
        export interface Concrete<C extends Specifier.Cluster> {
            endpoint: Specifier.Endpoint;
            cluster: Specifier.Cluster;
            events: Specifier.Event<Specifier.ClusterFor<C>> | Specifier.Event<Specifier.ClusterFor<C>>[];
        }

        export interface Wildcard {
            flags?: WildcardFlags;
        }

        export interface FullWildcard extends Wildcard {
            endpoint?: undefined;
            cluster?: undefined;
            events?: undefined;
        }

        export interface WildcardEndpoint<C extends Specifier.Cluster> extends Wildcard {
            endpoint?: undefined;
            cluster: Specifier.Cluster;
            events: Specifier.Event<Specifier.ClusterFor<C>> | Specifier.Event<Specifier.ClusterFor<C>>[];
        }

        export interface WildcardEvent extends Wildcard {
            endpoint: Specifier.Endpoint;
            cluster: Specifier.Cluster;
            events?: undefined;
        }

        export interface Endpoint extends Wildcard {
            endpoint: Specifier.Endpoint;
            cluster?: undefined;
            events?: undefined;
        }
    }
}
