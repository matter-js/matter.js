/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Include this first to auto-register Crypto, Network and Time Node.js implementations
import {
    Diagnostic,
    Duration,
    Environment,
    Filesystem,
    ImplementationError,
    Logger,
    ObserverGroup,
    Seconds,
    StorageContext,
    StorageManager,
    StorageService,
} from "@matter/general";
import {
    Endpoint as ClientEndpoint,
    ClientNode,
    DclBehavior,
    NetworkClient,
    ServerNode,
    SoftwareUpdateManager,
} from "@matter/node";
import { NodeId } from "@matter/types";
import { CommissioningController } from "@project-chip/matter.js";
import {
    CommissioningControllerNodeOptions,
    Endpoint,
    NodeStateInformation,
    PairedNode,
} from "@project-chip/matter.js/device";
import { join } from "node:path";

/**
 * The shell's default per-node diagnostic callbacks — state-information, attribute-change and event logging. Applied by
 * default to every {@link MatterNode.connectAndGetNodes} connection so any command that reaches a node (not just
 * `nodes connect`) gets the same logging regardless of which command touched the node first.
 */
export function createDiagnosticCallbacks(): Partial<CommissioningControllerNodeOptions> {
    return {
        attributeChangedCallback: (peerNodeId, { path: { nodeId, clusterId, endpointId, attributeName }, value }) =>
            console.log(
                `attributeChangedCallback ${peerNodeId}: Attribute ${nodeId}/${endpointId}/${clusterId}/${attributeName} changed to ${Diagnostic.json(
                    value,
                )}`,
            ),
        eventTriggeredCallback: (peerNodeId, { path: { nodeId, clusterId, endpointId, eventName }, events }) =>
            console.log(
                `eventTriggeredCallback ${peerNodeId}: Event ${nodeId}/${endpointId}/${clusterId}/${eventName} triggered with ${Diagnostic.json(
                    events,
                )}`,
            ),
        stateInformationCallback: (peerNodeId, info) => {
            switch (info) {
                case NodeStateInformation.Connected:
                    console.log(`stateInformationCallback Node ${peerNodeId} connected`);
                    break;
                case NodeStateInformation.Disconnected:
                    console.log(`stateInformationCallback Node ${peerNodeId} disconnected`);
                    break;
                case NodeStateInformation.Reconnecting:
                    console.log(`stateInformationCallback Node ${peerNodeId} reconnecting`);
                    break;
                case NodeStateInformation.WaitingForDeviceDiscovery:
                    console.log(
                        `stateInformationCallback Node ${peerNodeId} waiting that device gets discovered again`,
                    );
                    break;
                case NodeStateInformation.StructureChanged:
                    console.log(`stateInformationCallback Node ${peerNodeId} structure changed`);
                    break;
                case NodeStateInformation.Decommissioned:
                    console.log(`stateInformationCallback Node ${peerNodeId} decommissioned`);
                    break;
            }
        },
    };
}

const logger = Logger.get("Node");

