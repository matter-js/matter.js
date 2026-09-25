/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { DescriptorServer } from "#behaviors/descriptor";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { Lifecycle } from "@matter/general";
import {
    AttributeModel,
    ClusterElement,
    CommandModel,
    DeviceClassification,
    DeviceTypeModel,
    ElementTag,
    EndpointComposition,
    EventModel,
    Model,
    Scope,
} from "@matter/model";
import { ValidationPass } from "./ValidationPass.js";

const facts = new ValidationPass.Memo<Endpoint, EndpointFacts>();

const deviceTypeMemo = new ValidationPass.ModelMemo<number, DeviceTypeModel | undefined>();

/**
 * The facts about a server endpoint that a device type's requirements are judged against.
 *
 * Clusters are named by their model name, as {@link RequirementResolver.clusterOf} answers it. Features are feature
 * codes (e.g. `LT`), which is the name of the feature model {@link RequirementResolver.featureOf} resolves a feature
 * requirement to. Attributes, commands and events are the ones the behavior implements, as its initialization
 * recorded them in {@link Behaviors.elementsOf}; reading them requires the behavior to be initialized.
 *
 * Device types come from Descriptor's `DeviceTypeList` rather than the endpoint type, because
 * {@link DescriptorServer.addDeviceTypes} adds more at runtime. Before the endpoint's behaviors initialize they come
 * from the list the endpoint is configured with, or else its type, as Descriptor initializes a new list; a list
 * persisted from an earlier run is not read until then.
 *
 * Children are the endpoints whose behaviors have initialized and that are neither crashed nor closing, because only
 * those answer what their behaviors implement.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export class EndpointFacts {
    readonly #endpoint: Endpoint;
    readonly #pass: ValidationPass;
    #deviceTypes?: DeviceTypeModel[];
    #servers?: Map<string, ClusterBehavior.Type>;
    #clients?: Map<string, ClusterBehavior.Type>;
    #compositionScope?: Endpoint[];
    #compositionMembers?: Set<Endpoint>;

    /**
     * Facts about {@link endpoint}, with device types and clusters resolved in the model of {@link pass}. One pass
     * answers one instance per endpoint, which reads the endpoint at most once.
     */
    static of(endpoint: Endpoint, pass = new ValidationPass()) {
        return facts.get(pass, endpoint, () => new EndpointFacts(endpoint, pass));
    }

    /**
     * Whether {@link endpoint}'s behaviors have initialized and it is neither crashed nor closing, so its facts can be
     * read and it counts as a child of its owner.
     */
    static isReadable(endpoint: Endpoint) {
        if (!endpoint.lifecycle.isReady) {
            return false;
        }
        const { status } = endpoint.construction;
        return status === Lifecycle.Status.Active || status === Lifecycle.Status.Initializing;
    }

    private constructor(endpoint: Endpoint, pass: ValidationPass) {
        this.#endpoint = endpoint;
        this.#pass = pass;
    }

    get endpoint() {
        return this.#endpoint;
    }

    /**
     * The device types the endpoint's Descriptor lists that the model defines. A device type the model does not
     * define, such as a manufacturer-specific one, states no requirements that could be checked.
     */
    get deviceTypes(): DeviceTypeModel[] {
        if (this.#deviceTypes === undefined) {
            this.#deviceTypes = new Array<DeviceTypeModel>();
            for (const deviceType of deviceTypeIdsOf(this.#endpoint)) {
                const model = deviceTypeMemo.get(this.#pass.model, deviceType, () =>
                    this.#pass.model.deviceTypes(deviceType),
                );
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
        return new Set(this.#serverTypes.keys());
    }

    /**
     * Names of the client clusters on the endpoint.
     */
    get clients(): ReadonlySet<string> {
        return new Set(this.#clientTypes.keys());
    }

    /**
     * The name the endpoint's server or client cluster with {@link id} goes by in {@link servers} or {@link clients},
     * or undefined when the endpoint has no such cluster.
     */
    clusterName(side: "server" | "client", id: number): string | undefined {
        const types = side === "server" ? this.#serverTypes : this.#clientTypes;
        for (const [name, type] of types) {
            if (type.schema.id === id) {
                return name;
            }
        }
    }

    /**
     * Whether a server or client application cluster exists on the endpoint.
     */
    hasApplicationCluster(side: "server" | "client") {
        const types = side === "server" ? this.#serverTypes : this.#clientTypes;
        for (const type of types.values()) {
            if (type.schema.classification === ClusterElement.Classification.Application) {
                return true;
            }
        }
        return false;
    }

    /**
     * The codes of the features the endpoint's server {@link cluster} supports; empty when there is no such server.
     */
    features(cluster: string): ReadonlySet<string> {
        return new Set(this.#serverTypes.get(cluster)?.schema.supportedFeatures ?? []);
    }

    /**
     * Whether the endpoint's server {@link cluster} implements {@link element}, an attribute, command or event model
     * of that cluster.
     *
     * An event also needs operational support in the cluster's schema: mandatory under the enabled features, or
     * enabled explicitly.
     */
    supports(cluster: string, element: Model): boolean {
        const type = this.#serverTypes.get(cluster);
        if (type === undefined) {
            return false;
        }

        const elements = this.#endpoint.behaviors.elementsOf(type);
        if (element instanceof AttributeModel) {
            return elements.attributes.has(element.propertyName);
        }
        if (element instanceof CommandModel) {
            return elements.commands.has(element.propertyName);
        }
        if (element instanceof EventModel) {
            // A behavior derived with a feature turned off keeps the emitters its base had, so an emitter alone does
            // not mean the endpoint emits the event
            const event = type.schema.member(element.name, [ElementTag.Event]);
            return (
                elements.events.has(element.propertyName) &&
                event !== undefined &&
                Scope(type.schema).hasOperationalSupport(event)
            );
        }
        return false;
    }

    /**
     * The endpoint's direct children.
     */
    get children(): Endpoint[] {
        return this.#endpoint.hasParts ? [...this.#endpoint.parts].filter(EndpointFacts.isReadable) : [];
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
     * @see {@link MatterSpecification.v16.Core} § 9.2.3
     */
    get composesFullFamily() {
        return this.deviceTypes.some(deviceType => deviceType.effectiveComposition === EndpointComposition.FullFamily);
    }

    /**
     * The endpoints the endpoint's `PartsList` reaches within its node scope: its children for the tree pattern and
     * its descendants for the full-family pattern, never entering a node endpoint below it.
     */
    get compositionScope(): Endpoint[] {
        if (this.#compositionScope !== undefined) {
            return this.#compositionScope;
        }

        const scope = new Array<Endpoint>();
        const fullFamily = this.composesFullFamily;

        const visit = (endpoint: Endpoint) => {
            for (const child of EndpointFacts.of(endpoint, this.#pass).children) {
                if (EndpointFacts.of(child, this.#pass).isNodeEndpoint) {
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
    composes(endpoint: Endpoint) {
        this.#compositionMembers ??= new Set(this.compositionScope);
        return this.#compositionMembers.has(endpoint);
    }

    get #serverTypes() {
        if (this.#servers === undefined) {
            this.#servers = clusterTypesOf(Object.values(this.#endpoint.behaviors.supported));
        }
        return this.#servers;
    }

    get #clientTypes() {
        if (this.#clients === undefined) {
            this.#clients = clusterTypesOf(Object.values(this.#endpoint.type.clientClusters));
        }
        return this.#clients;
    }
}

function deviceTypeIdsOf(endpoint: Endpoint): number[] {
    if (endpoint.lifecycle.isReady) {
        return endpoint.stateOf(DescriptorServer).deviceTypeList.map(({ deviceType }) => deviceType);
    }

    const configured = new Array<number>();
    const list = endpoint.behaviors.defaultsFor(DescriptorServer)?.deviceTypeList;
    if (Array.isArray(list)) {
        for (const entry of list) {
            if (typeof entry === "object" && entry !== null && "deviceType" in entry) {
                const { deviceType } = entry;
                if (typeof deviceType === "number") {
                    configured.push(deviceType);
                }
            }
        }
    }
    return configured.length ? configured : [endpoint.type.deviceType];
}

function clusterTypesOf(types: Behavior.Type[]) {
    const clusters = new Map<string, ClusterBehavior.Type>();
    for (const type of types) {
        if (ClusterBehavior.isType(type)) {
            clusters.set(type.schema.name, type);
        }
    }
    return clusters;
}
