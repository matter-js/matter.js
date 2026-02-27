/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { MaybePromise } from "#util/Promises.js";

import { NoProviderError } from "../MatterError.js";
import { Environment } from "../environment/Environment.js";
import { Environmental } from "../environment/Environmental.js";
import { Filesystem } from "../fs/Filesystem.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { Logger } from "../log/Logger.js";
import { StorageDriver } from "./StorageDriver.js";
import { StorageManager } from "./StorageManager.js";
import { StorageMigration } from "./StorageMigration.js";

const logger = Logger.get("StorageService");

const DRIVER_JSON = "driver.json";

/**
 * Service adapter for the Matter.js storage API.
 */
export class StorageService {
    #factory?: (namespace: string) => MaybePromise<StorageDriver>;
    #location?: string;
    #drivers = new Map<string, StorageDriver.Implementation<StorageDriver.Descriptor>>();
    #defaultDriver = "wal";
    #configuredDriver?: string;
    #environment: Environment;

    constructor(
        environment: Environment,

        factory?: (namespace: string) => MaybePromise<StorageDriver>,
        resolver?: (...paths: string[]) => string,
    ) {
        environment.set(StorageService, this);
        this.#factory = factory;
        this.#environment = environment;

        // Fallback resolver is dumb and probably not useful; expected to be replaced by platform implementation if
        // file resolution is necessary
        this.resolve = resolver ?? ((...paths: []) => paths.join("/"));
    }

    static [Environmental.create](environment: Environment) {
        return new this(environment);
    }

    /**
     * Register a driver implementation so that it can be resolved by id.
     */
    registerDriver(impl: StorageDriver.Implementation<StorageDriver.Descriptor>) {
        this.#drivers.set(impl.id, impl);
    }

    /**
     * Set the default driver id used when no existing storage is detected.
     */
    set defaultDriver(id: string) {
        this.#defaultDriver = id;
    }

    get defaultDriver() {
        return this.#defaultDriver;
    }

    /**
     * Set the explicitly configured driver id (e.g. from user configuration).  When set, triggers migration if the
     * existing storage uses a different driver.
     */
    set configuredDriver(id: string | undefined) {
        this.#configuredDriver = id;
    }

    get configuredDriver() {
        return this.#configuredDriver;
    }

    /**
     * Open storage.  The storage is initialized but the caller must take ownership.
     *
     * @param namespace a unique namespace identifier such as a root node ID
     */
    async open(namespace: string) {
        // If a custom factory is installed, use it directly (backward compat)
        if (this.#factory !== undefined) {
            const storage = await this.#factory(namespace);
            const manager = new StorageManager(storage);
            await manager.initialize();
            return manager;
        }

        // Use the driver registry
        if (this.#drivers.size === 0) {
            throw new NoProviderError("Storage is unavailable because no drivers are registered");
        }

        const fs = this.#environment.get(Filesystem);
        const parentDir = fs.directory(namespace);
        const dir = parentDir;

        // Detect existing driver
        let descriptor = await this.#readDescriptor(dir);
        let detectedKind: string | undefined;

        if (descriptor) {
            detectedKind = descriptor.kind;
        } else if (await dir.exists()) {
            // Directory exists but no driver.json → legacy file driver
            detectedKind = "file";
        } else {
            // Check for legacy sibling .db file → sqlite driver
            const dbFile = fs.file(`${namespace}.db`);
            if (await dbFile.exists()) {
                detectedKind = "sqlite";
            }
        }

        // Resolve which driver to use
        const targetKind = this.#configuredDriver ?? detectedKind ?? this.#defaultDriver;

        // Migration: if we detected an existing driver that differs from the target, migrate
        if (detectedKind !== undefined && detectedKind !== targetKind) {
            await this.#migrate(fs, namespace, dir, detectedKind, targetKind);
            // After migration, re-read descriptor
            descriptor = await this.#readDescriptor(dir);
        }

        if (!descriptor) {
            descriptor = { kind: targetKind };
        }

        const impl = this.#drivers.get(targetKind);
        if (!impl) {
            throw new NoProviderError(`No storage driver registered for "${targetKind}"`);
        }

        // Preinitialize
        if (impl.preinitialize) {
            await impl.preinitialize(fs, descriptor);
        }

        // Create the driver
        const storage = await impl.create(dir, descriptor);

        // Write driver.json if the directory exists after creation (before initialize, so we persist intent)
        if (await dir.exists()) {
            await this.#writeDescriptor(dir, descriptor);
        }

        const manager = new StorageManager(storage);
        await manager.initialize();
        return manager;
    }

