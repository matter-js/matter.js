/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { NoProviderError } from "../MatterError.js";
import { Environment } from "../environment/Environment.js";
import { Environmental } from "../environment/Environmental.js";
import type { Directory } from "../fs/Directory.js";
import { Filesystem } from "../fs/Filesystem.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { Logger } from "../log/Logger.js";
import { DataNamespace } from "./DataNamespace.js";
import { DatafileRoot } from "./DatafileRoot.js";
import { StorageDriver } from "./StorageDriver.js";
import { StorageDriverHandle } from "./StorageDriverHandle.js";
import { StorageManager } from "./StorageManager.js";
import { StorageMigration } from "./StorageMigration.js";

const logger = Logger.get("StorageService");

/**
 * Service adapter for the Matter.js storage API.
 */
export class StorageService {
    #drivers = new Map<string, StorageDriver.Implementation<StorageDriver.Descriptor>>();
    #defaultDriver = "wal";
    #configuredDriver?: string;
    #environment: Environment;
    #openDrivers = new Map<string, { driver: StorageDriver; refs: number }>();

    constructor(environment: Environment) {
        environment.set(StorageService, this);
        this.#environment = environment;
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
     * Whether a {@link Filesystem} service is installed in the environment.  Callers can check this before calling
     * {@link open} to avoid errors in memory-only environments.
     */
    get hasFilesystem(): boolean {
        return this.#environment.has(Filesystem);
    }

    /**
     * Whether drivers are registered.
     */
    get isConfigured(): boolean {
        return this.#drivers.size > 0;
    }

    /**
     * Open storage.  The storage is initialized but the caller must take ownership.
     *
     * @param namespace a unique namespace identifier (string) or a pre-built {@link DataNamespace}/{@link DatafileRoot}
     */
    async open(namespace: string | DataNamespace) {
        if (this.#drivers.size === 0) {
            throw new NoProviderError("Storage is unavailable because no drivers are registered");
        }

        // Resolve the DataNamespace.  When a string is given, attempt to create a DatafileRoot if a Filesystem is
        // available; otherwise fall back to a plain DataNamespace.
        let dataNs: DataNamespace;
        if (typeof namespace === "string") {
            if (this.#environment.has(Filesystem)) {
                const fs = this.#environment.get(Filesystem);
                dataNs = new DatafileRoot(fs.directory(namespace));
            } else {
                dataNs = new DataNamespace(namespace);
            }
        } else {
            dataNs = namespace;
        }

        const cacheKey = dataNs.namespace;
        const cached = this.#openDrivers.get(cacheKey);
        if (cached) {
            cached.refs++;
            return new StorageManager(new StorageDriverHandle(cached.driver, () => this.#release(cacheKey)));
        }

        // Filesystem path — full detection, migration, driver.json
        if (dataNs instanceof DatafileRoot) {
            return this.#openFilesystem(cacheKey, dataNs);
        }

        // Non-filesystem path — simple create, no detection/migration
        return this.#openSimple(cacheKey, dataNs);
    }

    async #openFilesystem(cacheKey: string, root: DatafileRoot) {
        const fs = this.#environment.get(Filesystem);
        const dir = root.directory;
        const namespace = root.namespace;

        // Detect existing driver
        let descriptor = await this.#readDescriptor(dir);
        let detectedKind: string | undefined;

        if (descriptor) {
            detectedKind = descriptor.kind;
        } else if (await this.#hasLegacyFileData(dir)) {
            // Directory exists with data files but no driver.json → legacy file driver
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

        // Create the driver — pass root so it can acquire a ref-counted lock
        const storage = await impl.create(root, descriptor);

        try {
            // Write driver.json if the directory exists after creation (before initialize, so we persist intent)
            if (await dir.exists()) {
                await this.#writeDescriptor(dir, descriptor);
            }

            this.#openDrivers.set(cacheKey, { driver: storage, refs: 1 });

            const manager = new StorageManager(new StorageDriverHandle(storage, () => this.#release(cacheKey)));
            await manager.initialize();
            return manager;
        } catch (e) {
            try {
                await storage.close();
            } catch (closeError) {
                logger.warn("Error closing storage after failed initialization:", closeError);
            }
            throw e;
        }
    }

    async #openSimple(cacheKey: string, dataNs: DataNamespace) {
        const targetKind = this.#configuredDriver ?? this.#defaultDriver;
        const descriptor: StorageDriver.Descriptor = { kind: targetKind };

        const impl = this.#drivers.get(targetKind);
        if (!impl) {
            throw new NoProviderError(`No storage driver registered for "${targetKind}"`);
        }

        const storage = await impl.create(dataNs, descriptor);

        try {
            this.#openDrivers.set(cacheKey, { driver: storage, refs: 1 });

            const manager = new StorageManager(new StorageDriverHandle(storage, () => this.#release(cacheKey)));
            await manager.initialize();
            return manager;
        } catch (e) {
            try {
                await storage.close();
            } catch (closeError) {
                logger.warn("Error closing storage after failed initialization:", closeError);
            }
            throw e;
        }
    }

    async #release(cacheKey: string) {
        const cached = this.#openDrivers.get(cacheKey);
        if (!cached) {
            return;
        }
        cached.refs--;
        if (cached.refs <= 0) {
            this.#openDrivers.delete(cacheKey);
            await cached.driver.close();
        }
    }

    /**
     * Close storage for a namespace previously opened with {@link open}.
     *
     * Locking is now managed by the drivers themselves via ref-counted {@link DatafileRoot.Lock}s, so this method is a
     * no-op retained for backward compatibility.
     */
    async close(_namespace: string) {
        // No-op — drivers acquire/release locks via their own lifecycle
    }

    /**
     * The root filesystem path for storage, or a placeholder if no filesystem is available.
     */
    get location(): string {
        if (this.#environment.has(Filesystem)) {
            return this.#environment.get(Filesystem).path;
        }
        return "(off filesystem)";
    }

    [Diagnostic.value]() {
        return [
            "Persistence",
            Diagnostic.dict({
                location: this.location,
                available: this.#drivers.size > 0,
            }),
        ];
    }

    async #hasLegacyFileData(dir: Directory): Promise<boolean> {
        if (!(await dir.exists())) {
            return false;
        }
        const ignoredFiles = StorageDriver.RESERVED_FILENAMES;
        for await (const entry of dir.entries()) {
            if (entry.kind === "file" && !ignoredFiles.has(entry.name)) {
                return true;
            }
        }
        return false;
    }

    async #readDescriptor(dir: Directory): Promise<StorageDriver.Descriptor | undefined> {
        const file = dir.file("driver.json");
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

    async #writeDescriptor(dir: Directory, descriptor: StorageDriver.Descriptor) {
        const file = dir.file("driver.json");
        await file.write(JSON.stringify(descriptor, undefined, 2));
    }

    async #migrate(fs: Filesystem, namespace: string, sourceDir: Directory, fromKind: string, toKind: string) {
        const fromImpl = this.#drivers.get(fromKind);
        const toImpl = this.#drivers.get(toKind);
        if (!fromImpl || !toImpl) {
            logger.warn(`Cannot migrate from "${fromKind}" to "${toKind}": driver not registered`);
            return;
        }

        logger.notice(`Migrating storage "${namespace}" from "${fromKind}" to "${toKind}"`);

        // Phase 1 — Setup: create temp target in .migrations/
        const migrationsDir = fs.directory(".migrations");
        await migrationsDir.mkdir();

        const tempDir = migrationsDir.directory(`${namespace}-new`);
        if (await tempDir.exists()) {
            await tempDir.delete();
        }
        await tempDir.mkdir();

        // Phase 2 — Migrate data
        const fromDescriptor: StorageDriver.Descriptor = { kind: fromKind };
        const toDescriptor: StorageDriver.Descriptor = { kind: toKind };

        try {
            let sourceStorage: StorageDriver | undefined;
            let targetStorage: StorageDriver | undefined;

            try {
                if (fromImpl.preinitialize) {
                    await fromImpl.preinitialize(fs, fromDescriptor);
                }

                sourceStorage = await fromImpl.create(new DatafileRoot(sourceDir), fromDescriptor);
                await sourceStorage.initialize();

                if (toImpl.preinitialize) {
                    await toImpl.preinitialize(fs, toDescriptor);
                }

                targetStorage = await toImpl.create(new DatafileRoot(tempDir), toDescriptor);
                await targetStorage.initialize();

                const result = await StorageMigration.migrate(sourceStorage, targetStorage);

                if (result.success) {
                    logger.info(
                        `Migration complete: ${result.migratedCount} items migrated, ${result.skippedCount} skipped`,
                    );
                } else {
                    logger.warn(
                        `Migration had issues: ${result.migratedCount} items migrated, ${result.skippedCount} skipped`,
                    );
                }
            } finally {
                if (targetStorage) {
                    try {
                        await targetStorage.close();
                    } catch (e) {
                        logger.warn("Error closing target storage during migration:", e);
                    }
                }
                if (sourceStorage) {
                    try {
                        await sourceStorage.close();
                    } catch (e) {
                        logger.warn("Error closing source storage during migration:", e);
                    }
                }
            }

            // Phase 3 — Metadata: write driver.json to temp dir
            await this.#writeDescriptor(tempDir, toDescriptor);

            // Phase 4 — Swap: rename source → backup, temp → namespace
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            const backupDir = migrationsDir.directory(`${namespace}-old-${fromKind}-${ts}`);
            await sourceDir.rename(backupDir.path);
            await tempDir.rename(fs.directory(namespace).path);
        } catch (e) {
            try {
                await tempDir.delete();
            } catch (cleanupError) {
                logger.warn("Error cleaning up migration temp directory:", cleanupError);
            }
            throw e;
        }
    }
}
