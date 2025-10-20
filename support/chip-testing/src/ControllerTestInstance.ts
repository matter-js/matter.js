/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger } from "@matter/general";
import { Environment, NodeId, StorageService } from "@matter/main";
import { MdnsService } from "@matter/main/protocol";
import { CommissioningController, ControllerStore } from "@project-chip/matter.js";
import { mkdirSync } from "node:fs";
import { ChipToolWebSocketHandler } from "./ChipToolWebSocketHandler.js";
import {
    getIntParameter,
    getParameter,
    hasParameter,
    startTestApp,
    TestInstance,
    TestInstanceConfig,
} from "./GenericTestApp.js";
import { LegacyControllerCommandHandler } from "./handler/LegacyControllerCommandHandler.js";
import { StorageBackendAsyncJsonFile } from "./storage/StorageBackendAsyncJsonFile.js";

const logger = Logger.get("ControllerTestInstance");

export interface ControllerTestInstanceConfig extends TestInstanceConfig {
    websocketPort: number;
}

export interface ControllerTestInstanceConstructor<T extends TestInstance = TestInstance> {
    new (config: ControllerTestInstanceConfig): T;
}

export async function startControllerTestApp(
    testInstanceClass: ControllerTestInstanceConstructor,
    storageType: typeof StorageBackendAsyncJsonFile = StorageBackendAsyncJsonFile,
) {
    const storageDir = getParameter("storage-directory") ?? "/tmp";
    try {
        mkdirSync(storageDir);
    } catch (error) {
        if ((error as any).code !== "EEXIST") {
            logger.error(`Failed to create storage directory: ${storageDir}`, error);
        }
    }
    const storageName = `${storageDir}${getParameter("KVS") ?? "/chip_tool_kvs"}`;
    logger.info(`Using storage directory: ${storageName}`);

    const storage = new storageType(storageName);
    if (hasParameter("factoryreset")) {
        await storage.clear();
    }

    const testInstance = new testInstanceClass({
        storage,
        websocketPort: getIntParameter("port") ?? 9002,
    });

    await startTestApp(testInstance);
}

/** A Test instance for Controller tests */
export class ControllerTestInstance extends TestInstance {
    static override id = "binford-controller-6100";
    #env = new Environment(`${this.id}-env`, Environment.default);
    #controllerInstances = new Map<
        string,
        {
            env: Environment;
            handler: LegacyControllerCommandHandler;
        }
    >();
    #commandHandler: ChipToolWebSocketHandler;
    #storages: Map<string, Map<string, StorageBackendAsyncJsonFile>> = new Map();

    constructor(config: ControllerTestInstanceConfig) {
        super(config);
        this.#commandHandler = new ChipToolWebSocketHandler(config.websocketPort);
    }

    /** Prepare Controller identities alpha, beta and gamma used by tests. */
    #setupControllers() {
        const initStorageService = (identity: string) =>
            new StorageService(this.#env, namespace => {
                const identityStore = this.#storages.get(identity) ?? new Map<string, StorageBackendAsyncJsonFile>();
                const storageDir = getParameter("storage-directory") ?? "/tmp";
                const storageName = `${storageDir}${getParameter("KVS") ?? "/chip_tool_kvs"}-${namespace}`;
                logger.info(`Storage service requested for namespace ${namespace}: ${storageName}`);
                if (identityStore.has(namespace)) {
                    return identityStore.get(namespace)!;
                }
                const storage = new StorageBackendAsyncJsonFile(storageName);
                identityStore.set(namespace, storage);
                this.#storages.set(identity, identityStore);
                return storage;
            });

        // Each developer gets his own derived environment because should have it's own storage
        // TODO Enhance Controller to allow multiple Fabrics and then each identity is "just" an own Fabric
        //      But Let's do that later with ServerNode. For now it works like this.
        const envAlpha = new Environment(`${this.id}-alpha`, this.#env);
        envAlpha.set(StorageService, initStorageService("alpha"));

        this.#controllerInstances.set("alpha", {
            env: envAlpha,
            handler: new LegacyControllerCommandHandler(
                "alpha",
                new CommissioningController({
                    environment: {
                        environment: envAlpha,
                        id: "alpha",
                    },
                    autoConnect: false, // Do not auto connect to the commissioned nodes
                    adminFabricLabel: "alpha",
                    rootNodeId: NodeId(0x112233),
                }),
            ),
        });

        const envBeta = new Environment(`${this.id}-beta`, this.#env);
        envBeta.set(StorageService, initStorageService("beta"));
        this.#controllerInstances.set("beta", {
            env: envBeta,
            handler: new LegacyControllerCommandHandler(
                "beta",
                new CommissioningController({
                    environment: {
                        environment: envBeta,
                        id: "beta",
                    },
                    autoConnect: false, // Do not auto connect to the commissioned nodes
                    adminFabricLabel: "beta",
                    rootNodeId: NodeId(0x112233),
                }),
            ),
        });

        const envGamma = new Environment(`${this.id}-gamma`, this.#env);
        envGamma.set(StorageService, initStorageService("gamma"));
        this.#controllerInstances.set("gamma", {
            env: envGamma,
            handler: new LegacyControllerCommandHandler(
                "gamma",
                new CommissioningController({
                    environment: {
                        environment: envGamma,
                        id: "gamma",
                    },
                    autoConnect: false, // Do not auto connect to the commissioned nodes
                    adminFabricLabel: "gamma",
                    rootNodeId: NodeId(0x112233),
                }),
            ),
        });
    }

    /** Initialize everything. */
    async initialize() {
        if (this.#controllerInstances.size > 0) {
            throw new InternalError("Already initialized");
        }

        try {
            this.#setupControllers();
            logger.info(
                `${this.appName}: Setup Controllers done ${Array.from(this.#controllerInstances.keys()).join(",")}`,
            );
            this.#commandHandler.initialize(
                new Map(Array.from(this.#controllerInstances.entries()).map(([name, { handler }]) => [name, handler])),
            );
        } catch (error) {
            // Catch and log error, else the test framework hides issues here
            logger.error(error);
            logger.error((error as Error).stack);
            throw error;
        }

        logger.info(`${this.appName}: Setup done`);
    }

    /** Start the command handlers. Controller will be started when needed. */
    async start() {
        if (this.#controllerInstances.size === 0) {
            throw new InternalError("Started without initialization");
        }

        /*
        this.#env.vars.set("mdns.networkInterface", "en0");
        */

        this.#commandHandler.start();

        logger.info("STARTED");
    }

    /** Stop the test instance MatterServer and the device. */
    override async stop() {
        this.#commandHandler.close();
        if (this.#controllerInstances.size > 0) {
            for (const [identity, { handler, env }] of this.#controllerInstances.entries()) {
                await handler.close();
                await env.close(ControllerStore); // Manually close ControllerStore to ensure data persistence
                const identityStores = this.#storages.get(identity);
                if (identityStores) {
                    for (const storage of identityStores.values()) {
                        console.info(`Closing storage for identity ${identity}`);
                        await storage.close();
                    }
                }
            }
            this.#controllerInstances.clear();
        }
    }

    override async close() {
        await this.stop();

        logger.info("Closing MdnsService");
        await this.#env.close(MdnsService);

        logger.info(`${this.appName}: Controller Instance stopped`);
    }
}
