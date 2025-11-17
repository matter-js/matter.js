/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Construction,
    Days,
    Diagnostic,
    Duration,
    Environment,
    Logger,
    Seconds,
    StorageContext,
    StorageService,
    Time,
    Timer,
} from "#general";
import { Paa } from "../certificate/kinds/AttestationCertificates.js";
import { DclClient, MatterDclError } from "./DclClient.js";
import { DclPkiRootCertificateSubjectReference } from "./DclRestApiTypes.js";

const logger = Logger.get("DclCertificateService");

// GitHub repository for development/test certificates
const GITHUB_OWNER = "project-chip";
const GITHUB_REPO = "connectedhomeip";
const GITHUB_PATH = "credentials/development/paa-root-certs";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
const GITHUB_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/master/${GITHUB_PATH}`;
const DEFAULT_GITHUB_TIMEOUT = Seconds(10);

/**
 * Implements a service to manage DCL root certificates as a singleton in the environment and so will be shared by
 * multiple nodes of relevant. It is mainly relevant for controller use cases.
 * The service supports fetching certificates from teh CSA production and test DCL instances, as well
 * as from a GitHub repository for development certificates.
 */
export class DclCertificateService {
    readonly #construction: Construction<DclCertificateService>;
    #storage?: StorageContext;
    #certificateIndex = new Map<string, DclCertificateService.CertificateMetadata>();
    #updateTimer?: Timer;
    #closed = false;
    #options: DclCertificateService.Options;
    #fetchPromise?: Promise<void>;

    constructor(environment: Environment, options: DclCertificateService.Options = {}) {
        environment.set(DclCertificateService, this);
        this.#options = options;

        this.#construction = Construction(this, async () => {
            this.#storage = (await environment.get(StorageService).open("certificates")).createContext("root");
            await this.#loadIndex(this.#storage);
            await this.updateCertificates();

            if (options.updateInterval !== null) {
                // Start periodic update timer
                const updateInterval = options.updateInterval ?? Days.one;
                this.#updateTimer = Time.getPeriodicTimer("DCL Certificate Update", updateInterval, () =>
                    this.updateCertificates(),
                ).start();
            }
        });
    }

    get construction() {
        return this.#construction;
    }

    /**
     * Normalize subject key identifier to a consistent string format.
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
    getAllCertificates() {
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
        if (!derBytes) {
            throw new MatterDclError(`Certificate data not found in storage`, Diagnostic.dict({ skid: normalizedId }));
        }

        return this.#derToPem(derBytes);
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
            // Fetch root certificate list to find the certificate reference
            const dclClient = new DclClient(isProduction);
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
                    Diagnostic.dict({ skid: metadata.subjectKeyID }),
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
    async updateCertificates(force = false) {
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

            // Also fetch certificates from GitHub
            await this.#fetchGitHubCertificates(storage, force);
        }

        if (this.#closed) {
            return;
        }

        // Store the index if anything changed
        const newCerts = this.#certificateIndex.size - initialSize;
        if (newCerts > 0) {
            await this.#saveIndex();
            logger.info(`Downloaded and stored ${newCerts} new certificates (total: ${this.#certificateIndex.size})`);
        } else {
            logger.info(`All certificates up to date (${this.#certificateIndex.size} total)`);
        }
    }

    /** Fetch certificates from DCL for the specified environment. */
    async #fetchDclCertificates(storage: StorageContext, isProduction: boolean, force: boolean) {
        const environment = isProduction ? "production" : "test";
        logger.debug(`Fetching PAA certificates from DCL (${environment})`);

        const dclClient = new DclClient(isProduction);
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
                logger.debug(`Certificate already exists, skipping`, Diagnostic.dict({ skid: normalizedSubjectKeyId }));
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
                const derBytes = this.#pemToDer(cert.pemCert);

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

            // Fetch the list of files from GitHub API
            const response = await fetch(GITHUB_API_URL, {
                method: "GET",
                headers: {
                    Accept: "application/vnd.github.v3+json",
                },
                signal: AbortSignal.timeout(this.#options.timeout ?? DEFAULT_GITHUB_TIMEOUT),
            });

            if (!response.ok) {
                throw new MatterDclError(`GitHub API request failed: ${response.status} ${response.statusText}`);
            }

            const contents = (await response.json()) as Array<{ name: string; type: string }>;

            // Filter for .der files, excluding DCL mirror files because we load from DCL directly
            const certFiles = contents.filter(
                item => item.type === "file" && item.name.endsWith(".der") && !item.name.startsWith("dcld_mirror_"),
            );
            logger.debug(`Found ${certFiles.length} certificate files on GitHub`);

            for (const file of certFiles) {
                if (this.#closed) {
                    return;
                }
                await this.#fetchGitHubCertificate(storage, file.name, force);
            }
        } catch (error) {
            logger.info("Failed to fetch certificates from GitHub", error);
        }
    }

    /**
     * Fetch a single certificate from GitHub by filename.
     */
    async #fetchGitHubCertificate(storage: StorageContext, filename: string, force: boolean) {
        try {
            const url = `${GITHUB_RAW_URL}/${filename}`;
            const response = await fetch(url, {
                method: "GET",
                signal: AbortSignal.timeout(this.#options.timeout ?? DEFAULT_GITHUB_TIMEOUT),
            });

            if (!response.ok) {
                throw new MatterDclError(`Failed to download ${filename}: ${response.status}`);
            }

            // Download DER certificate directly as binary
            const arrayBuffer = await response.arrayBuffer();
            const derBytes = new Uint8Array(arrayBuffer);

            // Parse the certificate to extract metadata
            const paa = Paa.fromAsn1(derBytes);
            const subjectKeyId = this.#normalizeSubjectKeyId(paa.cert.extensions.subjectKeyIdentifier);

            // Skip if certificate already exists (unless force is true)
            if (!force && this.#certificateIndex.has(subjectKeyId)) {
                logger.debug(
                    `Certificate ${subjectKeyId} already exists, skipping`,
                    Diagnostic.dict({ skid: subjectKeyId }),
                );
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
        // Store the DER certificate
        await storage.set(subjectKeyId, derBytes);

        // Add entry to certificate index
        this.#certificateIndex.set(subjectKeyId, metadata);
    }

    /**
     * Convert PEM certificate to DER format.
     * Strips the PEM header/footer and decodes from base64.
     */
    #pemToDer(pemCert: string): Bytes {
        // Remove PEM header and footer lines
        const base64 = pemCert
            .replace(/-----BEGIN CERTIFICATE-----/g, "")
            .replace(/-----END CERTIFICATE-----/g, "")
            .replace(/\r?\n/g, "")
            .trim();

        return Bytes.fromBase64(base64);
    }

    /**
     * Convert DER certificate to PEM format.
     * Encodes to base64 and adds PEM header/footer.
     */
    #derToPem(derBytes: Bytes): string {
        const base64 = Bytes.toBase64(derBytes);
        const lines: string[] = ["-----BEGIN CERTIFICATE-----"];

        // Split base64 into 64-character lines
        for (let i = 0; i < base64.length; i += 64) {
            lines.push(base64.slice(i, i + 64));
        }

        lines.push("-----END CERTIFICATE-----");
        return lines.join("\n");
    }
}

export namespace DclCertificateService {
    export interface Options {
        /** Whether to fetch test certificates in addition to production ones. Default is false. */
        fetchTestCertificates?: boolean;

        /**
         * Interval for periodic certificate updates. Default is 1 day. Set to null to disable automatic certificate
         * updates
         */
        updateInterval?: Duration | null;

        /** Timeout for DCL requests. Default is 5s. */
        timeout?: Duration;
    }

    /**
     * Metadata for a stored certificate.
     */
    export interface CertificateMetadata {
        subject?: string;
        subjectAsText?: string;
        subjectKeyId: string;
        serialNumber: string;
        vid: number;
        isRoot: boolean;
        isProduction: boolean;
        [key: string]: string | number | boolean | undefined;
    }
}
