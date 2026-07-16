/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Include this first to auto-register Crypto, Network and Time Node.js implementations
import {
    Duration,
    Environment,
    Filesystem,
    ImplementationError,
    InternalError,
    Logger,
    ObserverGroup,
    Seconds,
    StorageContext,
    StorageManager,
    StorageService,
} from "@matter/general";
import {
    ClientNode,
    ControllerBehavior,
    DclBehavior,
    Endpoint,
    NetworkClient,
    ServerNode,
    SoftwareUpdateManager,
} from "@matter/node";
import { OtaProviderEndpoint } from "@matter/node/endpoints/ota-provider";
import { Ble, Fabric, FabricAuthority } from "@matter/protocol";
import { NodeId } from "@matter/types";
import { join } from "node:path";

const logger = Logger.get("Node");

const ADMIN_FABRIC_LABEL = "matter.js Shell";

/**
 * Options for {@link MatterNode.connectAndGetNodes}, expressed in the legacy vocabulary and mapped onto
 * {@link NetworkClient} state per docs/MIGRATION_CONTROLLER_018.md.
 */
export interface ConnectClientNodeOptions {
    /** Maps to {@link NetworkClient.State.isDisabled} (inverse). `false` keeps the node offline instead of connecting. */
    autoConnect?: boolean;
    /** Maps to {@link NetworkClient.State.autoSubscribe}. */
    autoSubscribe?: boolean;
    /** Maps to {@link NetworkClient.State.defaultSubscription}.minIntervalFloor. */
    subscribeMinIntervalFloorSeconds?: number;
    /** Maps to {@link NetworkClient.State.defaultSubscription}.maxIntervalCeiling. */
    subscribeMaxIntervalCeilingSeconds?: number;
}

export class MatterNode {
    #storageLocation?: string;
    #storageManager?: StorageManager;
    #storageContext?: StorageContext;
    readonly #environment: Environment;
    #node?: ServerNode;
    #fabric?: Fabric;
    #started = false;
    readonly #nodeNum: number;
    readonly #netInterface?: string;
    #dclFetchTestCertificates = false;
    #allowTestOtaImages = false;
    #transportPreference?: "tcp" | "udp";
    #observers?: ObserverGroup;

    constructor(nodeNum: number, netInterface?: string) {
        this.#environment = Environment.default;
        this.#environment.runtime.add(this);
        this.#nodeNum = nodeNum;
        this.#netInterface = netInterface;
    }

    get storageLocation() {
        return this.#storageLocation;
    }

    get environment() {
        return this.#environment;
    }

    get node(): ServerNode {
        if (this.#node === undefined) {
            throw new ImplementationError("Controller node not initialized. Call initialize() first.");
        }
        return this.#node;
    }

    /**
     * The OTA provider endpoint on the controller node. The cast is unavoidable: `endpoints.for(id)` resolves by
     * runtime id lookup, so it cannot statically know which endpoint type lives at "ota-provider".
     */
    get otaProviderEndpoint(): Endpoint<OtaProviderEndpoint> {
        return this.node.endpoints.for("ota-provider") as Endpoint<OtaProviderEndpoint>;
    }

    async otaService() {
        const service = await this.node.act(agent => agent.get(DclBehavior).otaUpdateService);
        await service.construction;
        return service;
    }

    async certificateService() {
        const service = await this.node.act(agent => agent.get(DclBehavior).certificateService);
        await service.construction;
        return service;
    }

    async vendorInfoService() {
        const service = await this.node.act(agent => agent.get(DclBehavior).vendorInfoService);
        await service.construction;
        return service;
    }

    async initialize(resetStorage: boolean) {
        if (this.#netInterface !== undefined) {
            this.#environment.vars.set("mdns.networkinterface", this.#netInterface);
        }

        const id = `shell-${this.#nodeNum.toString()}`;

        // Scope the controller node's services (storage, mDNS) under its id, mirroring the legacy controller wrapper.
        const nodeEnvironment = new Environment(id, this.#environment);

        // Open storage up front so persisted settings are available before the controller node is built.
        this.#storageManager = await nodeEnvironment.get(StorageService).open(id);
        this.#storageContext = this.#storageManager.createContext("Node");

        this.#dclFetchTestCertificates = await this.#storageContext.get<boolean>("DclFetchTestCertificates", false);
        this.#allowTestOtaImages = await this.#storageContext.get<boolean>("AllowTestOtaImages", false);
        const storedPref = await this.#storageContext.get<string>("TransportPreference", "");
        this.#transportPreference = storedPref === "tcp" || storedPref === "udp" ? storedPref : undefined;

        const ble = (nodeEnvironment.maybeGet(Ble) ?? Environment.default.maybeGet(Ble)) !== undefined;

        this.#node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
            environment: nodeEnvironment,
            id,
            network: {
                ble: false,
                tcp: true,
                transportPreference: this.#transportPreference,
            },
            basicInformation: {
                productName: ADMIN_FABRIC_LABEL,
            },
            controller: {
                adminFabricLabel: ADMIN_FABRIC_LABEL,
                ble,
            },
            commissioning: {
                enabled: false, // The controller node is never commissionable itself.
            },
            subscriptions: {
                persistenceEnabled: false, // Subscription persistence is a device feature, not a controller one.
            },
        });

        // Pulls in SoftwareUpdateManager (and thereby DclBehavior on the root node) for OTA provider support.
        await this.#node.add(new Endpoint(OtaProviderEndpoint, { id: "ota-provider" }));

        if (nodeEnvironment.has(Filesystem)) {
            this.#storageLocation = join(nodeEnvironment.get(Filesystem).path, id);
        }

