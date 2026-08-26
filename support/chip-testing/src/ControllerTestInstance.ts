/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger } from "@matter/general";
import { Environment, MockStorageService, NodeId } from "@matter/main";
import { CommissioningController, ControllerStore } from "@project-chip/matter.js";
import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
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

/**
 * The controller identities the YAML corpus addresses. Each keeps its own fabrics, in its own file.
 */
export const CONTROLLER_IDENTITIES = ["alpha", "beta", "gamma"] as const;

/** Where an identity's fabrics live, given the prefix its run was configured with. */
export function controllerIdentityStorage(prefix: string, identity: string) {
    return `${prefix}-${identity}`;
}

/** The prefix a containerized run uses, from the same parameters chip-tool's own storage honors. */
export function configuredControllerStoragePrefix() {
    return `${getParameter("storage-directory") ?? "/tmp"}${getParameter("KVS") ?? "/chip_tool_kvs"}`;
}

/**
 * Discards every identity's fabrics.
 *
 * Each identity stores under its own name, so a reset that removes only the prefix removes nothing a
 * controller ever wrote and leaves every commissioned fabric in place for the next run.
 */
export async function resetControllerStorage(prefix: string) {
    for (const identity of CONTROLLER_IDENTITIES) {
        await rm(controllerIdentityStorage(prefix, identity), { recursive: true, force: true });
    }
}

export interface ControllerTestInstanceConfig extends TestInstanceConfig {
    websocketPort: number;

    /**
     * Where the identities keep their fabrics, as a filename prefix. Defaults to what the run's own
     * parameters name (see {@link configuredControllerStoragePrefix}).
     */
    storagePrefix?: string;
}

export interface ControllerTestInstanceConstructor<T extends TestInstance = TestInstance> {
    new (config: ControllerTestInstanceConfig): T;
}

export async function startControllerTestApp(testInstanceClass: ControllerTestInstanceConstructor) {
    const storageDir = getParameter("storage-directory") ?? "/tmp";
    try {
        mkdirSync(storageDir);
    } catch (error) {
        if ((error as any).code !== "EEXIST") {
            logger.error(`Failed to create storage directory: ${storageDir}`, error);
        }
    }
    const storagePrefix = configuredControllerStoragePrefix();
    logger.info(`Using storage directory: ${storagePrefix}`);

    if (hasParameter("factoryreset")) {
        await resetControllerStorage(storagePrefix);
    }

    const testInstance = new testInstanceClass({
        storagePrefix,
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
    #storagePrefix: string;

    constructor(config: ControllerTestInstanceConfig) {
        super(config);
        this.#commandHandler = new ChipToolWebSocketHandler(config.websocketPort);
        this.#storagePrefix = config.storagePrefix ?? configuredControllerStoragePrefix();
    }

    /** Where this instance's identities keep their fabrics (see {@link resetControllerStorage}). */
    get storagePrefix() {
        return this.#storagePrefix;
    }

    /** Prepare Controller identities alpha, beta and gamma used by tests. */
    #setupControllers() {
        const initStorageService = (env: Environment) =>
            new MockStorageService(env, namespace => {
                const storageName = controllerIdentityStorage(this.#storagePrefix, namespace);
                logger.info(`Storage service requested for namespace ${namespace}: ${storageName}`);
                return new StorageBackendAsyncJsonFile(storageName);
            });

        // Each developer gets his own derived environment because should have it's own storage
        // TODO Enhance Controller to allow multiple Fabrics and then each identity is "just" an own Fabric
        //      But Let's do that later with ServerNode. For now it works like this.
        const envAlpha = new Environment(`${this.id}-alpha`, this.#env);
        initStorageService(envAlpha);

        const tcpEnabled = process.env.TEST_PREFER_TCP === "1";

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
                    tcp: tcpEnabled ? { outgoing: true } : undefined,
                    transportPreference: tcpEnabled ? "tcp" : undefined,
                }),
            ),
        });

        const envBeta = new Environment(`${this.id}-beta`, this.#env);
        initStorageService(envBeta);
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
                    tcp: tcpEnabled ? { outgoing: true } : undefined,
                    transportPreference: tcpEnabled ? "tcp" : undefined,
                }),
            ),
        });

        const envGamma = new Environment(`${this.id}-gamma`, this.#env);
        initStorageService(envGamma);
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
                    tcp: tcpEnabled ? { outgoing: true } : undefined,
                    transportPreference: tcpEnabled ? "tcp" : undefined,
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

        await this.#commandHandler.start();

        logger.info("STARTED");
    }

    /** Stop the test instance MatterServer and the device. */
    override async stop() {
        this.#commandHandler.close();
        if (this.#controllerInstances.size > 0) {
            for (const { handler, env } of this.#controllerInstances.values()) {
                await handler.close();
                await env.close(ControllerStore); // Manually close ControllerStore to ensure data persistence
            }
            this.#controllerInstances.clear();
        }
    }

    override async close() {
        await this.stop();

        logger.info(`${this.appName}: Controller Instance stopped`);
    }
}
