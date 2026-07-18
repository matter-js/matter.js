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
import { installDiagnosticLogging } from "./util/diagnosticLogging.js";

const logger = Logger.get("Node");

const ADMIN_FABRIC_LABEL = "matter.js Shell";

/**
 * Options for {@link MatterNode.connectAndGetNodes}, expressed in the legacy vocabulary and mapped onto
 * {@link NetworkClient} state per docs/MIGRATION_CONTROLLER_018.md.
 */
export interface ConnectClientNodeOptions {
    /** When `false`, the node is not connected (left offline); it is never disabled. */
    autoConnect?: boolean;
    /** When `true`, opts into a subscription on connect; otherwise the node connects without subscribing. */
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
    #nodeEnvironment?: Environment;
    #node?: ServerNode;
    #nodePromise?: Promise<ServerNode>;
    #fabric?: Fabric;
    #started = false;
    #startPromise?: Promise<void>;
    readonly #nodeNum: number;
    readonly #netInterface?: string;
    #dclFetchTestCertificates = false;
    #allowTestOtaImages = false;
    #transportPreference?: "tcp" | "udp";
    #bleEnabled = false;
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
        await this.start();
        const service = await this.node.act(agent => agent.get(DclBehavior).otaUpdateService);
        await service.construction;
        return service;
    }

    async certificateService() {
        await this.start();
        const service = await this.node.act(agent => agent.get(DclBehavior).certificateService);
        await service.construction;
        return service;
    }

    async vendorInfoService() {
        await this.start();
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
        this.#nodeEnvironment = nodeEnvironment;

        // Open storage up front so persisted settings are available before the controller node is built.
        this.#storageManager = await nodeEnvironment.get(StorageService).open(id);
        this.#storageContext = this.#storageManager.createContext("Node");

        this.#dclFetchTestCertificates = await this.#storageContext.get<boolean>("DclFetchTestCertificates", false);
        this.#allowTestOtaImages = await this.#storageContext.get<boolean>("AllowTestOtaImages", false);
        const storedPref = await this.#storageContext.get<string>("TransportPreference", "");
        this.#transportPreference = storedPref === "tcp" || storedPref === "udp" ? storedPref : undefined;

        this.#bleEnabled = (nodeEnvironment.maybeGet(Ble) ?? Environment.default.maybeGet(Ble)) !== undefined;

        // storageLocation only reads the filesystem path; it neither creates nor onlines the node and is consumed at
        // boot (shell history), so it stays out of the lazy #ensureNode() path.
        if (nodeEnvironment.has(Filesystem)) {
            this.#storageLocation = join(nodeEnvironment.get(Filesystem).path, id);
        }

        // Factory reset needs the node to clear its stores; accept eager creation only in this rare, explicit case.
        // The node is created but not started, so it does not go operationally online here.
        if (resetStorage) {
            await (await this.#ensureNode()).erase();
        }
    }

    /**
     * Lazily creates the controller {@link ServerNode} on first real use. Creation runs the controller behaviors
     * (binding the mDNS socket), which is why boot defers it until {@link start}.
     *
     * Concurrent callers (e.g. two websocket requests) share one creation via {@link #nodePromise}, so the node is
     * never built twice. A failed creation clears the cached promise so a subsequent call can retry.
     */
    async #ensureNode(): Promise<ServerNode> {
        if (this.#node !== undefined) {
            return this.#node;
        }
        if (this.#nodePromise !== undefined) {
            return this.#nodePromise;
        }
        if (this.#nodeEnvironment === undefined) {
            throw new ImplementationError("Controller node accessed before initialize()");
        }

        this.#nodePromise = (async () => {
            const id = `shell-${this.#nodeNum.toString()}`;
            const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
                environment: this.#nodeEnvironment,
                id,
                network: {
                    ble: false,
                    tcp: true,
                    transportPreference: this.#transportPreference,
                    // The shell connects peers strictly on demand, so opt out of the online-time bulk connect.
                    autoStartCommissionedPeers: false,
                },
                basicInformation: {
                    productName: ADMIN_FABRIC_LABEL,
                },
                controller: {
                    adminFabricLabel: ADMIN_FABRIC_LABEL,
                    ble: this.#bleEnabled,
                },
                commissioning: {
                    enabled: false, // The controller node is never commissionable itself.
                },
                subscriptions: {
                    persistenceEnabled: false, // Subscription persistence is a device feature, not a controller one.
                },
            });

            // Pulls in SoftwareUpdateManager (and thereby DclBehavior on the root node) for OTA provider support.
            await node.add(new Endpoint(OtaProviderEndpoint, { id: "ota-provider" }));

            this.#node = node;
            return node;
        })();

        try {
            return await this.#nodePromise;
        } catch (e) {
            this.#nodePromise = undefined;
            throw e;
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

    /** Concurrent callers share one in-flight run via {@link #startPromise} so the setup below executes exactly once. */
    async start() {
        if (this.#started) {
            return;
        }
        if (this.#startPromise !== undefined) {
            return this.#startPromise;
        }

        this.#startPromise = (async () => {
            logger.info(`matter.js shell controller started for node ${this.#nodeNum}`);

            const node = await this.#ensureNode();

            // Reuse the existing controller fabric (matched by CA) or create one, rotating the NOC once per runtime.
            const fabricAuthority = await node.env.load(FabricAuthority);
            this.#fabric = await fabricAuthority.defaultFabric({ adminFabricLabel: ADMIN_FABRIC_LABEL });

            await node.start();

            // The shell subscribes on demand (the `subscribe` command), never persistently. Clear any autoSubscribe
            // carried over from a prior session or pre-migration commissioning once here, so a plain connect never
            // resumes a subscription; the connect path then leaves autoSubscribe untouched (see below).
            for (const peer of node.peers.commissioned) {
                if (peer.stateOf(NetworkClient).autoSubscribe) {
                    await peer.setStateOf(NetworkClient, { autoSubscribe: false });
                }
            }

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

            installDiagnosticLogging(node, this.#observers);

            this.#started = true;
        })();

        try {
            await this.#startPromise;
        } finally {
            this.#startPromise = undefined;
        }
    }

    /**
     * Returns the {@link ClientNode}s for the commissioned peers, connecting them (unless `autoConnect: false`).
     * Nodes connect asynchronously; use {@link awaitSeeded} before relying on the endpoint structure.
     */
    async connectAndGetNodes(nodeIdStr?: string, connectOptions?: ConnectClientNodeOptions): Promise<ClientNode[]> {
        await this.start();

        const commissioned = this.node.peers.commissioned;

        // A specific node id must surface its own failure; the all-nodes path is best-effort (see below).
        const singleNodeRequested = nodeIdStr !== undefined;

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
            try {
                await this.#applyClientNodeNetworkOptions(node, connectOptions);
                if (connectOptions?.autoConnect === false) {
                    continue;
                }
                // A disabled peer (persisted from a prior run) rejects start(); enable() clears isDisabled and
                // starts it. Safe because autoStartCommissionedPeers is off, so the now-enabled peer won't
                // auto-connect on next boot.
                if (node.stateOf(NetworkClient).isDisabled) {
                    await node.enable();
                } else {
                    await node.start();
                }
            } catch (e) {
                if (singleNodeRequested) {
                    throw e;
                }
                // Best-effort across all commissioned peers: one unreachable peer must not abort the rest.
                logger.warn(`Node ${node.peerAddress?.nodeId} failed to connect:`, e);
            }
        }

        return nodes;
    }

    async #applyClientNodeNetworkOptions(node: ClientNode, options?: ConnectClientNodeOptions) {
        // connect ≠ subscribe: a plain connect leaves autoSubscribe untouched (it was normalized to false once at
        // startup), so a subscription established this session via the `subscribe` command survives subsequent
        // commands.  Only an explicit opt-in flips it here.
        if (options?.autoSubscribe !== undefined) {
            await node.setStateOf(NetworkClient, { autoSubscribe: options.autoSubscribe });
        }

        const { subscribeMinIntervalFloorSeconds, subscribeMaxIntervalCeilingSeconds } = options ?? {};
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
