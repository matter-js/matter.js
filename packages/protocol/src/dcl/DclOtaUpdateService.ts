/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PersistedFileDesignator } from "#bdx/PersistedFileDesignator.js";
import { ScopedStorage } from "#bdx/ScopedStorage.js";
import { DclErrorCodes } from "#dcl/DclRestApiTypes.js";
import {
    Construction,
    Crypto,
    Diagnostic,
    Environment,
    Environmental,
    HashAlgorithm,
    HashFipsAlgorithmId,
    ImplementationError,
    Logger,
    MatterError,
    Minutes,
    StorageContext,
    StorageManager,
    StorageService,
} from "#general";
import { DeviceSoftwareVersionModelDclSchema, VendorId } from "#types";
import { OtaImageReader } from "../ota/OtaImageReader.js";
import { DclClient, MatterDclError, MatterDclResponseError } from "./DclClient.js";

const logger = Logger.get("DclOtaUpdateService");

/** Error thrown when OTA update check or download fails */
export class OtaUpdateError extends MatterError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

export type OtaUpdateSource = "local" | "dcl-prod" | "dcl-test";

export type OtaStorageMode = "prod" | "test" | "local";

export interface DeviceSoftwareVersionModelDclSchemaWithSource extends DeviceSoftwareVersionModelDclSchema {
    source: OtaUpdateSource;
}

/**
 * Update information returned by checkForUpdate.
 * This is an alias for the DCL schema to provide better semantic meaning.
 */
export type OtaUpdateInfo = DeviceSoftwareVersionModelDclSchemaWithSource;

const OTA_DOWNLOAD_TIMEOUT = Minutes(5);

const OTA_FILENAME_REGEX = /^[0-9a-f]+[./][0-9a-f]+[./](?:prod|test|local)(?:[./]\d+)?$/i;

/**
 * Service to query and manage OTA updates from the Distributed Compliance Ledger (DCL), but also allows to inject own
 * OTA update info from streams or files. The service is designed as a singleton within an Environment and is shared
 * across multiple nodes. This service is mainly relevant for controllers.
 *
 * The service checks the DCL for available software updates for Matter devices and can download and validate OTA
 * images. Production and test DCL instances are supported, with separate file storage for each.
 */
export class DclOtaUpdateService {
    readonly #construction: Construction<DclOtaUpdateService>;
    readonly #crypto: Crypto;
    #storageManager?: StorageManager;
    #storage?: ScopedStorage;

    get construction() {
        return this.#construction;
    }

