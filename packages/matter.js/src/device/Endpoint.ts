/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedAttributeClient, UnknownSupportedAttributeClient } from "#cluster/client/AttributeClient.js";
import { AtLeastOne, Diagnostic, ImplementationError, InternalError, NotImplementedError } from "@matter/general";
import { Behavior, Endpoint as ClientEndpoint } from "@matter/node";
import { ClusterClientObj, Val } from "@matter/protocol";
import { ClusterId, ClusterType, DeviceTypeId, EndpointNumber, getClusterNameById } from "@matter/types";
import { DeviceTypeDefinition } from "./DeviceTypes.js";

export interface EndpointOptions {
    endpointId?: EndpointNumber;
    uniqueStorageKey?: string;
}

export class Endpoint {
    private readonly clusterClients = new Map<ClusterId, ClusterClientObj>();
    private readonly childEndpoints = new Map<number, Endpoint>();
    number: EndpointNumber | undefined;
    uniqueStorageKey: string | undefined;
    name = "";
    private structureChangedCallback: () => void = () => {
        /** noop until officially set **/
    };
    #endpoint: ClientEndpoint;

    /**
     * Create a new Endpoint instance.
     *
     * @param endpoint The ClientEndpoint this Endpoint represents
     * @param deviceTypes One or multiple DeviceTypeDefinitions of the endpoint
     * @param options Options for the endpoint
     */
    constructor(
        endpoint: ClientEndpoint,
        protected deviceTypes: AtLeastOne<DeviceTypeDefinition>,
        options: EndpointOptions = {},
    ) {
        this.#endpoint = endpoint;
        this.setDeviceTypes(deviceTypes);

        if (options.endpointId !== undefined) {
            this.number = options.endpointId;
        }
        if (options.uniqueStorageKey !== undefined) {
            this.uniqueStorageKey = options.uniqueStorageKey;
        }
    }

    /**
     * Access to cached cluster state values using endpoint.state.clusterNameOrId.attributeNameOrId
     * Returns immutable cached attribute values from cluster clients
     */
    get state() {
        return this.#endpoint.state;
    }

    /**
     * Access to cluster commands using endpoint.commands.clusterNameOrId.commandName
     * Returns async functions that can be called to invoke commands on cluster clients
     */
    get commands() {
        return this.#endpoint.commands;
    }

    /**
     * Access to typed cached cluster state values
     * Returns immutable cached attribute values from cluster clients
     */
    stateOf<T extends Behavior.Type>(type: T) {
        return this.#endpoint.stateOf(type);
    }

    maybeStateOf<T extends Behavior.Type>(type: T) {
        return this.#endpoint.maybeStateOf(type);
    }

    /**
     * Update state values for a single behavior.
     *
     * The patch semantics used here are identical to {@link set}.
     *
     * This is the recommended way to set state for a single behavior because it provides proper type checking and
     * enforces the correctness of the used Behavior type including all enabled features.
     *
     * @param type the {@link Behavior} to patch
     * @param values the values to change
     */
    setStateOf<T extends Behavior.Type>(type: T, values: Behavior.PatchStateOf<T>): Promise<void>;

    /**
     * Update state values for a single behavior ID.
     *
     * The patch semantics used here are identical to {@link set}.
     *
     * Be aware that using a string type does not provide type checking and does not enforce the correctness of the used
     * Behavior type including all enabled features. Expect runtime errors if the provided values are not compatible
     * with the actual Behavior type.
     *
     * @param type the {@link Behavior} to patch
     * @param values the values to change
     */
    setStateOf(type: string, values: Val.Struct): Promise<void>;

    setStateOf(type: Behavior.Type | string, values: Val.Struct) {
        return this.#endpoint.setStateOf(<Behavior.Type>type, values);
    }

    /**
     * Access to typed cluster commands
     * Returns async functions that can be called to invoke commands on cluster clients
     */
    commandsOf<T extends Behavior.Type>(type: T) {
        return this.#endpoint.commandsOf(type);
    }

    get behaviors() {
        return this.#endpoint.behaviors;
    }

    get endpoint() {
        return this.#endpoint;
    }