/**
 * Options for {@link MatterNode.connectAndGetClientNodes}, expressed in the legacy vocabulary and mapped onto
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
    commissioningController?: CommissioningController;
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
        if (this.commissioningController === undefined) {
            throw new Error("CommissioningController not initialized. Start first");
        }
        return this.commissioningController.node;
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
        /**
         * Initialize the storage system.
         *
         * The Matter server then also uses the storage manager, so this code block in general is required,
         * but you can choose a different storage backend as long as it implements the required API.
         */

        if (this.#environment) {
            if (this.#netInterface !== undefined) {
                this.#environment.vars.set("mdns.networkinterface", this.#netInterface);
            }

            const id = `shell-${this.#nodeNum.toString()}`;

            // Open storage up front so persisted settings can flow into the CommissioningController constructor.
            this.#storageManager = await this.#environment.get(StorageService).open(id);
            this.#storageContext = this.#storageManager.createContext("Node");

            this.#dclFetchTestCertificates = await this.#storageContext.get<boolean>("DclFetchTestCertificates", false);
            this.#allowTestOtaImages = await this.#storageContext.get<boolean>("AllowTestOtaImages", false);
            const storedPref = await this.#storageContext.get<string>("TransportPreference", "");
            this.#transportPreference = storedPref === "tcp" || storedPref === "udp" ? storedPref : undefined;

            // Build up the "Not-so-legacy" Controller
            this.commissioningController = new CommissioningController({
                environment: {
                    environment: this.#environment,
                    id,
                },
                autoConnect: false,
                adminFabricLabel: "matter.js Shell",
                enableOtaProvider: true,
                tcp: true,
                transportPreference: this.#transportPreference,
                basicInformation: {
                    productName: "matter.js Shell",
                },
            });

            const env = this.commissioningController.env;
            if (env.has(Filesystem)) {
                this.#storageLocation = join(env.get(Filesystem).path, id);
            }

            if (resetStorage) {
                await this.commissioningController.node.erase();
            }
        } else {
            console.log(
                "Legacy support was removed in Matter.js 0.13. Please downgrade or migrate the storage manually",
            );
            process.exit(1);
        }
    }

    get Store() {
        if (!this.#storageContext) {
            throw new Error("Storage uninitialized");
        }
        return this.#storageContext;
    }

    async close() {
        try {
            await this.commissioningController?.close();
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

        if (this.commissioningController !== undefined) {
            await this.commissioningController.start();

            await this.commissioningController.node.setStateOf(DclBehavior, {
                fetchTestCertificates: this.#dclFetchTestCertificates,
            });

            await this.commissioningController.otaProvider.setStateOf(SoftwareUpdateManager, {
                allowTestOtaImages: this.#allowTestOtaImages,
            });

            if (await this.Store.has("ControllerFabricLabel")) {
                await this.commissioningController.updateFabricLabel(
                    await this.Store.get<string>("ControllerFabricLabel", "matter.js Shell"),
                );
            }
        } else {
            throw new Error("No controller initialized");
        }

        this.#observers = this.#observers ?? new ObserverGroup(this.#environment.runtime);
        const updateManagerEvents = this.commissioningController.otaProvider.eventsOf(SoftwareUpdateManager);
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

    async connectAndGetNodes(nodeIdStr?: string, connectOptions?: CommissioningControllerNodeOptions) {
        await this.start();
        const nodeId = nodeIdStr !== undefined ? NodeId(BigInt(nodeIdStr)) : undefined;

        if (this.commissioningController === undefined) {
            throw new Error("CommissioningController not initialized");
        }

        // Default the shell's diagnostic callbacks so a node reached via any command (icd, cluster-*, subscribe, …),
        // not just `nodes connect`, gets the same logging. A caller-supplied option still wins.
        const options = { ...createDiagnosticCallbacks(), ...connectOptions };

        if (nodeId === undefined) {
            return await this.commissioningController.connect(options);
        }

        const node = await this.commissioningController.connectNode(nodeId, {
            ...options /*autoConnect: false*/,
        });
        if (!node.initialized) {
            await node.events.initialized;
        }
        return [node];
    }

    /**
     * ServerNode/peers-backed replacement for {@link connectAndGetNodes}, returning {@link ClientNode}s from the
     * controller's peer collection. Nodes connect asynchronously; await `node.lifecycle.seeded` (guarded by
     * `node.lifecycle.isSeeded`) before relying on the endpoint structure.
     */
    async connectAndGetClientNodes(
        nodeIdStr?: string,
        connectOptions?: ConnectClientNodeOptions,
    ): Promise<ClientNode[]> {
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

        if (options.autoConnect !== undefined) {
            await node.setStateOf(NetworkClient, { isDisabled: !options.autoConnect });
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

    get controller() {
        if (this.commissioningController === undefined) {
            throw new Error("CommissioningController not initialized. Start first");
        }
        return this.commissioningController;
    }

    async iterateNodeDevices(
        nodes: PairedNode[],
        callback: (device: Endpoint, node: PairedNode) => Promise<void>,
        endpointId?: number,
    ) {
        for (const node of nodes) {
            let devices = node.getDevices();
            if (endpointId !== undefined) {
                devices = devices.filter(device => device.number === endpointId);
            }

            for (const device of devices) {
                await callback(device, node);
            }
        }
    }

    /**
     * ServerNode/peers-backed replacement for {@link iterateNodeDevices}, iterating the endpoints of each
     * {@link ClientNode}. Unlike the legacy `getDevices()`, this includes the root endpoint (number 0); pass
     * {@link endpointIds} to restrict iteration.
     */
    async iterateClientNodeDevices(
        nodes: ClientNode[],
        callback: (device: ClientEndpoint, node: ClientNode) => Promise<void>,
        endpointIds?: number[],
    ) {
        for (const node of nodes) {
            for (const device of node.endpoints) {
                if (endpointIds !== undefined && !endpointIds.includes(device.number)) {
                    continue;
                }
                await callback(device, node);
            }
        }
    }

    updateFabricLabel(label: string) {
        return this.commissioningController?.updateFabricLabel(label);
    }
}