    constructor(environment: Environment) {
        environment.set(DclOtaUpdateService, this);
        this.#crypto = environment.get(Crypto);

        // THe construction is async and will be enforced when needed
        this.#construction = Construction(this, async () => {
            this.#storageManager = await environment.get(StorageService).open("ota");
            this.#storage = new ScopedStorage(this.#storageManager.createContext("bin"), "ota");
            await this.#migrateStorage();
        });
    }

    static [Environmental.create](env: Environment) {
        return new DclOtaUpdateService(env);
    }

    get storage() {
        this.construction.assert();
        return this.#storage!;
    }

    async close() {
        await this.#storageManager?.close();
    }

    async #migrateStorage() {
        const storage = this.#storage!;
        const context = storage.context;

        for (const vendorHex of await context.contexts()) {
            const vendorContext = context.createContext(vendorHex);
            for (const productHex of await vendorContext.contexts()) {
                const productContext = vendorContext.createContext(productHex);
                const keys = await productContext.keys();

                for (const key of keys) {
                    if (key !== "prod" && key !== "test") {
                        continue; // Not an old-format key
                    }

                    try {
                        // Read the old file to get the software version from the OTA header
                        const blob = await productContext.openBlob(key);
                        const reader = blob.stream().getReader();
                        const header = await OtaImageReader.header(reader);
                        const versionKey = header.softwareVersion.toString();

                        // Write to new location: mode sub-context + version key
                        const modeContext = productContext.createContext(key);
                        const newBlob = await productContext.openBlob(key);
                        await modeContext.writeBlobFromStream(versionKey, newBlob.stream());

                        // Delete old bare key
                        await productContext.delete(key);

                        logger.info(
                            `Migrated OTA storage: ${vendorHex}.${productHex}.${key} -> ${vendorHex}.${productHex}.${key}.${versionKey}`,
                        );
                    } catch (error) {
                        logger.warn(
                            `Failed to migrate OTA file ${vendorHex}.${productHex}.${key}, deleting corrupt entry:`,
                            error,
                        );
                        try {
                            await productContext.delete(key);
                        } catch {
                            // Ignore cleanup errors
                        }
                    }
                }
            }
        }
    }

    async #queryDclForUpdate(options: {
        vendorId: number;
        productId: number;
        currentSoftwareVersion: number;
        includeStoredUpdates?: boolean;
        isProduction: boolean;
        targetSoftwareVersion?: number;
    }) {
        const { vendorId, productId, currentSoftwareVersion, isProduction, targetSoftwareVersion } = options;

        const dclClient = new DclClient(isProduction);
        const dclLogStr = isProduction ? "Prod-DCL" : "Test-DCL";

        const diagnosticInfo = {
            vid: vendorId,
            pid: productId,
            prod: isProduction,
            current: currentSoftwareVersion,
        };

        try {
            // If a specific target version is requested, check only that version
            if (targetSoftwareVersion !== undefined) {
                logger.debug(
                    `Checking update in ${dclLogStr} for specific version`,
                    Diagnostic.dict({
                        ...diagnosticInfo,
                        target: targetSoftwareVersion,
                    }),
                );
                return await this.#checkSpecificVersion(
                    dclClient,
                    vendorId,
                    productId,
                    targetSoftwareVersion,
                    currentSoftwareVersion,
                );
            }

            // Otherwise, get all available versions and find the best applicable one
            const softwareVersions = await dclClient.fetchModelVersionsByVidPid(vendorId, productId);

            // Filter for versions higher than the current, sort to check the highest version number first
            const newerVersions = softwareVersions
                .filter(version => version > currentSoftwareVersion)
                .sort((a, b) => b - a);

            if (newerVersions.length === 0) {
                logger.debug(`No newer versions available in ${dclLogStr}`, Diagnostic.dict(diagnosticInfo));
                return;
            }

            logger.debug(
                `Found ${newerVersions.length} newer version(s) in ${dclLogStr}`,
                Diagnostic.dict(diagnosticInfo),
            );

            // Check each version starting from highest, find the first applicable one
            for (const version of newerVersions) {
                try {
                    const updateInfo = await this.#checkSpecificVersion(
                        dclClient,
                        vendorId,
                        productId,
                        version,
                        currentSoftwareVersion,
                    );
                    if (updateInfo !== undefined) {
                        logger.info(
                            `Update available in ${dclLogStr}`,
                            Diagnostic.dict({ new: version, ...diagnosticInfo }),
                        );
                        return updateInfo;
                    }
                } catch (error) {
                    MatterDclError.accept(error);
                    logger.info(`Failed to check for update for VID: ${vendorId}, PID: ${productId}: ${error.message}`);
                }
            }

            logger.debug(`No applicable updates found in ${dclLogStr}`, Diagnostic.dict(diagnosticInfo));
        } catch (error) {
            MatterDclError.accept(error);
            if (error instanceof MatterDclResponseError && error.response.code === DclErrorCodes.NotFound) {
                logger.debug(`No applicable updates found in ${dclLogStr}`, Diagnostic.dict(diagnosticInfo));
            } else {
                logger.info(`Failed to check for updates for VID: ${vendorId}, PID: ${productId}: ${error.message}`);
            }
        }
    }

    /**
     * Check DCL for available software updates for a device, defined by its vendor ID, product ID, and current
     * software version. If a target software version is provided, only that version is checked for applicability and
     * ignoring other newer versions.
     * If isProduction flag is specified, it is exactly used to find updates. Leave that flag undefined to find both
     * test and production updates.
     */
    async checkForUpdate(options: {
        vendorId: number;
        productId: number;
        currentSoftwareVersion: number;
        includeStoredUpdates?: boolean;
        isProduction?: boolean;
        targetSoftwareVersion?: number;
    }): Promise<DeviceSoftwareVersionModelDclSchemaWithSource | undefined> {
        const {
            vendorId,
            productId,
            currentSoftwareVersion,
            includeStoredUpdates = false,
            isProduction,
            targetSoftwareVersion,
        } = options;

        const foundUpdates = new Array<DeviceSoftwareVersionModelDclSchemaWithSource>();

        // Check for local updates if allowed
        if (includeStoredUpdates) {
            const localUpdates = await this.find({
                vendorId,
                productId,
                isProduction,
                currentVersion: currentSoftwareVersion,
            });
            if (localUpdates.length) {
                const localUpdate: DeviceSoftwareVersionModelDclSchemaWithSource = {
                    ...localUpdates[0],
                    vid: VendorId(vendorId),
                    pid: productId,
                    cdVersionNumber: 0,
                    softwareVersionValid: true,
                    schemaVersion: 1,
                    minApplicableSoftwareVersion: localUpdates[0].minApplicableSoftwareVersion ?? 0,
                    maxApplicableSoftwareVersion:
                        localUpdates[0].maxApplicableSoftwareVersion ?? localUpdates[0].softwareVersion - 1,
                    source:
                        localUpdates[0].mode === "prod"
                            ? "dcl-prod"
                            : localUpdates[0].mode === "test"
                              ? "dcl-test"
                              : "local",
                };
                if (
                    localUpdate.softwareVersion > currentSoftwareVersion &&
                    currentSoftwareVersion >= localUpdate.minApplicableSoftwareVersion &&
                    currentSoftwareVersion <= localUpdate.maxApplicableSoftwareVersion
                ) {
                    logger.debug(`Found applicable local update`, Diagnostic.dict(localUpdate));
                    if (targetSoftwareVersion !== undefined && localUpdate.softwareVersion === targetSoftwareVersion) {
                        return localUpdate;
                    }
                    foundUpdates.push(localUpdate);
                }
            }
        }

        // Check for Prod DCL updates
        if (isProduction !== false) {
            const prodUpdate = await this.#queryDclForUpdate({ ...options, isProduction: true });
            if (prodUpdate !== undefined) {
                const updateEntry: DeviceSoftwareVersionModelDclSchemaWithSource = {
                    ...prodUpdate,
                    source: "dcl-prod",
                };
                if (targetSoftwareVersion !== undefined && updateEntry.softwareVersion === targetSoftwareVersion) {
                    return updateEntry;
                }
                foundUpdates.push(updateEntry);
            }
        }

        // Check for Test DCL updates
        if (isProduction !== true) {
            const testUpdate = await this.#queryDclForUpdate({ ...options, isProduction: false });
            if (testUpdate !== undefined) {
                const updateEntry: DeviceSoftwareVersionModelDclSchemaWithSource = {
                    ...testUpdate,
                    source: "dcl-test",
                };
                if (targetSoftwareVersion !== undefined && updateEntry.softwareVersion === targetSoftwareVersion) {
                    return updateEntry;
                }
                foundUpdates.push(updateEntry);
            }
        }

        // The logic above would have found the update already when it would match that version, so no update found
        if (targetSoftwareVersion !== undefined || !foundUpdates.length) {
            return;
        }

        // Sort for versions, highest version number first
        foundUpdates.sort((a, b) => b.softwareVersion - a.softwareVersion);
        return foundUpdates[0];
    }

    async #verifyUpdate(updateInfo: OtaUpdateInfo, fileDesignator: PersistedFileDesignator) {
        const { otaFileSize, softwareVersion, vid, pid } = updateInfo;

        const storedBlob = await fileDesignator.openBlob();
        const reader = storedBlob.stream().getReader();

        // Validate with full checksum if DCL provided one
        const checksumOptions = updateInfo.otaChecksum
            ? {
                  calculateFullChecksum: true,
                  checksumType: HashFipsAlgorithmId[updateInfo.otaChecksumType ?? 1] as HashAlgorithm,
                  expectedChecksum: updateInfo.otaChecksum,
              }
            : undefined;

        const header = await OtaImageReader.file(reader, this.#crypto, otaFileSize, checksumOptions);

        // Verify that the header matches the expected update
        if (header.vendorId !== vid) {
            throw new OtaUpdateError(`OTA image vendor ID mismatch: expected ${vid}, got ${header.vendorId}`);
        }

        if (header.productId !== pid) {
            throw new OtaUpdateError(`OTA image product ID mismatch: expected ${pid}, got ${header.productId}`);
        }

        if (header.softwareVersion !== softwareVersion) {
            throw new OtaUpdateError(
                `OTA image software version mismatch: expected ${softwareVersion}, got ${header.softwareVersion}`,
            );
        }
    }

    #fileName(vid: number, pid: number, mode: OtaStorageMode, softwareVersion: number) {
        return `${vid.toString(16)}.${pid.toString(16)}.${mode}.${softwareVersion}`;
    }

    /**
     * Clean up old versions in a mode context, keeping only the latest version.
     * Only applies to "prod" and "test" modes. "local" mode files are user-managed.
     */
    async #cleanupOldVersions(vid: number, pid: number, mode: OtaStorageMode, keepVersion: number) {
        if (mode === "local") {
            return; // Never auto-delete user-added files
        }

        if (this.#storage === undefined) {
            return;
        }

        const modeContext = this.#storage.context
            .createContext(vid.toString(16))
            .createContext(pid.toString(16))
            .createContext(mode);

        const versionKeys = await modeContext.keys();
        for (const versionKey of versionKeys) {
            const version = parseInt(versionKey, 10);
            if (isNaN(version) || version === keepVersion) {
                continue;
            }

            try {
                await modeContext.delete(versionKey);
                logger.debug(
                    `Cleaned up old OTA version: ${vid.toString(16)}.${pid.toString(16)}.${mode}.${versionKey}`,
                );
            } catch (error) {
                logger.warn(`Failed to clean up old OTA version ${versionKey}:`, error);
            }
        }
    }

    /**
     * Store an OTA update image from a ReadableStream into persistent storage.
     */
    async store(
        stream: ReadableStream<Uint8Array>,
        updateInfo: OtaUpdateInfo,
        // TODO: Change default to "local" on next breaking release
        mode: boolean | OtaStorageMode = true,
    ) {
        if (this.#storage === undefined) {
            await this.construction;
        }
        const storage = this.#storage!;

        if (typeof mode === "boolean") {
            mode = mode ? "prod" : "test";
        }

        const { softwareVersion, softwareVersionString, vid, pid } = updateInfo;

        const filename = this.#fileName(vid, pid, mode, softwareVersion);
        const fileDesignator = new PersistedFileDesignator(filename, storage);

        const diagnosticInfo = {
            filename,
            vid,
            pid,
            v: `${softwareVersion} (${softwareVersionString})`,
            mode,
        };

        try {
            // Write to storage using streaming via PersistedFileDesignator
            await fileDesignator.writeFromStream(stream);

            // Read back from storage and validate (including full file checksum if provided by DCL)
            await this.#verifyUpdate(updateInfo, fileDesignator);

            logger.debug(`Stored OTA image`, Diagnostic.dict(diagnosticInfo));

            // Clean up old versions for DCL modes (not local)
            await this.#cleanupOldVersions(vid, pid, mode, softwareVersion);

            return fileDesignator;
        } catch (error) {
            // Clean up on error
            try {
                await fileDesignator.delete();
            } catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Download and validate an OTA update image from a HTTP pr HTTPS server.
     *
     * If a file with the same vendor ID, product ID, and production mode already exists
     * and passes validation, it will be reused instead of downloading again, unless force is true.
     *
     * Production and test files are stored separately to avoid conflicts.
     *
     * Returns a PersistedFileDesignator for the validated OTA image
     */
    async downloadUpdate(updateInfo: OtaUpdateInfo, force = false, timeout = OTA_DOWNLOAD_TIMEOUT) {
        if (this.#storage === undefined) {
            await this.construction;
        }
        const storage = this.#storage!;

        const { otaUrl, softwareVersion, softwareVersionString, vid, pid, source } = updateInfo;
        const mode: OtaStorageMode = source === "dcl-prod" ? "prod" : source === "dcl-test" ? "test" : "local";

        const diagnosticInfo = {
            vid,
            pid,
            v: `${softwareVersion} (${softwareVersionString})`,
            mode,
        };

        const filename = this.#fileName(vid, pid, mode, softwareVersion);
        const fileDesignator = new PersistedFileDesignator(filename, storage);

        if (await fileDesignator.exists()) {
            if (!force) {
                // File exists, and we do not force to overwrite it, validate it
                try {
                    await this.#verifyUpdate(updateInfo, fileDesignator);
                    logger.info(`Existing OTA image validated successfully`, Diagnostic.dict(diagnosticInfo));
                    return fileDesignator;
                } catch (error) {
                    logger.info(`Existing OTA image validation failed, Re-downloading ...`, error);
                }
            }

            await fileDesignator.delete();
        }

        if (!otaUrl?.trim()) {
            throw new OtaUpdateError("No OTA URL provided in update info");
        }

        // Validate protocol
        let url: URL;
        try {
            url = new URL(otaUrl);
        } catch {
            throw new OtaUpdateError(`Invalid OTA URL: ${otaUrl}`);
        }

        const protocol = url.protocol.toLowerCase();
        if (protocol !== "https:" && protocol !== "http:") {
            throw new OtaUpdateError(
                `Unsupported protocol "${protocol}" in OTA URL. Only "https:", "http:" are supported`,
            );
        }

        logger.info(`Downloading OTA image from ${otaUrl}`, Diagnostic.dict(diagnosticInfo));

        try {
            // Download or load the OTA image
            const response = await fetch(otaUrl, {
                method: "GET",
                signal: AbortSignal.timeout(timeout),
            });

            if (!response.ok) {
                throw new OtaUpdateError(`Failed to download OTA image: ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new OtaUpdateError("No response body received");
            }

            return await this.store(response.body, updateInfo, mode);
        } catch (error) {
            MatterError.reject(error);
            const otaError = new OtaUpdateError(`Failed to download OTA image from ${otaUrl}`);
            otaError.cause = error;
            throw otaError;
        }
    }

    /**
     * Check a specific software version for applicability.
     *
     * @param dclClient - DCL client to use for fetching
     * @param vendorId - Vendor ID of the device
     * @param productId - Product ID of the device
     * @param softwareVersion - The specific version to check
     * @param currentVersion - Current software version of the device
     * @returns Update information if the version is applicable, undefined otherwise
     */
    async #checkSpecificVersion(
        dclClient: DclClient,
        vendorId: number,
        productId: number,
        softwareVersion: number,
        currentVersion: number,
    ) {
        const versionInfo = await dclClient.fetchModelVersionByVidPidSoftwareVersion(
            vendorId,
            productId,
            softwareVersion,
        );

        // Verify that the returned version matches the requested version
        if (versionInfo.softwareVersion !== softwareVersion) {
            throw new OtaUpdateError(
                `Version mismatch: requested ${softwareVersion}, but DCL returned ${versionInfo.softwareVersion}`,
            );
        }

        // Check if this version is applicable
        if (this.#isVersionApplicable(versionInfo, currentVersion)) {
            logger.debug(
                `Found applicable update: version ${softwareVersion} (${versionInfo.softwareVersionString}) for current version ${currentVersion}`,
            );
            return versionInfo;
        }

        logger.debug(
            `Version ${softwareVersion} is not applicable`,
            Diagnostic.dict({
                valid: versionInfo.softwareVersionValid,
                url: !!versionInfo.otaUrl,
                min: versionInfo.minApplicableSoftwareVersion,
                max: versionInfo.maxApplicableSoftwareVersion,
            }),
        );
    }

    /**
     * Check if a software version is applicable for the current device version.
     */
    #isVersionApplicable(versionInfo: DeviceSoftwareVersionModelDclSchema, currentVersion: number): boolean {
        // Must be marked as valid
        if (!versionInfo.softwareVersionValid) {
            return false;
        }

        // Must have an OTA URL
        if (!versionInfo.otaUrl?.trim()) {
            return false;
        }

        // DCL OTA URLs must use HTTPS protocol for security
        if (!versionInfo.otaUrl.toLowerCase().startsWith("https://")) {
            logger.warn(`Invalid OTA URL from DCL: "${versionInfo.otaUrl}" - must use https:// protocol`);
            return false;
        }

        // The current version must be within the applicable range if specified
        if (
            versionInfo.minApplicableSoftwareVersion !== undefined &&
            currentVersion < versionInfo.minApplicableSoftwareVersion
        ) {
            return false;
        }

        if (
            versionInfo.maxApplicableSoftwareVersion !== undefined &&
            currentVersion > versionInfo.maxApplicableSoftwareVersion
        ) {
            return false;
        }

        return true;
    }

    /**
     * Create OtaUpdateInfo from an OTA image stream.
     *
     * This method reads and validates an OTA image from a ReadableStream and creates an OtaUpdateInfo
     * structure. This is useful for providing OTA updates from local files or any stream source.
     *
     * The OTA image header contains most required information. However, some DCL-specific
     * fields are not present in the OTA header and must be provided via options or use defaults:
     * - cdVersionNumber: Certificate Declaration version (defaults to 1)
     * - softwareVersionValid: Validity flag (defaults to true)
     * - schemaVersion: DCL schema version (defaults to 0)
     * - minApplicableSoftwareVersion: If not in header, defaults to 0 (all versions)
     * - maxApplicableSoftwareVersion: If not in header, defaults to current version minus 1
     *
     * @param stream - ReadableStream of the OTA image
     * @param otaUrl - URL to use for the OTA file (should be file:// for local files or https:// for remote)
     * @param options - Optional parameters for DCL-specific fields not in OTA header
     * @returns OtaUpdateInfo with stream data and header information
     */
    async updateInfoFromStream(
        stream: ReadableStream<Uint8Array>,
        otaUrl: string,
        options?: {
            /** Certificate Declaration version number. Defaults to 1. */
            cdVersionNumber?: number;
            /** Whether this version is valid. Defaults to true. */
            softwareVersionValid?: boolean;
            /** DCL schema version. Defaults to 0. */
            schemaVersion?: number;
            /**
             * Minimum applicable software version. If not provided and not in OTA header,
             * defaults to 0 (applicable to all versions).
             */
            minApplicableSoftwareVersion?: number;
            /**
             * Maximum applicable software version. If not provided and not in OTA header,
             * defaults to current version (only applicable to current version and below).
             */
            maxApplicableSoftwareVersion?: number;
        },
    ) {
        // Read and validate the OTA image header from stream
        const reader = stream.getReader();
        const header = await OtaImageReader.header(reader);

        // Build OtaUpdateInfo from header and options
        const updateInfo: OtaUpdateInfo = {
            vid: VendorId(header.vendorId),
            pid: header.productId,
            softwareVersion: header.softwareVersion,
            softwareVersionString: header.softwareVersionString,
            cdVersionNumber: options?.cdVersionNumber ?? 1,
            softwareVersionValid: options?.softwareVersionValid ?? true,
            otaUrl,
            // Use header values if present, otherwise use provided options or defaults
            minApplicableSoftwareVersion:
                header.minApplicableSoftwareVersion ?? options?.minApplicableSoftwareVersion ?? 0,
            maxApplicableSoftwareVersion:
                header.maxApplicableSoftwareVersion ??
                options?.maxApplicableSoftwareVersion ??
                header.softwareVersion - 1,
            releaseNotesUrl: header.releaseNotesUrl,
            schemaVersion: options?.schemaVersion ?? 0,
            source: "local",
        };

        logger.debug(
            `OTA update info from stream`,
            Diagnostic.dict({
                vid: header.vendorId,
                pid: header.productId,
                v: `${header.softwareVersion} (${header.softwareVersionString})`,
            }),
        );

        return updateInfo;
    }

    /**
     * Create OtaUpdateInfo from a remote OTA image file URL.
     *
     * This method fetches and validates a remote OTA image file (via HTTPS) and creates an OtaUpdateInfo
     * structure that can be used with downloadUpdate(). For local files, use updateInfoFromStream() instead.
     *
     * The OTA image header contains most required information. However, some DCL-specific
     * fields are not present in the OTA header and must be provided via options or use defaults:
     * - cdVersionNumber: Certificate Declaration version (defaults to 1)
     * - softwareVersionValid: Validity flag (defaults to true)
     * - schemaVersion: DCL schema version (defaults to 0)
     * - minApplicableSoftwareVersion: If not in header, defaults to 0 (all versions)
     * - maxApplicableSoftwareVersion: If not in header, defaults to current version
     *
     * @param fileUrl - HTTPS URL to the OTA image file
     * @param options - Optional parameters for DCL-specific fields not in OTA header
     * @returns OtaUpdateInfo with file URL and header data
     */
    async createUpdateInfoFromFile(
        fileUrl: string,
        options?: {
            /** Certificate Declaration version number. Defaults to 1. */
            cdVersionNumber?: number;
            /** Whether this version is valid. Defaults to true. */
            softwareVersionValid?: boolean;
            /** DCL schema version. Defaults to 0. */
            schemaVersion?: number;
            /**
             * Minimum applicable software version. If not provided and not in OTA header,
             * defaults to 0 (applicable to all versions).
             */
            minApplicableSoftwareVersion?: number;
            /**
             * Maximum applicable software version. If not provided and not in OTA header,
             * defaults to current version (only applicable to current version and below).
             */
            maxApplicableSoftwareVersion?: number;
        },
    ) {
        const fileProtocol = fileUrl.split(":")[0].toLowerCase();
        // Validate URL is HTTPS
        if (fileProtocol !== "https" && fileProtocol !== "http") {
            throw new OtaUpdateError(
                `Only HTTP(S) URLs are supported. For local files, use createUpdateInfoFromStream() instead.`,
            );
        }

        try {
            // Fetch and read the OTA image
            const response = await fetch(fileUrl, { method: "GET" });

            if (!response.ok) {
                throw new OtaUpdateError(`Failed to fetch OTA image: ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new OtaUpdateError("No response body received");
            }

            // Use the stream-based method
            return await this.updateInfoFromStream(response.body, fileUrl, options);
        } catch (error) {
            MatterError.reject(error);
            const otaError = new OtaUpdateError(`Failed to read OTA image from ${fileUrl}`);
            otaError.cause = error;
            throw otaError;
        }
    }

    /**
     * Find downloaded OTA updates in storage.
     *
     * This method scans the OTA storage for downloaded update files and returns
     * information about them. Files can be filtered by vendor ID, product ID,
     * and production/test mode.
     *
     * @param options - Optional filter criteria
     * @param options.vendorId - Filter by vendor ID
     * @param options.productId - Filter by product ID (requires vendorId)
     * @param options.isProduction - Filter by production (true) or test (false) mode
     * @returns Array of downloaded update information
     */
    async find(options: DclOtaUpdateService.FindOptions = {}) {
        if (this.#storage === undefined) {
            await this.construction;
        }

        const results = await this.#findEntries(this.#storage!.context, options);

        // Sort by vendor ID, product ID, mode, and version
        results.sort((a, b) => {
            if (a.mode !== b.mode) return a.mode === "prod" ? -1 : 1;
            if (a.vendorId !== b.vendorId) return a.vendorId - b.vendorId;
            if (a.productId !== b.productId) return a.productId - b.productId;
            return a.softwareVersion - b.softwareVersion;
        });

        return results;
    }

    async #findEntries(
        context: StorageContext,
        options: DclOtaUpdateService.FindOptions,
    ): Promise<DclOtaUpdateService.OtaUpdateListEntry[]> {
        const { vendorId } = options;
        if (vendorId !== undefined) {
            const vendorEntries = await this.#findVendorEntries(context.createContext(vendorId.toString(16)), options);
            return vendorEntries.map(entry => ({
                ...entry,
                vendorId,
                filename: this.#fileName(vendorId, entry.productId, entry.mode, entry.softwareVersion),
            }));
        }

        const result = new Array<DclOtaUpdateService.OtaUpdateListEntry>();

        for (const vendorIdHex of await context.contexts()) {
            const vendorId = parseInt(vendorIdHex, 16);
            const vendorEntries = await this.#findVendorEntries(context.createContext(vendorIdHex), options);
            result.push(
                ...vendorEntries.map(entry => ({
                    ...entry,
                    vendorId,
                    filename: this.#fileName(vendorId, entry.productId, entry.mode, entry.softwareVersion),
                })),
            );
        }

        return result;
    }

    async #findVendorEntries(vendorContext: StorageContext, options: DclOtaUpdateService.FindOptions) {
        const { productId } = options;

        if (productId !== undefined) {
            const productEntries = await this.#findVendorProductEntries(
                vendorContext.createContext(productId.toString(16)),
                options,
            );
            return productEntries.map(entry => ({ ...entry, productId }));
        }

        const result = new Array<Omit<DclOtaUpdateService.OtaUpdateListEntry, "vendorId" | "filename">>();

        for (const productIdHex of await vendorContext.contexts()) {
            const productId = parseInt(productIdHex, 16);
            const productEntries = await this.#findVendorProductEntries(
                vendorContext.createContext(productIdHex),
                options,
            );
            result.push(...productEntries.map(entry => ({ ...entry, productId })));
        }

        return result;
    }

    async #findVendorProductEntries(productContext: StorageContext, options: DclOtaUpdateService.FindOptions) {
        const { isProduction, mode: filterMode } = options;

        const result = new Array<Omit<DclOtaUpdateService.OtaUpdateListEntry, "vendorId" | "productId" | "filename">>();

        // New format: enumerate mode sub-contexts
        const modeContexts = await productContext.contexts();
        const validModes: OtaStorageMode[] = ["prod", "test", "local"];

        for (const modeStr of modeContexts) {
            if (!validModes.includes(modeStr as OtaStorageMode)) {
                continue;
            }
            const mode = modeStr as OtaStorageMode;

            // Apply mode/isProduction filters
            if (filterMode !== undefined && filterMode !== mode) {
                continue;
            }
            if (filterMode === undefined && isProduction !== undefined) {
                if (isProduction === true && mode !== "prod") continue;
                if (isProduction === false && mode === "prod") continue;
            }

            const modeContext = productContext.createContext(modeStr);
            const versionKeys = await modeContext.keys();

            for (const versionKey of versionKeys) {
                const fileDesignator = new PersistedFileDesignator(versionKey, modeContext);
                const entry = await this.#checkEntry(fileDesignator, options);
                if (entry !== undefined) {
                    result.push({
                        ...entry,
                        mode,
                    });
                }
            }
        }

        // Legacy support: check for bare "prod"/"test" keys from pre-migration storage.
        // After migration these keys no longer exist, so this is a no-op for migrated storage.
        // Can be removed in a future breaking release.
        for (const legacyKey of ["prod", "test"] as const) {
            if (filterMode !== undefined && filterMode !== legacyKey) continue;
            if (isProduction === true && legacyKey !== "prod") continue;
            if (isProduction === false && legacyKey !== "test") continue;

            if (await productContext.has(legacyKey)) {
                const fileDesignator = new PersistedFileDesignator(legacyKey, productContext);
                const entry = await this.#checkEntry(fileDesignator, options);
                if (entry !== undefined) {
                    result.push({
                        ...entry,
                        mode: legacyKey,
                    });
                }
            }
        }

        return result;
    }

    async #checkEntry(fileDesignator: PersistedFileDesignator, options: DclOtaUpdateService.FindOptions) {
        try {
            // Read header to get software version and size
            const blob = await fileDesignator.openBlob();
            const reader = blob.stream().getReader();

            const header = await OtaImageReader.header(reader);

            const { currentVersion } = options;
            if (currentVersion !== undefined) {
                // The current version must be within the applicable range if specified
                if (
                    header.minApplicableSoftwareVersion !== undefined &&
                    currentVersion < header.minApplicableSoftwareVersion
                ) {
                    return;
                }

                if (
                    header.maxApplicableSoftwareVersion !== undefined &&
                    currentVersion > header.maxApplicableSoftwareVersion
                ) {
                    return;
                }
            }

            return {
                softwareVersion: header.softwareVersion,
                softwareVersionString: header.softwareVersionString,
                minApplicableSoftwareVersion: header.minApplicableSoftwareVersion,
                maxApplicableSoftwareVersion: header.maxApplicableSoftwareVersion,
                size: blob.size,
            };
        } catch (error) {
            logger.warn(`Failed to read OTA file ${fileDesignator.text}:`, error);
        }
    }

    /** Get a PersistedFileDesignator for a stored OTA update file by filename. */
    async fileDesignatorForUpdate(filename: string) {
        if (!OTA_FILENAME_REGEX.test(filename)) {
            throw new ImplementationError(`Invalid OTA filename format: ${filename}`);
        }

        if (this.#storage === undefined) {
            await this.construction;
        }

        const fileDesignator = new PersistedFileDesignator(filename, this.#storage!);
        if (!(await fileDesignator.exists())) {
            throw new OtaUpdateError(`OTA file not found: ${filename}`);
        }

        return fileDesignator;
    }

    /**
     * Delete stored OTA update files.
     *
     * Can delete by specific filename or by vendor ID, product ID, and mode.
     * If only vendor ID is provided (no product ID), all files for that vendor are deleted.
     *
     * @param options - Deletion criteria
     * @param options.filename - Specific filename to delete (supports both old `fff1.8000.prod` and new `fff1.8000.prod.3` formats)
     * @param options.vendorId - Vendor ID to filter files for deletion
     * @param options.productId - Product ID to filter files for deletion (optional, requires vendorId)
     * @param options.isProduction - @deprecated Use mode instead. Production (true) or test (false) mode
     * @param options.mode - Storage mode: "prod", "test", or "local"
     * @returns Number of files deleted
     */
    async delete(options: {
        filename?: string;
        vendorId?: number;
        productId?: number;
        /** @deprecated Use mode instead */
        isProduction?: boolean;
        mode?: OtaStorageMode;
    }) {
        if (this.#storage === undefined) {
            await this.construction;
        }
        const storage = this.#storage!;

        const { vendorId, productId, isProduction } = options;
        let { filename, mode } = options;

        // Backward compat: derive mode from boolean
        if (mode === undefined && isProduction !== undefined) {
            mode = isProduction ? "prod" : "test";
        }

        if (filename !== undefined) {
            // Delete a specific file by name — fileDesignatorForUpdate accepts both old and new formats
            try {
                const fileDesignator = await this.fileDesignatorForUpdate(filename);
                await fileDesignator.delete();
            } catch (error) {
                OtaUpdateError.accept(error);
                // Ignore not found errors
                return 0;
            }
            logger.info(`Deleted OTA file: ${filename}`);
            return 1;
        }

        if (vendorId !== undefined && productId !== undefined && mode !== undefined) {
            // Delete all versions for this vid/pid/mode
            const vendorHex = vendorId.toString(16);
            const productHex = productId.toString(16);
            const modeContext = storage.context.createContext(vendorHex).createContext(productHex).createContext(mode);
            const versionKeys = await modeContext.keys();
            let deletedCount = 0;
            for (const versionKey of versionKeys) {
                const fd = new PersistedFileDesignator(versionKey, modeContext);
                await fd.delete();
                deletedCount++;
            }
            // Also check for legacy bare key (pre-migration format: key "prod"/"test" directly under product context)
            const productContext = storage.context.createContext(vendorHex).createContext(productHex);
            if (await productContext.has(mode)) {
                const fd = new PersistedFileDesignator(mode, productContext);
                await fd.delete();
                deletedCount++;
            }
            if (deletedCount > 0) {
                logger.info(`Deleted ${deletedCount} OTA file(s) for ${vendorHex}.${productHex}.${mode}`);
            }
            return deletedCount;
        }

        if (vendorId === undefined) {
            throw new OtaUpdateError("Either filename or vendorId must be provided to delete files");
        }

        // Delete all files for the vendor, optionally filtered by mode
        const vendorHex = vendorId.toString(16);
        const vendorStorage = storage.context.createContext(vendorHex);
        let deletedCount = 0;
        const validModes: OtaStorageMode[] = ["prod", "test", "local"];
        const modesToDelete = mode !== undefined ? [mode] : validModes;

        for (const productKey of await vendorStorage.contexts()) {
            const productContext = vendorStorage.createContext(productKey);

            for (const modeStr of modesToDelete) {
                // Handle new format: mode sub-context with version keys
                const modeSubContexts = await productContext.contexts();
                if (modeSubContexts.includes(modeStr)) {
                    const modeContext = productContext.createContext(modeStr);
                    for (const versionKey of await modeContext.keys()) {
                        const fd = new PersistedFileDesignator(versionKey, modeContext);
                        await fd.delete();
                        deletedCount++;
                    }
                }

                // Handle legacy bare key (pre-migration format)
                if (await productContext.has(modeStr)) {
                    const fd = new PersistedFileDesignator(modeStr, productContext);
                    await fd.delete();
                    deletedCount++;
                }
            }
        }

        return deletedCount;
    }
}

export namespace DclOtaUpdateService {
    export type OtaUpdateListEntry = {
        filename: string;
        vendorId: number;
        productId: number;
        softwareVersion: number;
        softwareVersionString: string;
        minApplicableSoftwareVersion?: number;
        maxApplicableSoftwareVersion?: number;
        mode: OtaStorageMode;
        size: number;
    };

    export interface FindOptions {
        vendorId?: number;
        productId?: number;
        isProduction?: boolean;
        mode?: OtaStorageMode;
        currentVersion?: number;
    }
}
