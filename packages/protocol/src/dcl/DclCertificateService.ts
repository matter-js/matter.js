/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceAttestationPkiRevocationDclSchema, RevocationTypeEnum } from "@matter/types";
import {
    Bytes,
    Construction,
    Days,
    DerCodec,
    DerNode,
    Diagnostic,
    Directory,
    Duration,
    Environment,
    Logger,
    Pem,
    Repo,
    Seconds,
    StorageContext,
    StorageManager,
    StorageService,
    Time,
    Timer,
} from "@matter/general";
import { Paa } from "../certificate/kinds/AttestationCertificates.js";
import { DclClient, MatterDclError } from "./DclClient.js";
import { DclConfig, DclGithubConfig } from "./DclConfig.js";
import { DclPkiRootCertificateSubjectReference } from "./DclRestApiTypes.js";

const logger = Logger.get("DclCertificateService");

/**
 * Implements a service to manage DCL root certificates as a singleton in the environment and so will be shared by
 * multiple nodes of relevant. It is mainly relevant for controller use cases.
 * The service supports fetching certificates from teh CSA production and test DCL instances, as well
 * as from a GitHub repository for development certificates.
 */
export class DclCertificateService {
    readonly #construction: Construction<DclCertificateService>;
    #storageManager?: StorageManager;
    #storage?: StorageContext;
    #certificateIndex = new Map<string, DclCertificateService.CertificateMetadata>();
    #updateTimer?: Timer;
    #closed = false;
    #options: DclCertificateService.Options;
    #fetchPromise?: Promise<void>;
    #revocationStorage?: StorageContext;
    // Key: normalized issuerSubjectKeyId, Value: Set of revoked serial numbers (hex)
    #revocationIndex = new Map<string, Set<string>>();

