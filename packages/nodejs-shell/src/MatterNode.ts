/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Include this first to auto-register Crypto, Network and Time Node.js implementations
import { Environment, Logger, StorageContext, StorageService } from "#general";
import { DclCertificateService, DclOtaUpdateService } from "#protocol";
import { NodeId } from "#types";
import { CommissioningController, ControllerStore } from "@project-chip/matter.js";
import { CommissioningControllerNodeOptions, Endpoint, PairedNode } from "@project-chip/matter.js/device";
import { join } from "node:path";

const logger = Logger.get("Node");

export class MatterNode {
    #storageLocation?: string;
    #storageContext?: StorageContext;
    readonly #environment: Environment;
    commissioningController?: CommissioningController;
    #started = false;
    readonly #nodeNum: number;
    readonly #netInterface?: string;
    #dclFetchTestCertificates = false;

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

    get otaService() {
        return this.environment.has(DclOtaUpdateService)
            ? this.environment.get(DclOtaUpdateService)
            : new DclOtaUpdateService(this.environment); // Will add itself on initial instantiation
    }

    get certificateService() {
        if (this.environment.has(DclCertificateService)) {
            return this.environment.get(DclCertificateService);
        }

        return new DclCertificateService(this.environment, { fetchTestCertificates: this.#dclFetchTestCertificates });
    }

    async initialize(resetStorage: boolean) {
        /**
         * Initialize the storage system.
         *
         * The storage manager is then also used by the Matter server, so this code block in general is required,
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
            });
            await this.commissioningController.initializeControllerStore();

            const controllerStore = this.commissioningController.env.get(ControllerStore);
            if (resetStorage) {
                await controllerStore.erase();
            }
            this.#storageContext = controllerStore.storage.createContext("Node");

            // Read DCL test certificates setting
            this.#dclFetchTestCertificates = await this.#storageContext.get<boolean>("DclFetchTestCertificates", false);

            const storageService = this.commissioningController.env.get(StorageService);
            const baseLocation = storageService.location;
            if (baseLocation !== undefined) {
                this.#storageLocation = join(baseLocation, id);
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
        await this.commissioningController?.close();
    }

    async start() {
        if (this.#started) {
            return;
        }
        logger.info(`matter.js shell controller started for node ${this.#nodeNum}`);

        if (this.commissioningController !== undefined) {
            await this.commissioningController.start();

            if (await this.Store.has("ControllerFabricLabel")) {
                await this.commissioningController.updateFabricLabel(
                    await this.Store.get<string>("ControllerFabricLabel", "matter.js Shell"),
                );
            }
        } else {
            throw new Error("No controller initialized");
        }
        this.#started = true;
        await this.certificateService.construction;
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

        const node = await this.commissioningController.connectNode(nodeId, connectOptions);
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