        if (resetStorage) {
            await this.#node.erase();
        }
    }

    get Store() {
        if (!this.#storageContext) {
            throw new ImplementationError("Storage uninitialized");
        }
        return this.#storageContext;
    }

    async close() {
        try {
            await this.#node?.close();
        } finally {
            this.#observers?.close();
            await this.#storageManager?.close();
        }
    }

    async start() {
        if (this.#started) {
            return;
        }
        logger.info(`matter.js shell controller started for node ${this.#nodeNum}`);

        const node = this.node;

        // Reuse the existing controller fabric (matched by CA) or create one, rotating the NOC once per runtime.
        const fabricAuthority = await node.env.load(FabricAuthority);
        this.#fabric = await fabricAuthority.defaultFabric({ adminFabricLabel: ADMIN_FABRIC_LABEL });

        await node.start();

        await node.setStateOf(DclBehavior, {
            fetchTestCertificates: this.#dclFetchTestCertificates,
        });

        await this.otaProviderEndpoint.setStateOf(SoftwareUpdateManager, {
            allowTestOtaImages: this.#allowTestOtaImages,
        });

        if (await this.Store.has("ControllerFabricLabel")) {
            await this.#fabric.setLabel(await this.Store.get<string>("ControllerFabricLabel", ADMIN_FABRIC_LABEL));
        }

        this.#observers = this.#observers ?? new ObserverGroup(this.#environment.runtime);
        const updateManagerEvents = this.otaProviderEndpoint.eventsOf(SoftwareUpdateManager);
        this.#observers.on(updateManagerEvents.updateAvailable, (peer, details) => {
            logger.info(`Update available for peer`, peer, `:`, details);
        });
        this.#observers.on(updateManagerEvents.updateDone, peer => {
            logger.info(`Update done for peer`, peer);
        });
        this.#observers.on(updateManagerEvents.updateFailed, peer => {
            logger.info(`Update failed for peer`, peer);
        });

        this.#started = true;
    }

    /**
     * Returns the {@link ClientNode}s for the commissioned peers, connecting them (unless `autoConnect: false`).
     * Nodes connect asynchronously; await `node.lifecycle.seeded` (guarded by `node.lifecycle.isSeeded`) before
     * relying on the endpoint structure.
     */
    async connectAndGetNodes(nodeIdStr?: string, connectOptions?: ConnectClientNodeOptions): Promise<ClientNode[]> {
        await this.start();

        const commissioned = this.node.peers.commissioned;

        let nodes: ClientNode[];
        if (nodeIdStr !== undefined) {
            const nodeId = NodeId(BigInt(nodeIdStr));
            const node = commissioned.find(peer => peer.peerAddress?.nodeId === nodeId);
            if (node === undefined) {
                throw new ImplementationError(`Node ${nodeId} is not commissioned!`);
            }
            nodes = [node];
        } else {
            nodes = commissioned;
        }

        for (const node of nodes) {
            await this.#applyClientNodeNetworkOptions(node, connectOptions);
            if (connectOptions?.autoConnect === false) {
                continue;
            }
            if (node.stateOf(NetworkClient).isDisabled) {
                await node.enable();
            } else {
                await node.start();
            }
        }

        return nodes;
    }

    async #applyClientNodeNetworkOptions(node: ClientNode, options?: ConnectClientNodeOptions) {
        if (options === undefined) {
            return;
        }

        // disable() drops any live subscription before persisting isDisabled; a bare setStateOf would leave a
        // still-connected node reporting Connected while persisted disabled.  Enabling is handled by the caller's
        // enable()/start() loop.
        if (options.autoConnect === false) {
            await node.disable();
        }
        if (options.autoSubscribe !== undefined) {
            await node.setStateOf(NetworkClient, { autoSubscribe: options.autoSubscribe });
        }

        const { subscribeMinIntervalFloorSeconds, subscribeMaxIntervalCeilingSeconds } = options;
        if (subscribeMinIntervalFloorSeconds !== undefined || subscribeMaxIntervalCeilingSeconds !== undefined) {
            const defaultSubscription: { minIntervalFloor?: Duration; maxIntervalCeiling?: Duration } = {};
            if (subscribeMinIntervalFloorSeconds !== undefined) {
                defaultSubscription.minIntervalFloor = Seconds(subscribeMinIntervalFloorSeconds);
            }
            if (subscribeMaxIntervalCeilingSeconds !== undefined) {
                defaultSubscription.maxIntervalCeiling = Seconds(subscribeMaxIntervalCeilingSeconds);
            }
            await node.setStateOf(NetworkClient, { defaultSubscription });
        }
    }

    /**
     * Iterates the endpoints of each {@link ClientNode}, including the root endpoint (number 0); pass
     * {@link endpointIds} to restrict iteration.
     */
    async iterateNodeDevices(
        nodes: ClientNode[],
        callback: (device: Endpoint, node: ClientNode) => Promise<void>,
        endpointIds?: number[],
    ): Promise<void> {
        for (const node of nodes) {
            for (const device of node.endpoints) {
                if (endpointIds !== undefined && !endpointIds.includes(device.number)) {
                    continue;
                }
                await callback(device, node);
            }
        }
    }

    /**
     * Updates the controller's admin fabric label on the local fabric. Propagation to already-connected peers is not
     * reproduced and moves to the node-management layer per docs/MIGRATION_CONTROLLER_018.md.
     * MIGRATION-GAP: updatefabriclabel-note.
     */
    async updateFabricLabel(label: string) {
        await this.start();
        if (this.#fabric === undefined) {
            throw new InternalError("Controller fabric not initialized");
        }
        await this.#fabric.setLabel(label);
    }
}