    /** Get all child endpoints aka parts */
    get parts() {
        return this.childEndpoints;
    }

    get deviceType(): DeviceTypeId {
        return this.deviceTypes[0].code;
    }

    setStructureChangedCallback(callback: () => void) {
        this.structureChangedCallback = callback;
        for (const endpoint of this.childEndpoints.values()) {
            endpoint.setStructureChangedCallback(callback);
        }
    }

    removeFromStructure() {
        this.structureChangedCallback = () => {
            /** noop **/
        };
        for (const endpoint of this.childEndpoints.values()) {
            endpoint.removeFromStructure();
        }
    }

    close() {
        // noop — server cleanup removed
    }

    getNumber() {
        if (this.number === undefined) {
            throw new InternalError("Endpoint has not been assigned yet");
        }
        return this.number;
    }

    addClusterClient(cluster: ClusterClientObj) {
        this.clusterClients.set(cluster.id, cluster);
    }

    getClusterClient<const N extends ClusterType.Concrete>(cluster: N): ClusterClientObj<N["Typing"]> | undefined;
    getClusterClient(cluster: ClusterType.Concrete): ClusterClientObj | undefined {
        return this.clusterClients.get(cluster.id) as ClusterClientObj;
    }

    getClusterClientById(clusterId: ClusterId): ClusterClientObj | undefined {
        return this.clusterClients.get(clusterId);
    }

    hasClusterClient(cluster: ClusterType.Concrete): boolean {
        return this.clusterClients.has(cluster.id);
    }

    getDeviceTypes(): AtLeastOne<DeviceTypeDefinition> {
        return this.deviceTypes;
    }

    setDeviceTypes(deviceTypes: AtLeastOne<DeviceTypeDefinition>): void {
        // Remove duplicates, for now we ignore that there could be different revisions
        const deviceTypeList = new Map<number, DeviceTypeDefinition>();
        deviceTypes.forEach(deviceType => deviceTypeList.set(deviceType.code, deviceType));
        this.deviceTypes = Array.from(deviceTypeList.values()) as AtLeastOne<DeviceTypeDefinition>;
        this.name = deviceTypes[0].name;
    }

    addChildEndpoint(endpoint: Endpoint): void {
        if (!(endpoint instanceof Endpoint)) {
            throw new InternalError("Only supported EndpointInterface implementation is Endpoint");
        }
        const id = endpoint.getNumber();

        if (this.childEndpoints.has(id)) {
            throw new ImplementationError(`Endpoint with id ${id} already exists as child from ${this.number}.`);
        }

        this.childEndpoints.set(id, endpoint);
        endpoint.setStructureChangedCallback(this.structureChangedCallback);
        this.structureChangedCallback(); // Inform parent about structure change
    }

    getChildEndpoint(id: EndpointNumber): Endpoint | undefined {
        return this.childEndpoints.get(id);
    }

    getChildEndpoints(): Endpoint[] {
        return Array.from(this.childEndpoints.values());
    }

    removeChildEndpoint(endpoint: Endpoint): void {
        const id = endpoint.getNumber();
        const knownEndpoint = this.childEndpoints.get(id);
        if (knownEndpoint === undefined) {
            throw new ImplementationError(`Provided endpoint for deletion does not exist as child endpoint.`);
        }
        this.childEndpoints.delete(id);
        endpoint.removeFromStructure();
        this.structureChangedCallback(); // Inform parent about structure change
    }

    determineUniqueID(): string | undefined {
        // if the options in constructor contained a custom uniqueStorageKey, use this
        if (this.uniqueStorageKey !== undefined) {
            return `custom_${this.uniqueStorageKey}`;
        }
    }

    public verifyRequiredClusters(): void {
        this.deviceTypes.forEach(deviceType => {
            if (this.clusterClients.size > 0) {
                // TODO remove once supported
                throw new NotImplementedError(`Devices with client clusters are not supported yet`);
            }
            deviceType.requiredClientClusters?.forEach(clusterId => {
                const clusterName = getClusterNameById(clusterId);
                if (!this.clusterClients.has(clusterId)) {
                    throw new ImplementationError(
                        `Device type ${deviceType.name} (0x${deviceType.code.toString(
                            16,
                        )}) requires cluster client ${clusterName}(0x${clusterId.toString(
                            16,
                        )}) but it is not present on endpoint ${this.number}`,
                    );
                }
            });
        });
    }

