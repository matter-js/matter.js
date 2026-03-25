/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Include this first to auto-register Crypto, Network and Time Node.js implementations
import {
    Environment,
    Filesystem,
    Logger,
    ObserverGroup,
    StorageContext,
    StorageManager,
    StorageService,
} from "@matter/general";
import { DclBehavior, ServerNode, SoftwareUpdateManager } from "@matter/node";
import { NodeId } from "@matter/types";
import { CommissioningController } from "@project-chip/matter.js";
import { CommissioningControllerNodeOptions, Endpoint, PairedNode } from "@project-chip/matter.js/device";
import { join } from "node:path";

const logger = Logger.get("Node");

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

            // Build up the "Not-so-legacy" Controller
            const id = `shell-${this.#nodeNum.toString()}`;
            this.commissioningController = new CommissioningController({
                environment: {
                    environment: this.#environment,
                    id,
                },
                autoConnect: false,
                adminFabricLabel: "matter.js Shell",
                enableOtaProvider: true,
                tcp: true,
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

            // We side open a storage with the same ID as the ServerNode but only care about the "Node" sub context which
            // is consistent.
            this.#storageManager = await env.get(StorageService).open(id);
            this.#storageContext = this.#storageManager.createContext("Node");

            // Read DCL test certificates setting
            this.#dclFetchTestCertificates = await this.#storageContext.get<boolean>("DclFetchTestCertificates", false);

            // Read OTA test images setting
            this.#allowTestOtaImages = await this.#storageContext.get<boolean>("AllowTestOtaImages", false);
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
        await this.commissioningController?.close();
        this.#observers?.close();
        await this.#storageManager?.close();
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

        if (nodeId === undefined) {
            return await this.commissioningController.connect(connectOptions);
        }

        const node = await this.commissioningController.connectNode(nodeId, {
            ...connectOptions /*autoConnect: false*/,
        });
        if (!node.initialized) {
            await node.events.initialized;
        }
        return [node];
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

    updateFabricLabel(label: string) {
        return this.commissioningController?.updateFabricLabel(label);
    }
}
