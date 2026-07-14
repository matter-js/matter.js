/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedAttributeClient, UnknownSupportedAttributeClient } from "#cluster/client/AttributeClient.js";
import { ClusterClientObj } from "#cluster/client/ClusterClientTypes.js";
import {
    AtLeastOne,
    Diagnostic,
    Immutable,
    ImplementationError,
    InternalError,
    NotImplementedError,
    Observable,
} from "@matter/general";
import { ClusterModel, Matter } from "@matter/model";
import {
    Behavior,
    Endpoint as ClientEndpoint,
    ClusterBehavior,
    Commands,
    type GlobalAttributeState,
} from "@matter/node";
import { Val } from "@matter/protocol";
import { ClusterId, ClusterType, DeviceTypeId, EndpointNumber, getClusterNameById } from "@matter/types";
import { DeviceTypeDefinition } from "./DeviceTypes.js";

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export interface EndpointOptions {
    endpointId?: EndpointNumber;
    uniqueStorageKey?: string;
}

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
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
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
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
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get state() {
        return this.#endpoint.state;
    }

    /**
     * Access to cluster commands using endpoint.commands.clusterNameOrId.commandName
     * Returns async functions that can be called to invoke commands on cluster clients
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get commands() {
        return this.#endpoint.commands;
    }

    /**
     * Access cached state for a specific behavior ID.
     *
     * Be aware that using a string type does not provide type checking and does not enforce the correctness of the used
     * Behavior type including all enabled features. Because of this the returned state is typed as a plain string
     * indexed record (Val.Struct). Please ensure to have proper checks in place when using this method with string type.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    stateOf(type: string): Immutable<Val.Struct>;

    /**
     * Access cached state for a specific behavior.
     *
     * This is the recommended way to access state for a specific behavior because it provides proper type checking
     * and enforces the correctness of the used Behavior type including all enabled features.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    stateOf<T extends Behavior.Type>(type: T): Immutable<Behavior.StateOf<T>>;

    stateOf(type: Behavior.Type | string) {
        return this.#endpoint.stateOf(type as any);
    }

    /**
     * Version of {@link stateOf} that returns undefined instead of throwing if the requested behavior is unsupported.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    maybeStateOf(type: string): Immutable<Val.Struct> | undefined;

    /**
     * Version of {@link stateOf} that returns undefined instead of throwing if the requested behavior is unsupported.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    maybeStateOf<T extends Behavior.Type>(type: T): Immutable<Behavior.StateOf<T>> | undefined;

    maybeStateOf(type: Behavior.Type | string) {
        return this.#endpoint.maybeStateOf(type as any);
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
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
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
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    setStateOf(type: string, values: Val.Struct): Promise<void>;

    setStateOf(type: Behavior.Type | string, values: Val.Struct) {
        return this.#endpoint.setStateOf(type as Behavior.Type, values);
    }

    /**
     * Cluster commands for a behavior id (untyped: each command is `Commands.Command`).
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    commandsOf(type: string): Record<string, Commands.Command>;

    /**
     * Typed variant of {@link commandsOf}; preserves the behavior's command interface.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    commandsOf<T extends Behavior.Type>(type: T): Commands.OfBehavior<T>;

    commandsOf(type: Behavior.Type | string): unknown {
        return this.#endpoint.commandsOf(type as Behavior.Type);
    }

    /**
     * Activated cluster features for a behavior id (untyped).
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    featuresOf(type: string): Immutable<Record<string, boolean>>;

    /**
     * Typed variant of {@link featuresOf}; preserves the cluster's per-feature flag type.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    featuresOf<T extends ClusterBehavior.Type>(type: T): T["features"];

    featuresOf(type: ClusterBehavior.Type | string) {
        return this.#endpoint.featuresOf(type as ClusterBehavior.Type);
    }

    /**
     * {@link featuresOf} variant returning undefined for unknown or non-cluster behaviors.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    maybeFeaturesOf(type: string): Immutable<Record<string, boolean>> | undefined;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    maybeFeaturesOf<T extends ClusterBehavior.Type>(type: T): T["features"] | undefined;
    maybeFeaturesOf(type: ClusterBehavior.Type | string) {
        return this.#endpoint.maybeFeaturesOf(type as ClusterBehavior.Type);
    }

    /**
     * Global cluster attribute state (clusterRevision, featureMap, attributeList, ...) for a behavior id.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    globalsOf(type: string): Immutable<GlobalAttributeState>;

    /**
     * Typed variant of {@link globalsOf}; narrows `featureMap` to the cluster's per-feature flag type.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    globalsOf<T extends ClusterBehavior.Type>(
        type: T,
    ): Immutable<Omit<GlobalAttributeState, "featureMap"> & { featureMap: T["features"] }>;

    globalsOf(type: ClusterBehavior.Type | string) {
        return this.#endpoint.globalsOf(type as ClusterBehavior.Type);
    }

    /**
     * {@link globalsOf} variant returning undefined for unknown or non-cluster behaviors.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    maybeGlobalsOf(type: string): Immutable<GlobalAttributeState> | undefined;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    maybeGlobalsOf<T extends ClusterBehavior.Type>(
        type: T,
    ): Immutable<Omit<GlobalAttributeState, "featureMap"> & { featureMap: T["features"] }> | undefined;
    maybeGlobalsOf(type: ClusterBehavior.Type | string) {
        return this.#endpoint.maybeGlobalsOf(type as ClusterBehavior.Type);
    }

    /**
     * Read selected behavior state via the underlying client endpoint.
     *
     * @see {@link ClientEndpoint.get}
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get(): Promise<unknown>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get(selector: object | undefined, options?: ClientEndpoint.GetOptions): Promise<unknown>;
    get(selector?: object, options?: ClientEndpoint.GetOptions): Promise<unknown> {
        return this.#endpoint.get(selector as never, options);
    }

    /**
     * Read state for a single behavior via the underlying client endpoint.
     *
     * @see {@link ClientEndpoint.getStateOf}
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getStateOf<B extends Behavior.Type>(
        type: B,
        selector?: true,
        options?: ClientEndpoint.GetOptions,
    ): Promise<Behavior.StateOf<B>>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getStateOf<B extends Behavior.Type, K extends keyof Behavior.StateOf<B>>(
        type: B,
        selector: readonly K[],
        options?: ClientEndpoint.GetOptions,
    ): Promise<{ readonly [P in K]?: Behavior.StateOf<B>[P] }>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getStateOf(type: string, selector?: readonly string[], options?: ClientEndpoint.GetOptions): Promise<Val.Struct>;
    getStateOf(
        type: Behavior.Type | string,
        selector?: true | readonly (string | number | symbol)[],
        options?: ClientEndpoint.GetOptions,
    ): Promise<unknown> {
        return this.#endpoint.getStateOf(type as Behavior.Type, selector as never, options);
    }

    /**
     * Events for a specific behavior ID.
     *
     * Be aware that using a string type does not provide type checking and does not enforce the correctness of the used
     * Behavior type including all enabled features. Because of this each event is typed as Observable | undefined.
     * Please ensure to have proper checks in place when using this method with string type.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    eventsOf(type: string): Immutable<Record<string, Observable | undefined>>;

    /**
     * Events for a specific behavior.
     *
     * This is the recommended way to access events for a specific behavior because it provides proper type checking
     * and enforces the correctness of the used Behavior type including all enabled features.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    eventsOf<T extends Behavior.Type>(type: T): Behavior.EventsOf<T>;

    eventsOf(type: Behavior.Type | string): unknown {
        return this.#endpoint.eventsOf(type as any);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get behaviors() {
        return this.#endpoint.behaviors;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get endpoint() {
        return this.#endpoint;
    }

    /**
     * Get all child endpoints aka parts
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get parts() {
        return this.childEndpoints;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get deviceType(): DeviceTypeId {
        return this.deviceTypes[0].code;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    setStructureChangedCallback(callback: () => void) {
        this.structureChangedCallback = callback;
        for (const endpoint of this.childEndpoints.values()) {
            endpoint.setStructureChangedCallback(callback);
        }
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    removeFromStructure() {
        this.structureChangedCallback = () => {
            /** noop **/
        };
        for (const endpoint of this.childEndpoints.values()) {
            endpoint.removeFromStructure();
        }
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    close() {
        // noop — server cleanup removed
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getNumber() {
        if (this.number === undefined) {
            throw new InternalError("Endpoint has not been assigned yet");
        }
        return this.number;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    addClusterClient(cluster: ClusterClientObj) {
        this.clusterClients.set(cluster.id, cluster);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getClusterClient<const N extends ClusterType.Concrete>(cluster: N): ClusterClientObj<N["Typing"]> | undefined;
    getClusterClient(cluster: ClusterType.Concrete): ClusterClientObj | undefined {
        return this.clusterClients.get(cluster.id) as ClusterClientObj;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getClusterClientById(clusterId: ClusterId): ClusterClientObj | undefined {
        return this.clusterClients.get(clusterId);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    hasClusterClient(cluster: ClusterType.Concrete): boolean {
        return this.clusterClients.has(cluster.id);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getDeviceTypes(): AtLeastOne<DeviceTypeDefinition> {
        return this.deviceTypes;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    setDeviceTypes(deviceTypes: AtLeastOne<DeviceTypeDefinition>): void {
        // Remove duplicates, for now we ignore that there could be different revisions
        const deviceTypeList = new Map<number, DeviceTypeDefinition>();
        deviceTypes.forEach(deviceType => deviceTypeList.set(deviceType.code, deviceType));
        this.deviceTypes = Array.from(deviceTypeList.values()) as AtLeastOne<DeviceTypeDefinition>;
        this.name = deviceTypes[0].name;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
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

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getChildEndpoint(id: EndpointNumber): Endpoint | undefined {
        return this.childEndpoints.get(id);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getChildEndpoints(): Endpoint[] {
        return Array.from(this.childEndpoints.values());
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
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

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    determineUniqueID(): string | undefined {
        // if the options in constructor contained a custom uniqueStorageKey, use this
        if (this.uniqueStorageKey !== undefined) {
            return `custom_${this.uniqueStorageKey}`;
        }
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
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

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getAllClusterClients(): ClusterClientObj[] {
        return Array.from(this.clusterClients.values());
    }

    /**
     * Hierarchical diagnostics of endpoint and children.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
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

        const features = client.supportedFeatures;
        const supportedFeatures = new Array<string>();
        for (const featureName in features) {
            if (features[featureName] === true) supportedFeatures.push(featureName);
        }
        if (supportedFeatures.length) {
            const clusterModel = Matter.get(ClusterModel, client.id);
            let displayFeatures: string[];
            if (clusterModel) {
                const titleMap = new Map<string, string>();
                for (const f of clusterModel.features) {
                    const title = f.title ?? f.name;
                    titleMap.set(f.name, title);
                    if (f.title) {
                        titleMap.set(f.title.charAt(0).toLowerCase() + f.title.slice(1), title);
                    }
                }
                displayFeatures = supportedFeatures.map(name => titleMap.get(name) ?? name);
            } else {
                displayFeatures = supportedFeatures;
            }
            elementDiagnostic.push([Diagnostic.strong("features"), displayFeatures]);
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
