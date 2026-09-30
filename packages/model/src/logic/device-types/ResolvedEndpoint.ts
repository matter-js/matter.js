/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification } from "../../common/DeviceClassification.js";
import { ElementTag } from "../../common/ElementTag.js";
import { EndpointComposition } from "../../common/EndpointComposition.js";
import { ClusterElement } from "../../elements/ClusterElement.js";
import { AttributeModel, ClusterModel, CommandModel, DeviceTypeModel, EventModel, Model } from "../../models/index.js";
import { Scope } from "../Scope.js";
import type { DeviceTypeValidationPass } from "./DeviceTypeValidationPass.js";
import { lookupsFor } from "./ModelLookups.js";

/**
 * The facts about an endpoint that a device type's requirements are judged against, as {@link DeviceTypeFacts}
 * answers them and resolved in the model of a pass.
 *
 * Clusters are named by their model name, as {@link RequirementResolver.clusterOf} answers it. Features are feature
 * codes (e.g. `LT`), which is the name of the feature model {@link RequirementResolver.featureOf} resolves a feature
 * requirement to.
 *
 * Children are the parts that are {@link DeviceTypeFacts.isPresent present}, because only those answer what they
 * implement.
 *
 * @internal
 */
export class ResolvedEndpoint<E> {
    readonly #endpoint: E;
    readonly #pass: DeviceTypeValidationPass<E>;
    #deviceTypes?: DeviceTypeModel[];
    #servers?: Map<string, ClusterModel>;
    #clients?: Map<string, ClusterModel>;
    #serverNames?: ReadonlySet<string>;
    #clientNames?: ReadonlySet<string>;
    #serverNamesById?: Map<number, string>;
    #clientNamesById?: Map<number, string>;
    readonly #features = new Map<string, ReadonlySet<string>>();
    #children?: E[];
    #compositionScope?: E[];
    #compositionMembers?: Set<E>;

    /**
     * Facts about {@link endpoint}, with device types and clusters resolved in the model of {@link pass}. One pass
     * answers one instance per endpoint, which reads the endpoint at most once.
     */
    static of<E>(endpoint: E, pass: DeviceTypeValidationPass<E>): ResolvedEndpoint<E> {
        return pass.resolved.get(endpoint, () => new ResolvedEndpoint(endpoint, pass));
    }

    private constructor(endpoint: E, pass: DeviceTypeValidationPass<E>) {
        this.#endpoint = endpoint;
        this.#pass = pass;
    }

    get endpoint() {
        return this.#endpoint;
    }

