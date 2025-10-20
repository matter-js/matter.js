#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
import { Environment, MaybePromise, Storage } from "@matter/main";
import { ValidationError } from "@matter/main/types";
import { BackchannelCommand, CommandPipe, PicsFile } from "@matter/testing";
import { NamedPipeCommandHandler } from "./NamedPipeCommandHandler.js";
import { StorageBackendAsyncJsonFile } from "./storage/StorageBackendAsyncJsonFile.js";

const logger = Logger.get("GenericTestApp");

// TODO - the get*Parameter calls are deprecated along with matter-node.js so copied here temporarily.  Replace with
// yargs ?
const commandArguments = process.argv.slice(2);

export function getParameter(name: string) {
    let markerIndex = commandArguments.indexOf(`-${name}`);
    if (markerIndex === -1) markerIndex = commandArguments.indexOf(`--${name}`);
    if (markerIndex === -1 || markerIndex + 1 === commandArguments.length) return undefined;
    return commandArguments[markerIndex + 1];
}

export function hasParameter(name: string) {
    let markerIncluded = commandArguments.includes(`-${name}`);
    if (!markerIncluded) markerIncluded = commandArguments.includes(`--${name}`);
    return markerIncluded;
}

export function getIntParameter(name: string) {
    const value = getParameter(name);
    if (value === undefined) return undefined;
    const intValue = parseInt(value, 10);
    if (isNaN(intValue)) throw new ValidationError(`Invalid value for parameter ${name}: ${value} is not a number`);
    return intValue;
}

const allocatedIds = new Set();

export abstract class TestInstance {
    static id = "test-node";
    #id: string;
    #config: TestInstanceConfig;

    get id() {
        return this.#id;
    }

    get storage() {
        return this.#config.storage;
    }

    set storage(storage: Storage) {
        this.#config.storage = storage;
    }

    get config() {
        return this.#config;
    }

    get baseAppName() {
        return this.constructor.name.replace(/TestInstance(?:Legacy)?/, "");
    }

    get appName() {
        if (this.constructor.name.endsWith("Legacy")) {
            return `${this.baseAppName}-Legacy`;
        }
        return this.baseAppName;
    }

    constructor(config: TestInstanceConfig) {
        this.#config = config;
        this.#id = (this.constructor as { (): unknown; id: string }).id;
        if (config.domain !== undefined) {
            this.#id = `${this.#id}-${config.domain}`;
        }
        let nextId = 1;
        while (allocatedIds.has(this.#id)) {
            const qualifiedId = `${this.#id}-${nextId++}`;
            if (!allocatedIds.has(qualifiedId)) {
                this.#id = qualifiedId;
                allocatedIds.add(this.#id);
                break;
            }
        }
    }

    abstract initialize(): Promise<void>;
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract close(): Promise<void>;
}

export abstract class DeviceTestInstance extends TestInstance {
    #commandPipe?: CommandPipe;
    #commandPipeFactory: (app: DeviceTestInstance, name: string) => Promise<void | CommandPipe>;

    constructor(config: DeviceTestInstanceConfig) {
        super(config);
        this.#commandPipeFactory = config.commandPipeFactory;
    }

    async activateCommandPipe(name: string) {
        if (this.#commandPipe === undefined) {
            if (this.#commandPipeFactory === undefined) {
                throw new Error(`Cannot instantiate ${this.appName} without command pipe factory`);
            }
            const pipe = await this.#commandPipeFactory(this, name);
            if (pipe) {
                this.#commandPipe = pipe;
            }
        }
    }

    async stop(): Promise<void> {
        await this.#commandPipe?.close();
    }

    async backchannel(command: BackchannelCommand) {
        throw new Error(`Unhandled backchannel ${command.name}: ${JSON.stringify(command)}`);
    }
}

export namespace log {
    export function directive(...args: unknown[]) {
        console.log(...args);
    }

    export function error(...args: unknown[]) {
        console.log(args);
    }
}

export interface TestInstanceConfig {
    storage: Storage;
    discriminator?: number;
    passcode?: number;
    domain?: string;
}

export interface DeviceTestInstanceConfig extends TestInstanceConfig {
    /**
     * Initializes a {@link CommandPipe} for the application.
     *
     * This function may optionally return the pipe object.  When running tests locally using GenericTestApp this is
     * necessary to close the pipe.  When running containerized this is unnecessary as the test harness manages pipes.
     */
    commandPipeFactory: (app: DeviceTestInstance, name: string) => Promise<void | CommandPipe>;
}

export interface DeviceTestInstanceConstructor<T extends DeviceTestInstance = DeviceTestInstance> {
    new (config: DeviceTestInstanceConfig): T;
    pics?: PicsFile;
}

export async function startDeviceTestApp(
    testInstanceClass: DeviceTestInstanceConstructor,
    storageType: typeof StorageBackendAsyncJsonFile = StorageBackendAsyncJsonFile,
) {
    const storageName = `/tmp/chip_${getParameter("KVS") ?? "kvs"}`;

    const storage = new storageType(storageName);
    if (hasParameter("factoryreset")) {
        await storage.clear();
    }

    const testInstance = new testInstanceClass({
        storage,
        commandPipeFactory: async (app: DeviceTestInstance, name: string) => {
            const pipe = new NamedPipeCommandHandler(
                {
                    backchannel(command: BackchannelCommand): void | Promise<void> {
                        return app.backchannel(command);
                    },
                },
                CommandPipe.filenameFor(name),
            );

            await pipe.initialize();

            return pipe;
        },
        discriminator: getIntParameter("discriminator"),
        passcode: getIntParameter("passcode"),
    });

    await startTestApp(testInstance);
}

export async function startTestApp(testInstance: TestInstance) {
    await testInstance.initialize();
    await testInstance.start();

    logger.info(`Waiting for tests`);

    function exitHandler(signal: string) {
        logger.info(`Closing test instance because of ${signal} ...`);

        // Trigger storing current data because later it could be too late and testrunner already did things
        if (testInstance.storage instanceof StorageBackendAsyncJsonFile && testInstance.storage.initialized) {
            testInstance.storage.storeIt(true).catch(error => logger.info(error.stack));
        }

        testInstance
            .stop()
            .then(() => {
                const runtime = Environment.default.runtime;
                runtime.cancel();
                runtime.inactive
                    .then(() => {
                        MaybePromise.then(
                            testInstance.storage?.initialized && testInstance.storage?.close(),
                            () => {
                                logger.info(`Test instance successfully closed.`);
                                process.exit(0);
                            },
                            error => {
                                logger.info(error.stack);
                                process.exit(1);
                            },
                        );
                    })
                    .catch(error => {
                        logger.info(error.stack);
                        process.exit(1);
                    });
            })
            .catch(error => {
                logger.info(error.stack);
                process.exit(1);
            });
    }

    process.on("SIGTERM", () => exitHandler("SIGTERM"));
    process.on("SIGINT", () => exitHandler("SIGINT"));

    process.on("exit", code => logger.info(`Exit Test instance with code ${code}`));
}
