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
import { MaybePromise } from "../util/Promises.js";
import { type BaseStorageDriver, type StorageType } from "./BaseStorageDriver.js";
import { BlobStorageDriver } from "./BlobStorageDriver.js";
import { DataNamespace } from "./DataNamespace.js";
import { DatafileRoot } from "./DatafileRoot.js";
import { StorageDriver, StorageError } from "./StorageDriver.js";
import { StorageDriverHandle } from "./StorageDriverHandle.js";
import { StorageManager } from "./StorageManager.js";
import { StorageMigration } from "./StorageMigration.js";

const logger = Logger.get("StorageService");

/**
 * Handle returned by {@link StorageService.openBlobStorage}.
 */
export interface BlobStorageHandle {
    readonly driver: BlobStorageDriver;
    close(): Promise<void>;
}

/**
 * Service adapter for the Matter.js storage API.
 */
export class StorageService {
    #drivers = new Map<string, StorageDriver.Implementation<StorageDriver.Descriptor>>();
    #defaultDriver = "wal";
    #configuredDriver?: string;
    #environment: Environment;
    #openDrivers = new Map<string, { driver: StorageDriver; refs: number }>();

    #blobDrivers = new Map<string, BlobStorageDriver.Implementation<BlobStorageDriver.Descriptor>>();
    #defaultBlobDriver = "dir";
    #configuredBlobDriver?: string;
    #openBlobDrivers = new Map<string, { driver: BlobStorageDriver; refs: number }>();

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
     * Register a blob driver implementation so that it can be resolved by id.
     */
    registerBlobDriver(impl: BlobStorageDriver.Implementation<BlobStorageDriver.Descriptor>) {
        this.#blobDrivers.set(impl.id, impl);
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
     * Set the default blob driver id used when no existing blob storage is detected.
     */
    set defaultBlobDriver(id: string) {
        this.#defaultBlobDriver = id;
    }

    get defaultBlobDriver() {
        return this.#defaultBlobDriver;
    }

    /**
     * Set the explicitly configured blob driver id (e.g. from user configuration).  When set, takes precedence over
     * detected or default blob driver.
     */
    set configuredBlobDriver(id: string | undefined) {
        this.#configuredBlobDriver = id;
    }

    get configuredBlobDriver() {
        return this.#configuredBlobDriver;
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

        const dataNs = this.#resolveNamespace(namespace);
        const cacheKey = dataNs.namespace;

        // Guard: namespace must not be opened as both KV and blob storage
        if (this.#openBlobDrivers.has(`blob:${cacheKey}`)) {
            throw new StorageError(`Namespace "${cacheKey}" is already open as blob storage`);
        }

        const cached = this.#openDrivers.get(cacheKey);
        if (cached) {
            cached.refs++;
            const manager = new StorageManager(new StorageDriverHandle(cached.driver, () => this.#release(cacheKey)));
            await manager.initialize();
            return manager;
        }

        // Filesystem path — full detection, migration, driver.json
        if (dataNs instanceof DatafileRoot) {
            return this.#openFilesystem(cacheKey, dataNs);
        }

        // Non-filesystem path — simple create, no detection/migration
        return this.#openSimple(cacheKey, dataNs);
    }

    /**
     * Resolve a namespace string or object into a {@link DataNamespace}.  When a string is given,
     * creates a {@link DatafileRoot} if a {@link Filesystem} is available, otherwise a plain
     * {@link DataNamespace}.
     */
    #resolveNamespace(namespace: string | DataNamespace): DataNamespace {
        if (typeof namespace === "string") {
            if (this.#environment.has(Filesystem)) {
                const fs = this.#environment.get(Filesystem);
                return new DatafileRoot(fs.directory(namespace));
            }
            return new DataNamespace(namespace);
        }
        return namespace;
    }

    async #openFilesystem(cacheKey: string, root: DatafileRoot) {
        const fs = this.#environment.get(Filesystem);
        const dir = root.directory;
        const namespace = root.namespace;

        // Detect existing driver
        let descriptor = await this.#readDescriptor(dir);
        let detectedKind: string | undefined;

        if (descriptor) {
            if (descriptor.type === "blob") {
                throw new StorageError(`Namespace "${namespace}" contains blob storage, not KV storage`);
            }
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
            descriptor = { kind: targetKind, type: "kv" };
        } else if (descriptor.type === undefined) {
            descriptor = { ...descriptor, type: "kv" };
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
        const descriptor: StorageDriver.Descriptor = { kind: targetKind, type: "kv" };

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
     * Open blob storage.  The storage is initialized and returned directly (no StorageManager wrapper).
     *
     * For filesystem namespaces, the blob driver type is persisted in `driver.json` with `type: "blob"`.
     * Detection logic:
     * - `driver.json` exists with `kind` → use that driver (explicit)
     * - No `driver.json` but directory exists → legacy implicit "file" (data from WAL or old file driver)
     * - No `driver.json`, no directory → fresh namespace, use default blob driver
     *
     * @param namespace a unique namespace identifier (string) or a pre-built {@link DataNamespace}/{@link DatafileRoot}
     */
    async openBlobStorage(namespace: string | DataNamespace): Promise<BlobStorageHandle> {
        if (this.#blobDrivers.size === 0) {
            throw new NoProviderError("Blob storage is unavailable because no blob drivers are registered");
        }

        const dataNs = this.#resolveNamespace(namespace);
        const nsKey = dataNs.namespace;
        const cacheKey = `blob:${nsKey}`;

        // Guard: namespace must not be opened as both KV and blob storage
        if (this.#openDrivers.has(nsKey)) {
            throw new StorageError(`Namespace "${nsKey}" is already open as KV storage`);
        }

        const cached = this.#openBlobDrivers.get(cacheKey);
        if (cached) {
            cached.refs++;
            return { driver: cached.driver, close: () => this.#releaseBlobDriver(cacheKey) };
        }

        // For filesystem namespaces, detect existing blob driver from driver.json
        if (dataNs instanceof DatafileRoot) {
            return this.#openBlobFilesystem(cacheKey, dataNs);
        }

        // Non-filesystem: simple create with default blob driver
        return this.#openBlobSimple(cacheKey, dataNs);
    }

    async #openBlobFilesystem(cacheKey: string, root: DatafileRoot): Promise<BlobStorageHandle> {
        const dir = root.directory;

        // Detect existing blob driver from driver.json
        let descriptor = await this.#readDescriptor(dir);
        let detectedKind: string | undefined;

        if (descriptor) {
            if (descriptor.type === "kv") {
                throw new StorageError(`Namespace "${root.namespace}" contains KV storage, not blob storage`);
            }
            detectedKind = descriptor.kind;
        } else if (await dir.exists()) {
            // Directory exists but no driver.json → detect layout from directory contents
            const blobsSubDir = dir.directory("blobs");
            if (await blobsSubDir.exists()) {
                // Has a blobs/ subdirectory → WAL blob layout
                detectedKind = "wal";
            } else {
                // Flat files → legacy file driver blob layout
                detectedKind = "file";
            }
        }

        const targetKind = this.#configuredBlobDriver ?? detectedKind ?? this.#defaultBlobDriver;

        // Migrate blob data if the detected driver differs from the target
        if (detectedKind !== undefined && detectedKind !== targetKind) {
            await this.#migrateBlob(root, dir, detectedKind, targetKind);
            descriptor = await this.#readDescriptor(dir);
        }

        const impl = this.#blobDrivers.get(targetKind);
        if (!impl) {
            throw new NoProviderError(`No blob storage driver registered for "${targetKind}"`);
        }

        if (!descriptor) {
            descriptor = { kind: targetKind, type: "blob" };
        }

        if (impl.preinitialize) {
            const fs = this.#environment.get(Filesystem);
            await impl.preinitialize(fs, descriptor);
        }

        const storage = await impl.create(root, descriptor);

        try {
            await storage.initialize();

            // Write driver.json so future opens know which blob driver is in use
            if (await dir.exists()) {
                await this.#writeDescriptor(dir, { kind: targetKind, type: "blob" });
            }

            this.#openBlobDrivers.set(cacheKey, { driver: storage, refs: 1 });
            return { driver: storage, close: () => this.#releaseBlobDriver(cacheKey) };
        } catch (e) {
            try {
                await storage.close();
            } catch (closeError) {
                logger.warn("Error closing blob storage after failed initialization:", closeError);
            }
            throw e;
        }
    }

    async #openBlobSimple(cacheKey: string, dataNs: DataNamespace): Promise<BlobStorageHandle> {
        const targetBlobKind = this.#configuredBlobDriver ?? this.#defaultBlobDriver;
        const impl = this.#blobDrivers.get(targetBlobKind);
        if (!impl) {
            throw new NoProviderError(`No blob storage driver registered for "${targetBlobKind}"`);
        }

        const descriptor: BlobStorageDriver.Descriptor = { kind: targetBlobKind, type: "blob" };
        const storage = await impl.create(dataNs, descriptor);

        try {
            await storage.initialize();

            this.#openBlobDrivers.set(cacheKey, { driver: storage, refs: 1 });
            return { driver: storage, close: () => this.#releaseBlobDriver(cacheKey) };
        } catch (e) {
            try {
                await storage.close();
            } catch (closeError) {
                logger.warn("Error closing blob storage after failed initialization:", closeError);
            }
            throw e;
        }
    }

    async #releaseBlobDriver(cacheKey: string) {
        const cached = this.#openBlobDrivers.get(cacheKey);
        if (!cached) {
            return;
        }
        cached.refs--;
        if (cached.refs <= 0) {
            this.#openBlobDrivers.delete(cacheKey);
            await cached.driver.close();
        }
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

        await this.#migrateStorage({
            label: "storage",
            storageType: "kv",
            fs,
            namespace,
            sourceDir,
            fromKind,
            toKind,
            createSource: async (root, descriptor) => fromImpl.create(root, descriptor),
            createTarget: async (root, descriptor) => toImpl.create(root, descriptor),
            preinitializeSource: fromImpl.preinitialize?.bind(fromImpl),
            preinitializeTarget: toImpl.preinitialize?.bind(toImpl),
        });
    }

    async #migrateBlob(root: DatafileRoot, sourceDir: Directory, fromKind: string, toKind: string) {
        const fromImpl = this.#blobDrivers.get(fromKind);
        const toImpl = this.#blobDrivers.get(toKind);
        if (!fromImpl || !toImpl) {
            logger.warn(`Cannot migrate blob storage from "${fromKind}" to "${toKind}": driver not registered`);
            return;
        }

        await this.#migrateStorage({
            label: "blob storage",
            storageType: "blob",
            fs: this.#environment.get(Filesystem),
            namespace: root.namespace,
            sourceDir,
            fromKind,
            toKind,
            createSource: async (r, descriptor) => {
                const storage = await fromImpl.create(r, descriptor);
                await storage.initialize();
                return storage;
            },
            createTarget: async (r, descriptor) => {
                const storage = await toImpl.create(r, descriptor);
                await storage.initialize();
                return storage;
            },
            preinitializeSource: fromImpl.preinitialize?.bind(fromImpl),
            preinitializeTarget: toImpl.preinitialize?.bind(toImpl),
        });
    }

    async #migrateStorage(args: {
        label: string;
        storageType: StorageType;
        fs: Filesystem;
        namespace: string;
        sourceDir: Directory;
        fromKind: string;
        toKind: string;
        createSource: (root: DatafileRoot, descriptor: StorageDriver.Descriptor) => Promise<BaseStorageDriver>;
        createTarget: (root: DatafileRoot, descriptor: StorageDriver.Descriptor) => Promise<BaseStorageDriver>;
        preinitializeSource?: (parentDir: Directory, descriptor: StorageDriver.Descriptor) => MaybePromise<void>;
        preinitializeTarget?: (parentDir: Directory, descriptor: StorageDriver.Descriptor) => MaybePromise<void>;
    }) {
        const { label, storageType, fs, namespace, sourceDir, fromKind, toKind } = args;

        logger.notice(`Migrating ${label} "${namespace}" from "${fromKind}" to "${toKind}"`);

        const migrationsDir = fs.directory(".migrations");
        await migrationsDir.mkdir();

        const tempSuffix = storageType === "blob" ? "-blob-new" : "-new";
        const tempDir = migrationsDir.directory(`${namespace}${tempSuffix}`);
        if (await tempDir.exists()) {
            await tempDir.delete();
        }
        await tempDir.mkdir();

        const fromDescriptor: StorageDriver.Descriptor = { kind: fromKind, type: storageType };
        const toDescriptor: StorageDriver.Descriptor = { kind: toKind, type: storageType };

        try {
            let sourceStorage: BaseStorageDriver | undefined;
            let targetStorage: BaseStorageDriver | undefined;

            try {
                if (args.preinitializeSource) {
                    await args.preinitializeSource(fs, fromDescriptor);
                }
                sourceStorage = await args.createSource(new DatafileRoot(sourceDir), fromDescriptor);

                if (args.preinitializeTarget) {
                    await args.preinitializeTarget(fs, toDescriptor);
                }
                targetStorage = await args.createTarget(new DatafileRoot(tempDir), toDescriptor);

                const result = await StorageMigration.migrate(sourceStorage, targetStorage);

                const skipNote =
                    result.otherTypeKeysSkipped > 0 ? `, ${result.otherTypeKeysSkipped} non-matching keys skipped` : "";
                if (result.success) {
                    logger.info(
                        `${label} migration complete: ${result.migratedCount} migrated, ${result.skippedCount} skipped${skipNote}`,
                    );
                } else {
                    logger.warn(
                        `${label} migration had issues: ${result.migratedCount} migrated, ${result.skippedCount} skipped${skipNote}`,
                    );
                }
            } finally {
                if (targetStorage) {
                    try {
                        await targetStorage.close();
                    } catch (e) {
                        logger.warn(`Error closing target ${label} during migration:`, e);
                    }
                }
                if (sourceStorage) {
                    try {
                        await sourceStorage.close();
                    } catch (e) {
                        logger.warn(`Error closing source ${label} during migration:`, e);
                    }
                }
            }

            await this.#writeDescriptor(tempDir, toDescriptor);

            // Swap: source → backup, temp → namespace
            const sourcePath = sourceDir.path;
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            const backupSuffix = storageType === "blob" ? `-old-blob-${fromKind}-${ts}` : `-old-${fromKind}-${ts}`;
            const backupDir = migrationsDir.directory(`${namespace}${backupSuffix}`);
            await fs.directory(sourcePath).rename(backupDir.path);
            await tempDir.rename(sourcePath);
        } catch (e) {
            try {
                await tempDir.delete();
            } catch (cleanupError) {
                logger.warn(`Error cleaning up ${label} migration temp directory:`, cleanupError);
            }
            throw e;
        }
    }
}