    /**
     * Install a factory for opening storage.  Without such a factory storage is unavailable.
     */
    set factory(factory: (namespace: string) => MaybePromise<StorageDriver>) {
        this.#factory = factory;
    }

    /**
     * The storage location.  Only used for diagnostic purposes.
     */
    get location() {
        return this.#location;
    }

    set location(location: string | undefined) {
        this.#location = location;
    }

    /**
     * Join one or more relative paths to some platform-dependent notion of an absolute storage path.
     */
    resolve: (...paths: string[]) => string;

    [Diagnostic.value]() {
        return [
            "Persistence",
            Diagnostic.dict({
                location: this.#location ?? "(unknown)",
                available: this.#factory !== undefined || this.#drivers.size > 0,
            }),
        ];
    }

    async #readDescriptor(dir: import("../fs/Directory.js").Directory): Promise<StorageDriver.Descriptor | undefined> {
        const file = dir.file(DRIVER_JSON);
        try {
            if (!(await file.exists())) {
                return undefined;
            }
            const text = await file.readAllText();
            return JSON.parse(text) as StorageDriver.Descriptor;
        } catch {
            return undefined;
        }
    }

    async #writeDescriptor(dir: import("../fs/Directory.js").Directory, descriptor: StorageDriver.Descriptor) {
        const file = dir.file(DRIVER_JSON);
        await file.write(JSON.stringify(descriptor, undefined, 2));
    }

    async #migrate(
        fs: Filesystem,
        namespace: string,
        dir: import("../fs/Directory.js").Directory,
        fromKind: string,
        toKind: string,
    ) {
        const fromImpl = this.#drivers.get(fromKind);
        const toImpl = this.#drivers.get(toKind);
        if (!fromImpl || !toImpl) {
            logger.warn(`Cannot migrate from "${fromKind}" to "${toKind}": driver not registered`);
            return;
        }

        logger.info(`Migrating storage "${namespace}" from "${fromKind}" to "${toKind}"`);

        const fromDescriptor: StorageDriver.Descriptor = { kind: fromKind };
        const toDescriptor: StorageDriver.Descriptor = { kind: toKind };

        try {
            // Preinitialize source if needed
            if (fromImpl.preinitialize) {
                await fromImpl.preinitialize(fs, fromDescriptor);
            }

            // Create and initialize source
            const sourceStorage = await fromImpl.create(dir, fromDescriptor);
            await sourceStorage.initialize();

            // Preinitialize target if needed
            if (toImpl.preinitialize) {
                await toImpl.preinitialize(fs, toDescriptor);
            }

            // Create and initialize target
            const targetStorage = await toImpl.create(dir, toDescriptor);
            await targetStorage.initialize();

            // Migrate data
            const result = await StorageMigration.migrate(sourceStorage, targetStorage);

            await sourceStorage.close();
            await targetStorage.close();

            if (result.success) {
                logger.info(
                    `Migration complete: ${result.migratedCount} items migrated, ${result.skippedCount} skipped`,
                );
            } else {
                logger.warn(
                    `Migration had issues: ${result.migratedCount} items migrated, ${result.skippedCount} skipped`,
                );
            }
        } catch (e) {
            logger.error(`Migration from "${fromKind}" to "${toKind}" failed:`, e);
        }
    }
}