    /**
     * The device types the endpoint lists that the model defines. A device type the model does not define, such as a
     * manufacturer-specific one, states no requirements that could be checked.
     */
    get deviceTypes(): DeviceTypeModel[] {
        if (this.#deviceTypes === undefined) {
            this.#deviceTypes = new Array<DeviceTypeModel>();
            const lookups = lookupsFor(this.#pass.model);
            for (const id of this.#pass.facts.deviceTypeIdsOf(this.#endpoint)) {
                const model = lookups.deviceTypeOf(id);
                if (model !== undefined) {
                    this.#deviceTypes.push(model);
                }
            }
        }
        return this.#deviceTypes;
    }

    /**
     * Names of the server clusters on the endpoint.
     */
    get servers(): ReadonlySet<string> {
        this.#serverNames ??= new Set(this.#serverClusters.keys());
        return this.#serverNames;
    }

    /**
     * Names of the client clusters on the endpoint.
     */
    get clients(): ReadonlySet<string> {
        this.#clientNames ??= new Set(this.#clientClusters.keys());
        return this.#clientNames;
    }

    /**
     * The name the endpoint's server or client cluster with {@link id} goes by in {@link servers} or {@link clients},
     * or undefined when the endpoint has no such cluster.
     */
    clusterName(side: "server" | "client", id: number): string | undefined {
        if (side === "server") {
            this.#serverNamesById ??= byId(this.#serverClusters);
            return this.#serverNamesById.get(id);
        }
        this.#clientNamesById ??= byId(this.#clientClusters);
        return this.#clientNamesById.get(id);
    }

    /**
     * Whether a server or client application cluster exists on the endpoint.
     */
    hasApplicationCluster(side: "server" | "client") {
        const clusters = side === "server" ? this.#serverClusters : this.#clientClusters;
        for (const cluster of clusters.values()) {
            if (cluster.effectiveClassification === ClusterElement.Classification.Application) {
                return true;
            }
        }
        return false;
    }

    /**
     * The codes of the features the endpoint's server {@link cluster} supports; empty when there is no such server.
     */
    features(cluster: string): ReadonlySet<string> {
        let features = this.#features.get(cluster);
        if (features === undefined) {
            features = new Set(this.#serverClusters.get(cluster)?.supportedFeatures ?? []);
            this.#features.set(cluster, features);
        }
        return features;
    }

    /**
     * Whether the endpoint's server {@link cluster} implements {@link element}, an attribute, command or event model
     * of that cluster.
     *
     * An event also needs operational support in the cluster's schema: mandatory under the enabled features, or
     * enabled explicitly.
     */
    supports(cluster: string, element: Model): boolean {
        const schema = this.#serverClusters.get(cluster);
        if (schema === undefined) {
            return false;
        }

        const elements = this.#pass.facts.elementsOf(this.#endpoint, schema);
        if (element instanceof AttributeModel) {
            return elements.attributes.has(element.propertyName);
        }
        if (element instanceof CommandModel) {
            return elements.commands.has(element.propertyName);
        }
        if (element instanceof EventModel) {
            // An implementation may keep an event's emitter after a feature that enabled the event is turned off, so
            // implementing the emitter alone does not mean the endpoint emits the event
            const event = schema.member(element.name, [ElementTag.Event]);
            return (
                elements.events.has(element.propertyName) &&
                event !== undefined &&
                Scope(schema).hasOperationalSupport(event)
            );
        }
        return false;
    }

    /**
     * The endpoint's direct children.
     */
    get children(): E[] {
        if (this.#children === undefined) {
            const { facts } = this.#pass;
            this.#children = [...facts.partsOf(this.#endpoint)].filter(part => facts.isPresent(part));
        }
        return this.#children;
    }

    /**
     * Whether a device type of the endpoint is classified as a node, which makes the endpoint the root of a node scope.
     */
    get isNodeEndpoint() {
        return this.deviceTypes.some(deviceType => deviceType.classification === DeviceClassification.Node);
    }

    /**
     * Whether the endpoint's `PartsList` holds every descendant rather than its children.
     *
     * @see {@link MatterSpecification.v161.Core} § 9.2.7.2
     */
    get composesFullFamily() {
        const lookups = lookupsFor(this.#pass.model);
        return this.deviceTypes.some(
            deviceType => lookups.compositionOf(deviceType) === EndpointComposition.FullFamily,
        );
    }

    /**
     * The endpoints the endpoint's `PartsList` reaches within its node scope: its children for the tree pattern and
     * its descendants for the full-family pattern, never entering a node endpoint below it.
     */
    get compositionScope(): E[] {
        if (this.#compositionScope !== undefined) {
            return this.#compositionScope;
        }

        const scope = new Array<E>();
        const fullFamily = this.composesFullFamily;

        const visit = (endpoint: E) => {
            for (const child of ResolvedEndpoint.of(endpoint, this.#pass).children) {
                if (ResolvedEndpoint.of(child, this.#pass).isNodeEndpoint) {
                    continue;
                }
                scope.push(child);
                if (fullFamily) {
                    visit(child);
                }
            }
        };
        visit(this.#endpoint);

        this.#compositionScope = scope;
        return scope;
    }

    /**
     * Whether {@link endpoint} is in the {@link compositionScope}.
     */
    composes(endpoint: E) {
        this.#compositionMembers ??= new Set(this.compositionScope);
        return this.#compositionMembers.has(endpoint);
    }

    get #serverClusters() {
        if (this.#servers === undefined) {
            this.#servers = byName(this.#pass.facts.serverClustersOf(this.#endpoint));
        }
        return this.#servers;
    }

    get #clientClusters() {
        if (this.#clients === undefined) {
            this.#clients = byName(this.#pass.facts.clientClustersOf(this.#endpoint));
        }
        return this.#clients;
    }
}

function byName(clusters: Iterable<ClusterModel>) {
    const named = new Map<string, ClusterModel>();
    for (const cluster of clusters) {
        named.set(cluster.name, cluster);
    }
    return named;
}

function byId(clusters: ReadonlyMap<string, ClusterModel>) {
    const ids = new Map<number, string>();
    for (const [name, cluster] of clusters) {
        if (cluster.id !== undefined && !ids.has(cluster.id)) {
            ids.set(cluster.id, name);
        }
    }
    return ids;
}
