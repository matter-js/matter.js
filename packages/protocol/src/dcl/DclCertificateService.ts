/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Construction,
    Crypto,
    Days,
    DerCodec,
    DerNode,
    Diagnostic,
    Duration,
    EcdsaSignature,
    Environment,
    Github,
    Logger,
    Pem,
    PublicKey,
    Seconds,
    StorageContext,
    StorageManager,
    StorageService,
    Time,
    Timer,
} from "@matter/general";
import { DeviceAttestationPkiRevocationDclSchema, RevocationTypeEnum } from "@matter/types";
import { Paa, Pai } from "../certificate/kinds/AttestationCertificates.js";
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
    readonly #crypto: Crypto;
    #storageManager?: StorageManager;
    #storage?: StorageContext;
    #certificateIndex = new Map<string, DclCertificateService.CertificateMetadata>();
    #updateTimer?: Timer;
    #closed = false;
    #options: DclCertificateService.Options;
    #fetchPromise?: Promise<void>;
    #revocationStorage?: StorageContext;
    // Key: normalized issuerSubjectKeyId, Value: revoked serial numbers and optional CRL issuer DN hash
    #revocationIndex = new Map<string, { serials: Set<string>; issuerDnDerHex?: string }>();

    constructor(environment: Environment, options: DclCertificateService.Options = {}) {
        environment.root.set(DclCertificateService, this);
        this.#crypto = environment.get(Crypto);
        this.#options = options;
        logger.info(
            "Initialize CertificateService",
            Diagnostic.dict({
                prod: options.dclConfig?.url ?? DclConfig.production.url,
                test: options.fetchTestCertificates ? (options.testDclConfig?.url ?? DclConfig.test.url) : undefined,
                github: options.fetchTestCertificates && options.fetchGithubCertificates ? "yes" : undefined,
            }),
        );

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
        if (!derBytes || derBytes.byteLength === 0) {
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
        if (!derBytes || derBytes.byteLength === 0) {
            throw new MatterDclError(`Certificate data not found in storage`, Diagnostic.dict({ skid: normalizedId }));
        }

        return Bytes.of(derBytes);
    }

    /**
     * Check if a certificate is revoked by looking up its serial number in the revocation set
     * for the given authority key identifier.
     *
     * Per spec Section 6.2.4.2, the revocation set is indexed by (AuthorityKeyIdentifier, IssuerDN).
     * If `issuerDnDerHex` is provided, the lookup requires it to match the CRL's issuer DN hash.
     * If not provided, any revocation entry matching the AKID is considered.
     *
     * Returns true if the certificate is revoked, false otherwise.
     * If revocation data is not available for the given authority, returns false.
     */
    isRevoked(authorityKeyIdentifier: Bytes | string, serialNumber: Bytes | string, issuerDnDerHex?: string): boolean {
        this.construction.assert();

        const akid = this.#normalizeSubjectKeyId(authorityKeyIdentifier);
        const entry = this.#revocationIndex.get(akid);
        if (entry === undefined) {
            return false; // No revocation data for this authority
        }

        // If issuerDnDerHex is provided, verify it matches the CRL's issuer DN
        if (
            issuerDnDerHex !== undefined &&
            entry.issuerDnDerHex !== undefined &&
            entry.issuerDnDerHex !== issuerDnDerHex
        ) {
            return false; // Issuer DN mismatch — this revocation set is for a different CA
        }

        const serialHex =
            typeof serialNumber === "string"
                ? serialNumber.replace(/:/g, "").toUpperCase()
                : Bytes.toHex(serialNumber).toUpperCase();

        return entry.serials.has(serialHex);
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
        await this.#construction.close(async () => {
            await this.#fetchPromise;
            await this.#storageManager?.close();
        });
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
            const repoClient = new Github.Repo(owner, repo, branch, this.#options);
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
    async #fetchGitHubCertificate(
        storage: StorageContext,
        certDir: Github.Directory,
        filename: string,
        force: boolean,
    ) {
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

        // Set fetchedAt if not already present (preserve original fetch time across updates)
        if (metadata.fetchedAt === undefined) {
            metadata = { ...metadata, fetchedAt: existing?.fetchedAt ?? Time.nowMs };
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
        const stored = await this.#revocationStorage.get<
            Record<string, string[] | { serials: string[]; issuerDnDerHex?: string }>
        >("index", {});
        for (const [key, value] of Object.entries(stored)) {
            if (Array.isArray(value)) {
                // Legacy format: plain array of serials
                this.#revocationIndex.set(key, { serials: new Set(value) });
            } else {
                this.#revocationIndex.set(key, {
                    serials: new Set(value.serials),
                    issuerDnDerHex: value.issuerDnDerHex,
                });
            }
        }
    }

    /**
     * Save the revocation index to storage.
     */
    async #saveRevocationIndex() {
        if (!this.#revocationStorage || this.#closed) return;
        const data: Record<string, { serials: string[]; issuerDnDerHex?: string }> = {};
        for (const [key, entry] of this.#revocationIndex) {
            data[key] = { serials: Array.from(entry.serials), issuerDnDerHex: entry.issuerDnDerHex };
        }
        await this.#revocationStorage.set("index", data);
    }

    /**
     * Fetch revocation distribution points from DCL and process them.
     *
     * Only production DCL is queried for revocation data. Revocation from test DCL is not
     * meaningful — test certificates are for development only and their revocation status
     * has no bearing on real device attestation decisions.
     */
    async #fetchRevocationData(force = false) {
        await this.#fetchRevocationFromDcl(force);
        await this.#saveRevocationIndex();
    }

    /**
     * Fetch revocation distribution points from production DCL and process them.
     */
    async #fetchRevocationFromDcl(force: boolean) {
        try {
            logger.debug("Fetching revocation distribution points from production DCL");

            const config = this.#options.dclConfig ?? DclConfig.production;
            const dclClient = new DclClient(config);
            const points = await dclClient.fetchRevocationDistributionPoints(this.#options);

            let updatedCount = 0;
            for (const point of points) {
                if (this.#closed) return;

                try {
                    await this.#processRevocationPoint(point, force);
                    updatedCount++;
                } catch (error) {
                    logger.info(`Failed to process revocation point for ${point.issuerSubjectKeyId}:`, error);
                }
            }

            if (updatedCount > 0) {
                logger.info(`Processed ${updatedCount} revocation distribution points`);
            }
        } catch (error) {
            logger.info("Failed to fetch revocation distribution points", error);
        }
    }

    /**
     * Process a single revocation distribution point: download the CRL, validate the signer chain
     * and CRL signature per spec Section 6.2.4.1, then extract revoked serial numbers.
     */
    async #processRevocationPoint(point: DeviceAttestationPkiRevocationDclSchema, force: boolean) {
        const issuerKeyId = this.#normalizeSubjectKeyId(point.issuerSubjectKeyId);

        // Skip if already processed (unless force)
        if (!force && this.#revocationIndex.has(issuerKeyId)) {
            return;
        }

        // Step 1: RevocationType must be CRL (1)
        if (point.revocationType !== RevocationTypeEnum.Crl) {
            logger.debug(`Skipping non-CRL revocation point (type=${point.revocationType})`);
            return;
        }

        // Steps 2-5: Parse and validate CRLSignerCertificate chain
        // Per spec 6.2.4.1, the signer chain should be validated before trusting the CRL.
        // If validation fails, we still process the CRL but skip signature verification.
        let signerPublicKey: Bytes | undefined;
        try {
            signerPublicKey = await this.#validateCrlSigner(point);
        } catch (error) {
            logger.info(
                `CRL signer validation failed for ${point.issuerSubjectKeyId}, skipping CRL signature check:`,
                error,
            );
        }

        // Step 6: Download the CRL from dataUrl
        const response = await fetch(point.dataUrl, {
            signal: AbortSignal.timeout(this.#options.timeout ?? Seconds(5)),
        });
        if (!response.ok) {
            throw new MatterDclError(`Failed to fetch CRL from ${point.dataUrl}: ${response.status}`);
        }
        const crlBytes = new Uint8Array(await response.arrayBuffer());

        // Parse the CRL
        const crlParsed = DclCertificateService.parseCrl(crlBytes);

        // Step 8: Validate CRL signature using CRLSignerCertificate public key (RFC 5280 Section 6.3)
        if (signerPublicKey !== undefined && crlParsed.tbsDer !== undefined && crlParsed.signatureValue !== undefined) {
            try {
                await this.#crypto.verifyEcdsa(
                    PublicKey(signerPublicKey),
                    crlParsed.tbsDer,
                    new EcdsaSignature(crlParsed.signatureValue, "der"),
                );
            } catch {
                throw new MatterDclError("CRL signature verification failed against CRLSignerCertificate");
            }
        }

        // Store in revocation index keyed by (AKID, issuerDN) per spec 6.2.4.2
        this.#revocationIndex.set(issuerKeyId, {
            serials: crlParsed.serials,
            issuerDnDerHex: crlParsed.issuerDnDerHex,
        });
    }

    /**
     * Validate the CRL signer certificate chain per spec Section 6.2.4.1 steps 2-5.
     * Returns the signer's public key for CRL signature verification, or throws on failure.
     */
    async #validateCrlSigner(point: DeviceAttestationPkiRevocationDclSchema): Promise<Bytes> {
        // Step 2: Parse CRLSignerCertificate from PEM
        const signerDer = Pem.asDer(point.crlSignerCertificate);
        const signerCert = point.isPAA ? Paa.fromAsn1(signerDer) : Pai.fromAsn1(signerDer);

        // Parse CRLSignerDelegator if present
        let delegatorCert: Pai | undefined;
        if (point.crlSignerDelegator) {
            const delegatorDer = Pem.asDer(point.crlSignerDelegator);
            delegatorCert = Pai.fromAsn1(delegatorDer);
        }

        // Steps 3-4: VendorID matching
        if (point.isPAA) {
            const signerVid = signerCert.cert.subject.vendorId;
            if (signerVid !== undefined && signerVid !== point.vid) {
                throw new MatterDclError(
                    `CRLSignerCertificate VendorID ${signerVid} does not match entry VendorID ${point.vid}`,
                );
            }
        } else {
            const certToCheck = delegatorCert ?? signerCert;
            const checkVid = certToCheck.cert.subject.vendorId;
            if (checkVid !== undefined && checkVid !== point.vid) {
                throw new MatterDclError(`CRL signer VendorID ${checkVid} does not match entry VendorID ${point.vid}`);
            }
            if (point.pid !== undefined) {
                const checkPid = certToCheck instanceof Pai ? certToCheck.cert.subject.productId : undefined;
                if (checkPid !== undefined && checkPid !== point.pid) {
                    throw new MatterDclError(
                        `CRL signer ProductID ${checkPid} does not match entry ProductID ${point.pid}`,
                    );
                }
            }
        }

        // Step 5: Validate certification path against PAA trust store
        const signerAkid = signerCert.cert.extensions.authorityKeyIdentifier;
        if (signerAkid !== undefined) {
            const signerAkidNorm = this.#normalizeSubjectKeyId(signerAkid);

            let issuerPublicKey: Bytes | undefined;
            if (delegatorCert !== undefined) {
                // Delegated signer: verify delegator chain to PAA
                const delegatorAkid = delegatorCert.cert.extensions.authorityKeyIdentifier;
                if (
                    delegatorAkid !== undefined &&
                    this.#certificateIndex.has(this.#normalizeSubjectKeyId(delegatorAkid))
                ) {
                    const paaDer = await this.getCertificateAsDer(delegatorAkid);
                    const paa = Paa.fromAsn1(paaDer);
                    await this.#crypto.verifyEcdsa(
                        PublicKey(paa.cert.ellipticCurvePublicKey),
                        delegatorCert.asUnsignedDer(),
                        delegatorCert.signature,
                    );
                }
                issuerPublicKey = delegatorCert.cert.ellipticCurvePublicKey;
            } else if (this.#certificateIndex.has(signerAkidNorm)) {
                const paaDer = await this.getCertificateAsDer(signerAkid);
                const paa = Paa.fromAsn1(paaDer);
                issuerPublicKey = paa.cert.ellipticCurvePublicKey;
            }

            if (issuerPublicKey !== undefined) {
                await this.#crypto.verifyEcdsa(
                    PublicKey(issuerPublicKey),
                    signerCert.asUnsignedDer(),
                    signerCert.signature,
                );
            } else {
                logger.warn(
                    `Cannot verify CRLSignerCertificate chain: issuer not in trust store (AKID: ${signerAkidNorm})`,
                );
            }
        }

        return signerCert.cert.ellipticCurvePublicKey;
    }

    /** Result of parsing a CRL. */
    static parseCrl(crlDer: Bytes): DclCertificateService.CrlParseResult {
        const serials = new Set<string>();

        const decoded = DerCodec.decode(crlDer);
        const certListElements = decoded._elements;
        if (!certListElements || certListElements.length < 2) {
            return { serials };
        }

        // CertificateList ::= SEQUENCE { tbsCertList, signatureAlgorithm, signatureValue }
        const tbsCertList = certListElements[0];
        const tbsElements = tbsCertList._elements;
        if (!tbsElements) {
            return { serials };
        }

        // Extract raw tbsCertList DER for signature verification
        const tbsDer = DerCodec.encode(tbsCertList);

        // Extract signatureValue (BIT STRING, last element)
        // signatureValue is the 3rd element (index 2) of the outer SEQUENCE
        let signatureValue: Bytes | undefined;
        if (certListElements.length >= 3 && certListElements[2]._tag === 0x03) {
            // BIT STRING _bytes already has padding byte stripped by DerCodec.decode
            signatureValue = Bytes.of(certListElements[2]._bytes);
        }

        // tbsCertList fields: [version?, signature, issuer, thisUpdate, nextUpdate?, revokedCertificates?, crlExtensions?]
        let idx = 0;
        // version is optional: if present it's an INTEGER
        if (tbsElements[idx]?._tag === 0x02) {
            idx++;
        }
        // signature algorithm: SEQUENCE
        if (tbsElements[idx]?._tag === 0x30) {
            idx++;
        }
        // issuer Name: SEQUENCE — hash its raw DER bytes for use as composite revocation key
        let issuerDnDerHex: string | undefined;
        if (tbsElements[idx]?._tag === 0x30) {
            const issuerNode = tbsElements[idx];
            issuerDnDerHex = Bytes.toHex(DerCodec.encode(issuerNode)).toUpperCase();
        }

        // Extract Authority Key Identifier from CRL extensions if present
        // crlExtensions is a context-tagged [0] EXPLICIT at the end of tbsCertList
        let authorityKeyId: string | undefined;
        for (const element of tbsElements) {
            // Context-tagged [0] EXPLICIT = tag 0xa0
            if (element._tag === 0xa0 && element._bytes) {
                // Parse the extensions SEQUENCE inside the context tag
                const extSequence = DerCodec.decode(element._bytes);
                if (extSequence._elements) {
                    for (const ext of extSequence._elements) {
                        if (!ext._elements || ext._elements.length < 2) continue;
                        const oid = Bytes.toHex(ext._elements[0]._bytes);
                        // Authority Key Identifier OID: 2.5.29.35 = 551d23
                        if (oid === "551d23") {
                            // The value is an OCTET STRING containing a SEQUENCE
                            const valueIdx = ext._elements.length > 2 ? 2 : 1;
                            const akiOctetString = ext._elements[valueIdx];
                            if (akiOctetString._bytes) {
                                const akiSeq = DerCodec.decode(akiOctetString._bytes);
                                // KeyIdentifier is context-tagged [0] inside the SEQUENCE
                                if (akiSeq._elements) {
                                    for (const akiField of akiSeq._elements) {
                                        if (akiField._tag === 0x80) {
                                            authorityKeyId = Bytes.toHex(Bytes.of(akiField._bytes)).toUpperCase();
                                            break;
                                        }
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }

        // Find the revokedCertificates sequence
        let revokedCertsNode: DerNode | undefined;
        for (const element of tbsElements) {
            if (element._tag === 0x30 && element._elements) {
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
            return { serials, issuerDnDerHex, authorityKeyId, tbsDer, signatureValue };
        }

        for (const entry of revokedCertsNode._elements) {
            if (entry._tag !== 0x30 || !entry._elements || entry._elements.length < 1) continue;
            const serialNode = entry._elements[0];
            if (serialNode._tag !== 0x02) continue;
            const serialHex = Bytes.toHex(Bytes.of(serialNode._bytes)).toUpperCase();
            serials.add(serialHex);
        }

        return { serials, issuerDnDerHex, authorityKeyId, tbsDer, signatureValue };
    }

    /** Convenience wrapper that returns only the revoked serial numbers from a CRL. */
    static parseCrlRevokedSerials(crlDer: Bytes): Set<string> {
        return DclCertificateService.parseCrl(crlDer).serials;
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
        /** Epoch timestamp (ms) when this certificate was first fetched and added to the local trust store. */
        fetchedAt?: number;
    };

    /** Result of parsing a DER-encoded CRL. */
    export interface CrlParseResult {
        /** Revoked serial numbers (uppercase hex). */
        serials: Set<string>;
        /** Hex of the DER-encoded issuer Name, for composite revocation key matching. */
        issuerDnDerHex?: string;
        /** CRL Authority Key Identifier extension value (uppercase hex). */
        authorityKeyId?: string;
        /** Raw DER bytes of tbsCertList for signature verification. */
        tbsDer?: Bytes;
        /** Raw signature value bytes from the CRL. */
        signatureValue?: Bytes;
    }
}