    constructor(environment: Environment, options: DclCertificateService.Options = {}) {
        environment.set(DclCertificateService, this);
        this.#options = options;

        this.#construction = Construction(this, async () => {
            this.#storageManager = await environment.get(StorageService).open("certificates");
            this.#storage = this.#storageManager.createContext("root");
            await this.#loadIndex(this.#storage);
            this.#revocationStorage = this.#storageManager.createContext("revocations");
            await this.#loadRevocationIndex();
            await this.update();

            if (options.updateInterval !== null) {
                // Start periodic update timer
                const updateInterval = options.updateInterval ?? Days.one;
                this.#updateTimer = Time.getPeriodicTimer("DCL Certificate Update", updateInterval, () =>
                    this.update(),
                ).start();
            }
        });
    }

    get construction() {
        return this.#construction;
    }

    /**
     * Normalize the subject key identifier to a consistent string format.
     * Accepts either Bytes or string (with or without colons).
     */
    #normalizeSubjectKeyId(subjectKeyId: Bytes | string) {
        if (typeof subjectKeyId === "string") {
            return subjectKeyId.replace(/:/g, "").toUpperCase();
        }
        return Bytes.toHex(subjectKeyId).toUpperCase();
    }

    /**
     * Get certificate metadata by subject key identifier. Returns undefined if not found.
     */
    getCertificate(subjectKeyId: Bytes | string) {
        this.construction.assert();
        return this.#certificateIndex.get(this.#normalizeSubjectKeyId(subjectKeyId));
    }

    /**
     * Get all certificate metadata entries.
     */
    get certificates() {
        this.construction.assert();
        return Array.from(this.#certificateIndex.values());
    }

    /**
     * Get certificate as PEM string.
     * @throws {MatterDclError} if certificate not found
     */
    async getCertificateAsPem(subjectKeyId: Bytes | string) {
        this.construction.assert();

        const normalizedId = this.#normalizeSubjectKeyId(subjectKeyId);
        const metadata = this.#certificateIndex.get(normalizedId);
        if (!metadata) {
            throw new MatterDclError(`Certificate not found`, Diagnostic.dict({ skid: normalizedId }));
        }

        // Retrieve DER certificate from storage
        const derBytes = await this.#storage!.get<Bytes>(normalizedId);
        if (!derBytes || Bytes.of(derBytes).length === 0) {
            throw new MatterDclError(`Certificate data not found in storage`, Diagnostic.dict({ skid: normalizedId }));
        }

        return Pem.encode(derBytes);
    }

    /**
     * Get certificate as DER bytes.
     * @throws {MatterDclError} if certificate not found
     */
    async getCertificateAsDer(subjectKeyId: Bytes | string) {
        this.construction.assert();

        const normalizedId = this.#normalizeSubjectKeyId(subjectKeyId);
        const metadata = this.#certificateIndex.get(normalizedId);
        if (!metadata) {
            throw new MatterDclError(`Certificate not found`, Diagnostic.dict({ skid: normalizedId }));
        }

        // Retrieve DER certificate from storage
        const derBytes = await this.#storage!.get<Bytes>(normalizedId);
        if (!derBytes || Bytes.of(derBytes).length === 0) {
            throw new MatterDclError(`Certificate data not found in storage`, Diagnostic.dict({ skid: normalizedId }));
        }

        return Bytes.of(derBytes);
    }

    /**
     * Check if a certificate is revoked by looking up its serial number in the revocation set
     * for the given authority key identifier.
     * Returns true if the certificate is revoked, false otherwise.
     * If revocation data is not available for the given authority, returns false.
     */
    isRevoked(authorityKeyIdentifier: Bytes | string, serialNumber: Bytes | string): boolean {
        this.construction.assert();

        const akid = this.#normalizeSubjectKeyId(authorityKeyIdentifier);
        const revokedSet = this.#revocationIndex.get(akid);
        if (revokedSet === undefined) {
            return false; // No revocation data for this authority
        }

        const serialHex =
            typeof serialNumber === "string"
                ? serialNumber.replace(/:/g, "").toUpperCase()
                : Bytes.toHex(serialNumber).toUpperCase();

        return revokedSet.has(serialHex);
    }

    /**
     * Returns true if any revocation data has been fetched and is available.
     * Can be used to log a warning when no revocation data exists yet.
     */
    get hasRevocationData(): boolean {
        return this.#revocationIndex.size > 0;
    }

    /**
     * Get certificate metadata by subject key identifier, fetching from DCL if not in local storage. Returns
     * undefined if not found.
     */
    async getOrFetchCertificate(
        subjectKeyId: Bytes | string,
        options?: DclClient.Options & { isProduction?: boolean },
    ) {
        this.construction.assert();

        const normalizedId = this.#normalizeSubjectKeyId(subjectKeyId);

        // First check if certificate is in the index
        const existing = this.#certificateIndex.get(normalizedId);
        if (existing) {
            return existing;
        }

        if (this.#fetchPromise !== undefined) {
            // Wait for ongoing fetch process to complete, return whatever is in the index afterward
            await this.#fetchPromise;
            return this.#certificateIndex.get(normalizedId);
        }

        try {
            const isProduction = options?.isProduction ?? true;
            // Fetch the root certificate list to find the certificate reference
            const config = isProduction
                ? (this.#options.dclConfig ?? DclConfig.production)
                : (this.#options.testDclConfig ?? DclConfig.test);
            const dclClient = new DclClient(config);
            const certRefs = await dclClient.fetchRootCertificateList(options);

            // Find the certificate reference with matching subject key ID (with colons for comparison)
            const subjectKeyIdWithColons = normalizedId
                .match(/.{1,2}/g)
                ?.join(":")
                .toUpperCase();
            const certRef = certRefs.find(ref => ref.subjectKeyId === subjectKeyIdWithColons);

            if (!certRef) {
                logger.debug(
                    `Certificate not found in DCL`,
                    Diagnostic.dict({ skid: normalizedId, prod: isProduction }),
                );
                return;
            }

            // Use existing method to fetch and store the certificate
            await this.#fetchAndStoreCertificate(
                this.#storage!,
                dclClient,
                certRef,
                isProduction,
                false,
                options ?? this.#options,
            );

            // After fetching, retrieve from index (it should be there now if fetch was successful)
            const fetched = this.#certificateIndex.get(normalizedId);
            if (fetched) {
                await this.#saveIndex();
                logger.info(
                    `Fetched and stored certificate from DCL`,
                    Diagnostic.dict({ skid: normalizedId, prod: isProduction }),
                );
            }
            return fetched;
        } catch (error) {
            MatterDclError.accept(error);
            logger.debug(`Failed to fetch certificate ${normalizedId} from DCL: ${error.message}`);
        }
    }

    /**
     * Delete a certificate from storage and index.
     */
    async deleteCertificate(subjectKeyId: Bytes | string) {
        this.construction.assert();

        const normalizedId = this.#normalizeSubjectKeyId(subjectKeyId);

        // Delete from storage
        await this.#storage!.delete(normalizedId);

        // Remove from index
        this.#certificateIndex.delete(normalizedId);

        // Update stored index
        await this.#saveIndex();

        logger.debug(`Deleted certificate`, Diagnostic.dict({ skid: normalizedId }));
    }

    /**
     * Close the service and stop all timers.
     */
    async close() {
        this.#closed = true;
        this.#updateTimer?.stop();
        if (this.#fetchPromise !== undefined) {
            await this.#fetchPromise;
        }
        await this.#storageManager?.close();
    }

    /**
     * Load the certificate index from storage, verifying each entry exists and cleaning up orphaned data.
     */
    async #loadIndex(storage: StorageContext) {
        // Get all keys in storage to detect orphaned certificate data
        const allKeys = new Set(await storage.keys());
        allKeys.delete("index"); // Remove the index key itself

        const storedIndex = await storage.get<DclCertificateService.CertificateMetadata[]>("index", []);

        // Load and verify each certificate entry
        let validCount = 0;
        let invalidCount = 0;

        for (const metadata of storedIndex) {
            if (allKeys.delete(metadata.subjectKeyId)) {
                this.#certificateIndex.set(metadata.subjectKeyId, metadata);
                validCount++;
            } else {
                logger.info(
                    `Certificate referenced in index but not found in storage`,
                    Diagnostic.dict({ skid: metadata.subjectKeyId }),
                );
                invalidCount++;
            }
        }

        // Clean up orphaned certificates (in storage but not in index)
        if (allKeys.size > 0) {
            logger.debug(`Found ${allKeys.size} orphaned certificate(s) in storage, cleaning up`);
            for (const orphanedKey of allKeys) {
                await storage.delete(orphanedKey);
                logger.debug(`Deleted orphaned certificate: ${orphanedKey}`);
            }
        }

        logger.info(
            `Loaded ${validCount} certificates from storage${invalidCount > 0 ? ` (${invalidCount} missing)` : ""}${allKeys.size > 0 ? ` (${allKeys.size} orphaned removed)` : ""}`,
        );
    }

    /**
     * Update certificates from DCL and GitHub. Returns true if update succeeded, false if it failed.
     */
    async update(force = false) {
        if (this.#closed || !this.#storage) {
            return;
        }
        if (this.#fetchPromise !== undefined) {
            // Process already running, return this promise
            return this.#fetchPromise;
        }

        logger.debug(`Update certificates${force ? " (force mode)" : ""}`);
        try {
            this.#fetchPromise = this.#fetchCertificates(this.#storage, force).finally(() => {
                this.#fetchPromise = undefined;
            });
            await this.#fetchPromise;
        } catch (error) {
            logger.info("Certificate update failed", error);
            return false;
        }
        return true;
    }

    /**
     * Fetch certificates from DCL and GitHub.
     */
    async #fetchCertificates(storage: StorageContext, force = false) {
        if (this.#closed) {
            return;
        }

        const initialSize = this.#certificateIndex.size;

        // Always fetch production certificates from DCL
        await this.#fetchDclCertificates(storage, true, force);

        if (this.#closed) {
            return;
        }

        // Additionally fetch test certificates if requested
        if (this.#options.fetchTestCertificates) {
            await this.#fetchDclCertificates(storage, false, force);

            if (this.#closed) {
                return;
            }

            // Also fetch certificates from GitHub (unless explicitly disabled)
            if (this.#options.fetchGithubCertificates !== false) {
                await this.#fetchGitHubCertificates(storage, force);
            }
        }

        if (this.#closed) {
            return;
        }

        await this.#saveIndex();
        const newCerts = this.#certificateIndex.size - initialSize;
        if (newCerts > 0) {
            logger.info(`Downloaded and stored ${newCerts} new certificates (total: ${this.#certificateIndex.size})`);
        } else {
            logger.info(`All certificates up to date (${this.#certificateIndex.size} total)`);
        }

        // Fetch revocation distribution points
        if (!this.#closed) {
            await this.#fetchRevocationData(force);
        }
    }

    /** Fetch certificates from DCL for the specified environment. */
    async #fetchDclCertificates(storage: StorageContext, isProduction: boolean, force: boolean) {
        const environment = isProduction ? "production" : "test";
        logger.debug(`Fetching PAA certificates from DCL (${environment})`);

        const config = isProduction
            ? (this.#options.dclConfig ?? DclConfig.production)
            : (this.#options.testDclConfig ?? DclConfig.test);
        const dclClient = new DclClient(config);
        const certRefs = await dclClient.fetchRootCertificateList(this.#options);
        logger.debug(`Found ${certRefs.length} ${environment} root certificates in DCL`);

        for (const certRef of certRefs) {
            if (this.#closed) {
                return;
            }
            await this.#fetchAndStoreCertificate(storage, dclClient, certRef, isProduction, force, this.#options);
        }
    }

    /** Save the certificate index to storage. */
    #saveIndex() {
        if (this.#closed) {
            return;
        }
        if (!this.#storage) {
            throw new MatterDclError("Storage context not initialized");
        }
        const indexArray = Array.from(this.#certificateIndex.values());
        return this.#storage.set("index", indexArray);
    }

    /** Fetch and store a single certificate from DCL by its subject reference. */
    async #fetchAndStoreCertificate(
        storage: StorageContext,
        dclClient: DclClient,
        certRef: DclPkiRootCertificateSubjectReference,
        isProduction: boolean,
        force: boolean,
        options?: DclClient.Options,
    ) {
        try {
            // Strip colons from subject key ID for storage key (normalize to match GitHub format)
            const normalizedSubjectKeyId = this.#normalizeSubjectKeyId(certRef.subjectKeyId);

            // Check if certificate already exists before fetching details (skip check if force is true)
            if (!force && this.#certificateIndex.has(normalizedSubjectKeyId)) {
                // If the existing certificate was stored as test but is now found in production DCL, upgrade it
                const existing = this.#certificateIndex.get(normalizedSubjectKeyId)!;
                if (isProduction && !existing.isProduction) {
                    existing.isProduction = true;
                    logger.debug(
                        `Upgraded certificate to production`,
                        Diagnostic.dict({ skid: normalizedSubjectKeyId }),
                    );
                } else {
                    logger.debug(
                        `Certificate already exists, skipping`,
                        Diagnostic.dict({ skid: normalizedSubjectKeyId }),
                    );
                }
                return;
            }

            // Fetch the certificate details
            const certs = await dclClient.fetchRootCertificateBySubject(certRef, options);

            for (const cert of certs) {
                if (!cert.subjectKeyId) {
                    logger.warn(
                        `Certificate for subject ${cert.subject} is missing subjectKeyId, skipping`,
                        Diagnostic.dict({ subject: cert.subject }),
                    );
                    continue;
                }

                // Strip colons from subject key ID for storage key
                const subjectKeyId = this.#normalizeSubjectKeyId(cert.subjectKeyId);

                // Convert PEM to DER
                const derBytes = Pem.asDer(cert.pemCert);

                const { subject, subjectAsText, serialNumber, vid, isRoot } = cert;
                // Store certificate with metadata (using normalized ID without colons)
                await this.#storeCertificate(storage, subjectKeyId, derBytes, {
                    subject,
                    subjectAsText,
                    subjectKeyId,
                    serialNumber,
                    vid,
                    isRoot,
                    isProduction,
                });

                logger.debug(`Stored certificate`, Diagnostic.dict({ skid: normalizedSubjectKeyId, vid: cert.vid }));
            }
        } catch (error) {
            logger.info(`Failed to fetch certificate ${certRef.subject}/${certRef.subjectKeyId}`, error);
        }
    }

    /**
     * Fetch development certificates from GitHub repository.
     */
    async #fetchGitHubCertificates(storage: StorageContext, force: boolean) {
        try {
            logger.debug("Fetching development certificates from GitHub");

            // Create GitHub repo client with timeout option
            const { owner, repo, branch, certPath } = this.#options.githubConfig ?? DclGithubConfig.defaults;
            const repoClient = new Repo(owner, repo, branch, this.#options);
            const certDir = await repoClient.cd(certPath);

            // List files in the certificate directory
            const files = await certDir.ls();

            // Filter for .der files, excluding DCL mirror files because we load from DCL directly
            const certFiles = files.filter(name => name.endsWith(".der") && !name.startsWith("dcld_mirror_"));
            logger.debug(`Found ${certFiles.length} certificate files on GitHub`);

            for (const filename of certFiles) {
                if (this.#closed) {
                    return;
                }
                await this.#fetchGitHubCertificate(storage, certDir, filename, force);
            }
        } catch (error) {
            logger.info("Failed to fetch certificates from GitHub", error);
        }
    }

    /**
     * Fetch a single certificate from GitHub by filename.
     */
    async #fetchGitHubCertificate(storage: StorageContext, certDir: Directory, filename: string, force: boolean) {
        try {
            // Download DER certificate directly as binary using GitHub client
            const derBytes = await certDir.getBinary(filename);

            // Parse the certificate to extract metadata
            const paa = Paa.fromAsn1(derBytes);
            const subjectKeyId = this.#normalizeSubjectKeyId(paa.cert.extensions.subjectKeyIdentifier);

            // Skip if certificate already exists (unless force is true)
            if (!force && this.#certificateIndex.has(subjectKeyId)) {
                logger.debug(`Certificate already exists, skipping`, Diagnostic.dict({ skid: subjectKeyId }));
                return;
            }

            const subject = filename.replace(".der", "");
            const serialNumber = Bytes.toHex(paa.cert.serialNumber);
            const vid = paa.cert.subject.vendorId ?? 0;

            // Store certificate with metadata
            await this.#storeCertificate(storage, subjectKeyId, derBytes, {
                subject,
                subjectKeyId,
                serialNumber,
                vid,
                isRoot: true,
                isProduction: false,
            });

            logger.debug(`Stored GitHub certificate`, Diagnostic.dict({ skid: subjectKeyId, filename }));
        } catch (error) {
            logger.info(`Failed to fetch GitHub certificate ${filename}`, error);
        }
    }

    /**
     * Store a certificate and its metadata.
     */
    async #storeCertificate(
        storage: StorageContext,
        subjectKeyId: string,
        derBytes: Bytes,
        metadata: DclCertificateService.CertificateMetadata,
    ) {
        // Never downgrade isProduction from true to false
        const existing = this.#certificateIndex.get(subjectKeyId);
        if (existing?.isProduction && !metadata.isProduction) {
            metadata = { ...metadata, isProduction: true };
        }

        // Store the DER certificate
        await storage.set(subjectKeyId, derBytes);

        // Add entry to certificate index
        this.#certificateIndex.set(subjectKeyId, metadata);
    }

    /**
     * Load the revocation index from storage.
     */
    async #loadRevocationIndex() {
        if (!this.#revocationStorage) return;
        const stored = await this.#revocationStorage.get<Record<string, string[]>>("index", {});
        for (const [key, serials] of Object.entries(stored)) {
            this.#revocationIndex.set(key, new Set(serials));
        }
    }

    /**
     * Save the revocation index to storage.
     */
    async #saveRevocationIndex() {
        if (!this.#revocationStorage || this.#closed) return;
        const data: Record<string, string[]> = {};
        for (const [key, serials] of this.#revocationIndex) {
            data[key] = Array.from(serials);
        }
        await this.#revocationStorage.set("index", data);
    }

    /**
     * Fetch revocation distribution points from DCL and process them.
     * Mirrors the pattern of #fetchCertificates: always fetches production, optionally fetches test-net.
     */
    async #fetchRevocationData(force = false) {
        // Always fetch production revocation data
        await this.#fetchRevocationFromDcl(true, force);

        // Additionally fetch test revocation data if configured
        if (this.#options.fetchTestCertificates) {
            await this.#fetchRevocationFromDcl(false, force);
        }

        await this.#saveRevocationIndex();
    }

    /**
     * Fetch revocation distribution points from a specific DCL environment and process them.
     */
    async #fetchRevocationFromDcl(isProduction: boolean, force: boolean) {
        try {
            const environment = isProduction ? "production" : "test";
            logger.debug(`Fetching revocation distribution points from DCL (${environment})`);

            const config = isProduction
                ? (this.#options.dclConfig ?? DclConfig.production)
                : (this.#options.testDclConfig ?? DclConfig.test);
            const dclClient = new DclClient(config);
            const points = await dclClient.fetchRevocationDistributionPoints(this.#options);

            let updatedCount = 0;
            for (const point of points) {
                if (this.#closed) return;

                // Only process CRL type (revocationType === 1)
                if (point.revocationType !== RevocationTypeEnum.Crl) continue;

                try {
                    await this.#processRevocationPoint(point, force);
                    updatedCount++;
                } catch (error) {
                    logger.info(`Failed to process revocation point for ${point.issuerSubjectKeyId}:`, error);
                }
            }

            if (updatedCount > 0) {
                logger.info(`Processed ${updatedCount} ${environment} revocation distribution points`);
            }
        } catch (error) {
            logger.info("Failed to fetch revocation distribution points", error);
        }
    }

    /**
     * Process a single revocation distribution point: download the CRL and extract revoked serial numbers.
     */
    // TODO: Validate CRL signature against crlSignerCertificate and verify signer chain per spec 6.2.4.1
    async #processRevocationPoint(point: DeviceAttestationPkiRevocationDclSchema, force: boolean) {
        const issuerKeyId = this.#normalizeSubjectKeyId(point.issuerSubjectKeyId);

        // Skip if already processed (unless force)
        if (!force && this.#revocationIndex.has(issuerKeyId)) {
            return;
        }

        // Download the CRL from dataUrl
        const response = await fetch(point.dataUrl, {
            signal: AbortSignal.timeout(this.#options.timeout ?? Seconds(5)),
        });
        if (!response.ok) {
            throw new MatterDclError(`Failed to fetch CRL from ${point.dataUrl}: ${response.status}`);
        }
        const crlBytes = new Uint8Array(await response.arrayBuffer());

        // Parse the CRL to extract revoked serial numbers
        const revokedSerials = DclCertificateService.parseCrlRevokedSerials(crlBytes);

        // Store in revocation index
        this.#revocationIndex.set(issuerKeyId, revokedSerials);
    }

    /**
     * Parse a DER-encoded CRL (RFC 5280 CertificateList) to extract revoked serial numbers.
     *
     * CertificateList ::= SEQUENCE {
     *   tbsCertList SEQUENCE {
     *     version INTEGER OPTIONAL,
     *     signature AlgorithmIdentifier,
     *     issuer Name,
     *     thisUpdate Time,
     *     nextUpdate Time OPTIONAL,
     *     revokedCertificates SEQUENCE OF SEQUENCE { ... } OPTIONAL,
     *     crlExtensions [0] EXPLICIT Extensions OPTIONAL
     *   },
     *   signatureAlgorithm AlgorithmIdentifier,
     *   signatureValue BIT STRING
     * }
     *
     * This method is exposed as static for testing purposes.
     */
    static parseCrlRevokedSerials(crlDer: Bytes): Set<string> {
        const serials = new Set<string>();

        const decoded = DerCodec.decode(crlDer);
        const certListElements = decoded._elements;
        if (!certListElements || certListElements.length < 2) {
            return serials;
        }

        // First element is tbsCertList
        const tbsCertList = certListElements[0];
        const tbsElements = tbsCertList._elements;
        if (!tbsElements) {
            return serials;
        }

        // Find the revokedCertificates sequence.
        // tbsCertList fields: [version?, signature, issuer, thisUpdate, nextUpdate?, revokedCertificates?, crlExtensions?]
        // We look for a CONSTRUCTED SEQUENCE (tag 0x30) that contains SEQUENCE children
        // (each child being a revocation entry with serial + date).
        // The revokedCertificates is the first SEQUENCE whose children are also SEQUENCES
        // containing an INTEGER (serial number) as first element.
        let revokedCertsNode: DerNode | undefined;
        for (const element of tbsElements) {
            // SEQUENCE tag = 0x30 (Sequence 0x10 | Constructed 0x20)
            if (element._tag === 0x30 && element._elements) {
                // Check if this looks like revokedCertificates:
                // It should contain child SEQUENCES, each starting with an INTEGER (0x02)
                const firstChild = element._elements[0];
                if (
                    firstChild &&
                    firstChild._tag === 0x30 &&
                    firstChild._elements &&
                    firstChild._elements[0]?._tag === 0x02
                ) {
                    revokedCertsNode = element;
                    break;
                }
            }
        }

        if (!revokedCertsNode?._elements) {
            return serials; // No revoked certificates
        }

        // Each entry in revokedCertificates is: SEQUENCE { INTEGER serial, Time revocationDate, ... }
        for (const entry of revokedCertsNode._elements) {
            if (entry._tag !== 0x30 || !entry._elements || entry._elements.length < 1) continue;

            const serialNode = entry._elements[0];
            if (serialNode._tag !== 0x02) continue; // Must be INTEGER

            // Convert serial number bytes to hex
            const serialHex = Bytes.toHex(Bytes.of(serialNode._bytes)).toUpperCase();
            serials.add(serialHex);
        }

        return serials;
    }
}

export namespace DclCertificateService {
    export interface Options {
        /** Whether to fetch test certificates in addition to production ones. Default is false. */
        fetchTestCertificates?: boolean;

        /** Whether to fetch development certificates from GitHub. Default is true (when fetchTestCertificates is true). */
        fetchGithubCertificates?: boolean;

        /**
         * Interval for periodic certificate updates. Default is 1 day. Set to null to disable automatic certificate
         * updates
         */
        updateInterval?: Duration | null;

        /** Timeout for DCL requests. Default is 5s. */
        timeout?: Duration;

        /** DCL config for production endpoint. Defaults to DclConfig.production. */
        dclConfig?: DclConfig;

        /** DCL config for test endpoint. Defaults to DclConfig.test. */
        testDclConfig?: DclConfig;

        /** GitHub config for development certificates. Programmatic override only. Defaults to DclGithubConfig.defaults. */
        githubConfig?: DclGithubConfig;
    }

    /**
     * Metadata for a stored certificate.
     */
    export type CertificateMetadata = {
        subject?: string;
        subjectAsText?: string;
        subjectKeyId: string;
        serialNumber: string;
        vid: number;
        isRoot: boolean;
        isProduction: boolean;
    };
}
