/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PersistedFileDesignator } from "#bdx/PersistedFileDesignator.js";
import {
    Bytes,
    Construction,
    Crypto,
    Diagnostic,
    Environment,
    HashAlgorithm,
    ImplementationError,
    Logger,
    MatterError,
    Minutes,
    StorageContext,
    StorageService,
} from "#general";
import { DeviceSoftwareVersionModelDclSchema, VendorId } from "#types";
import { DclClient, MatterDclError } from "./DclClient.js";
import { OtaImageReader } from "./OtaImageReader.js";

const logger = Logger.get("DclOtaUpdateService");

/** Error thrown when OTA update check or download fails */
export class OtaUpdateError extends MatterError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

/**
 * Update information returned by checkForUpdate.
 * This is an alias for the DCL schema to provide better semantic meaning.
 */
export type OtaUpdateInfo = DeviceSoftwareVersionModelDclSchema;

const OTA_DOWNLOAD_TIMEOUT = Minutes(5);

const OTA_FILENAME_REGEX = /^([0-9a-f]+)-([0-9a-f]+)-(prod|test)$/i;

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
    #storage?: StorageContext;

    get construction() {
        return this.#construction;
    }

    constructor(environment: Environment) {
        environment.set(DclOtaUpdateService, this);
        this.#crypto = environment.get(Crypto);

        // THe construction is async and will be enforced when needed
        this.#construction = Construction(this, async () => {
            this.#storage = (await environment.get(StorageService).open("ota")).createContext("bin");
        });
    }

    /**
     * Check DCL for available software updates for a device, defined by it's vendor ID, product ID and current
     * software version. If a target software version is provided, only that version is checked for applicability and
     * ignoring other newer versions.
     *
     * @param vendorId - Vendor ID of the device
     * @param productId - Product ID of the device
     * @param currentSoftwareVersion - Current software version of the device
     * @param isProduction - Whether to check production DCL (true) or test DCL (false)
     * @param targetSoftwareVersion - Optional specific version to check. If not provided, checks for any newer version.
     * @returns Update information if an update is available, undefined otherwise
     */
    async checkForUpdate(
        vendorId: number,
        productId: number,
        currentSoftwareVersion: number,
        isProduction = true,
        targetSoftwareVersion?: number,
    ) {
        const dclClient = new DclClient(isProduction);

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
                    `Checking update in DCL for specific version`,
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

            // Filter for versions higher than current, sort to check highest version number first
            const newerVersions = softwareVersions
                .filter(version => version > currentSoftwareVersion)
                .sort((a, b) => b - a);

            if (newerVersions.length === 0) {
                logger.debug(`No newer versions available in DCL`, Diagnostic.dict(diagnosticInfo));
                return;
            }

            logger.debug(`Found ${newerVersions.length} newer version(s) in DCL`, Diagnostic.dict(diagnosticInfo));

            // Check each version starting from highest, find first applicable one
            for (const version of newerVersions) {
                const updateInfo = await this.#checkSpecificVersion(
                    dclClient,
                    vendorId,
                    productId,
                    version,
                    currentSoftwareVersion,
                );
                if (updateInfo !== undefined) {
                    logger.info(`Update available in DCL`, Diagnostic.dict({ new: version, ...diagnosticInfo }));
                    return updateInfo;
                }
            }

            logger.info(`No applicable updates found in DCL`, Diagnostic.dict(diagnosticInfo));
        } catch (error) {
            MatterDclError.accept(error);
            logger.info(`Failed to check for updates for VID: ${vendorId}, PID: ${productId}: ${error.message}`);
        }
    }

    async #verifyUpdate(updateInfo: OtaUpdateInfo, fileDesignator: PersistedFileDesignator) {
        const { otaFileSize, softwareVersion, vid, pid } = updateInfo;

        const storedBlob = await fileDesignator.openBlob();
        const reader = storedBlob.stream().getReader();

        // Validate with full checksum if DCL provided one
        const checksumOptions = updateInfo.otaChecksum
            ? {
                  calculateFullChecksum: true,
                  checksumType: updateInfo.otaChecksumType ?? HashAlgorithm.SHA256,
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

    #fileName(vid: number, pid: number, isProduction: boolean) {
        return `${vid.toString(16)}-${pid.toString(16)}-${isProduction ? "prod" : "test"}`;
    }

    /**
     * Store an OTA update image from a ReadableStream into persistent storage.
     */
    async store(stream: ReadableStream<Uint8Array>, updateInfo: OtaUpdateInfo, isProduction = true) {
        if (this.#storage === undefined) {
            await this.construction;
        }
        const storage = this.#storage!;

        const { softwareVersion, softwareVersionString, vid, pid } = updateInfo;

        // Generate filename with production/test indicator (version not included as we always use latest)
        const filename = this.#fileName(vid, pid, isProduction);
        const fileDesignator = new PersistedFileDesignator(filename, storage);

        const diagnosticInfo = {
            filename,
            vid,
            pid,
            v: `${softwareVersion} (${softwareVersionString})`,
            prod: isProduction,
        };

        try {
            // Write to storage using streaming via PersistedFileDesignator
            await fileDesignator.writeFromStream(stream);

            // Read back from storage and validate (including full file checksum if provided by DCL)
            await this.#verifyUpdate(updateInfo, fileDesignator);

            logger.debug(`Stored OTA image`, Diagnostic.dict(diagnosticInfo));

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
    async downloadUpdate(
        updateInfo: OtaUpdateInfo,
        isProduction = true,
        force = false,
        timeout = OTA_DOWNLOAD_TIMEOUT,
    ) {
        if (this.#storage === undefined) {
            await this.construction;
        }
        const storage = this.#storage!;

        const { otaUrl, softwareVersion, softwareVersionString, vid, pid } = updateInfo;

        const diagnosticInfo = {
            vid,
            pid,
            v: `${softwareVersion} (${softwareVersionString})`,
            prod: isProduction,
        };

        if (!otaUrl?.trim()) {
            throw new OtaUpdateError("No OTA URL provided in update info");
        }

        // Generate filename with production/test indicator (version not included as we always use latest)
        const filename = this.#fileName(vid, pid, isProduction);
        const fileDesignator = new PersistedFileDesignator(filename, storage);

        if (await fileDesignator.exists()) {
            if (!force) {
                // File exists, and we do not force overwrite it, validate it
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

        return await this.store(response.body, updateInfo, isProduction);
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

        // Current version must be within the applicable range if specified
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
            otaFileSize: header.payloadSize,
            otaChecksum: Bytes.toBase64(header.imageDigest),
            otaChecksumType: header.imageDigestType,
            // Use header values if present, otherwise use provided options or defaults
            minApplicableSoftwareVersion:
                header.minApplicableSoftwareVersion ?? options?.minApplicableSoftwareVersion ?? 0,
            maxApplicableSoftwareVersion:
                header.maxApplicableSoftwareVersion ??
                options?.maxApplicableSoftwareVersion ??
                header.softwareVersion - 1,
            releaseNotesUrl: header.releaseNotesUrl,
            schemaVersion: options?.schemaVersion ?? 0,
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
     *
     * @example
     * ```typescript
     * const service = new DclOtaUpdateService(environment);
     * const updateInfo = await service.createUpdateInfoFromFile(
     *     "https://example.com/ota-image.bin",
     *     { cdVersionNumber: 1 }
     * );
     * const fileDesignator = await service.downloadUpdate(updateInfo, true);
     * ```
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
    async find(options?: { vendorId?: number; productId?: number; isProduction?: boolean }) {
        if (this.#storage === undefined) {
            await this.construction;
        }
        const storage = this.#storage!;

        // Get all keys from storage
        const keys = await storage.keys();
        logger.debug(`Scanning stored OTA files, found ${keys.length} total files`);

        // Parse and filter files matching pattern: {vid-hex}-{pid-hex}-{prod|test}
        const results = new Array<{
            filename: string;
            vendorId: number;
            productId: number;
            softwareVersion: number;
            softwareVersionString: string;
            mode: "prod" | "test";
            size: number;
        }>();

        for (const key of keys) {
            const match = key.match(OTA_FILENAME_REGEX);
            logger.debug(`Checking stored OTA file: ${key}: match=${match !== null}`);
            if (!match) {
                continue;
            }

            const [, vidHex, pidHex, mode] = match;
            const vendorId = parseInt(vidHex, 16);
            const productId = parseInt(pidHex, 16);
            const isProduction = mode === "prod";

            // Apply filters
            if (options?.vendorId !== undefined && vendorId !== options.vendorId) {
                continue;
            }
            if (options?.productId !== undefined && productId !== options.productId) {
                continue;
            }
            if (options?.isProduction !== undefined && isProduction !== options.isProduction) {
                continue;
            }

            try {
                // Read header to get software version and size
                const fileDesignator = new PersistedFileDesignator(key, storage);
                const blob = await fileDesignator.openBlob();
                const reader = blob.stream().getReader();

                const header = await OtaImageReader.header(reader);

                results.push({
                    filename: key,
                    vendorId,
                    productId,
                    softwareVersion: header.softwareVersion,
                    softwareVersionString: header.softwareVersionString,
                    mode: mode as "prod" | "test",
                    size: blob.size,
                });
            } catch (error) {
                logger.warn(`Failed to read OTA file ${key}:`, error);
            }
        }

        // Sort by vendor ID, product ID, mode, and version
        results.sort((a, b) => {
            if (a.mode !== b.mode) return a.mode === "prod" ? -1 : 1;
            if (a.vendorId !== b.vendorId) return a.vendorId - b.vendorId;
            if (a.productId !== b.productId) return a.productId - b.productId;
            return a.softwareVersion - b.softwareVersion;
        });

        return results;
    }

    /** Get a PersistedFileDesignator for a stored OTA update file by filename. */
    async fileDesignatorForUpdate(filename: string) {
        if (!OTA_FILENAME_REGEX.test(filename)) {
            throw new ImplementationError(`Invalid OTA filename format: ${filename}`);
        }

        if (this.#storage === undefined) {
            await this.construction;
        }
        const storage = this.#storage!;

        const fileDesignator = new PersistedFileDesignator(filename, storage);
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
     * @param options.filename - Specific filename to delete
     * @param options.vendorId - Vendor ID to filter files for deletion
     * @param options.productId - Product ID to filter files for deletion (optional, requires vendorId)
     * @param options.isProduction - Production (true) or test (false) mode (defaults to true)
     * @returns Number of files deleted
     */
    async delete(options: { filename?: string; vendorId?: number; productId?: number; isProduction?: boolean }) {
        if (this.#storage === undefined) {
            await this.construction;
        }
        const storage = this.#storage!;

        const { vendorId, productId, isProduction = true } = options;
        let { filename } = options;

        if (!filename && vendorId !== undefined && productId !== undefined) {
            filename = this.#fileName(vendorId, productId, isProduction);
        }

        if (filename) {
            // Delete specific file by name
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

        if (vendorId === undefined) {
            throw new OtaUpdateError("Either filename or vendorId must be provided to delete files");
        }

        // Delete all files for the vendor with the specified mode
        const vendorHex = vendorId.toString(16);
        const mode = isProduction ? "prod" : "test";
        const pattern = new RegExp(`^${vendorHex}-[0-9a-f]+-${mode}$`, "i");

        const keys = await storage.keys();
        let deletedCount = 0;

        for (const key of keys) {
            if (pattern.test(key)) {
                const fileDesignator = new PersistedFileDesignator(key, storage);
                await fileDesignator.delete();
                logger.info(`Deleted OTA file: ${key}`);
                deletedCount++;
            }
        }

        return deletedCount;
    }
}