    getAllClusterClients(): ClusterClientObj[] {
        return Array.from(this.clusterClients.values());
    }

    /**
     * Hierarchical diagnostics of endpoint and children.
     */
    get [Diagnostic.value](): unknown[] {
        return [
            Diagnostic.strong(this.name),
            Diagnostic.dict({
                "endpoint#": this.number,
                type: this.deviceTypes.map(
                    ({ name, code, revision }) => `${name} (0x${code.toString(16)}, ${revision})`,
                ),
            }),
            Diagnostic.list([...this.#clusterDiagnostics(), ...this.getChildEndpoints()]),
        ];
    }

    #clusterDiagnostics(): unknown[] {
        const clusterDiagnostics = new Array<unknown>();

        const clients = this.getAllClusterClients();
        if (clients.length) {
            clusterDiagnostics.push([
                Diagnostic.strong("clients"),
                Diagnostic.list(clients.map(client => this.#clusterClientDiagnostics(client))),
            ]);
        }

        const childs = this.getChildEndpoints();
        if (childs.length) {
            clusterDiagnostics.push([Diagnostic.strong("childs"), Diagnostic.list([])]);
        }

        return clusterDiagnostics;
    }

    #clusterClientDiagnostics(client: ClusterClientObj) {
        const result = [
            Diagnostic.strong(client.name),
            Diagnostic.dict({
                id: Diagnostic.hex(client.id),
                rev: client.revision,
                flags: Diagnostic.asFlags({
                    unknown: client.isUnknown,
                }),
            }),
        ];
        const elementDiagnostic = Array<unknown>();

        const features = client.supportedFeatures as Record<string, boolean>;
        const supportedFeatures = new Array<string>();
        for (const featureName in features) {
            if (features[featureName] === true) supportedFeatures.push(featureName);
        }
        if (supportedFeatures.length) {
            elementDiagnostic.push([Diagnostic.strong("features"), supportedFeatures]);
        }

        if (Object.keys(client.attributes).length) {
            const clusterData = new Array<unknown>();
            for (const attributeName in client.attributes) {
                if (attributeName.match(/^\d+$/)) continue;
                const attribute = client.attributes[attributeName];
                if (attribute === undefined || !(attribute instanceof SupportedAttributeClient)) continue;

                clusterData.push([
                    attribute.name,
                    Diagnostic.dict({
                        id: Diagnostic.hex(attribute.id),
                        val: attribute.getLocal(),
                        flags: Diagnostic.asFlags({
                            unknown: attribute instanceof UnknownSupportedAttributeClient,
                            fabricScoped: attribute.fabricScoped,
                        }),
                    }),
                ]);
            }
            if (clusterData.length) {
                elementDiagnostic.push([Diagnostic.strong("attributes"), Diagnostic.list(clusterData)]);
            }
        }

        if (Object.keys(client.commands).length) {
            const clusterData = new Array<unknown>();
            for (const commandName in client.commands) {
                if (commandName.match(/^\d+$/)) continue;
                const command = client.commands[commandName];
                if (command === undefined || !client.isCommandSupportedByName(commandName)) continue;

                clusterData.push([commandName]);
            }
            if (clusterData.length) {
                elementDiagnostic.push([Diagnostic.strong("commands"), Diagnostic.list(clusterData)]);
            }
        }

        if (Object.keys(client.events).length) {
            const clusterData = new Array<unknown>();
            for (const eventName in client.events) {
                if (eventName.match(/^\d+$/)) continue;
                const event = client.events[eventName];
                if (event === undefined) continue;

                clusterData.push([
                    event.name,
                    Diagnostic.dict({
                        id: Diagnostic.hex(event.id),
                    }),
                ]);
            }
            if (clusterData.length) {
                elementDiagnostic.push([Diagnostic.strong("events"), Diagnostic.list(clusterData)]);
            }
        }

        if (elementDiagnostic.length) {
            result.push(Diagnostic.list(elementDiagnostic));
        }

        return result;
    }
}
