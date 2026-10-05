/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclConfig } from "#dcl/DclConfig.js";
import {
    DclApiErrorResponse,
    DclComplianceInfoRaw,
    DclComplianceInfoResponse,
    DclDeviceModelRaw,
    DclDeviceSoftwareVersionModelRaw,
    DclModelModelsWithVidPidResponse,
    DclModelVersionsWithVidPidResponse,
    DclModelVersionWithVidPidSoftwareVersionResponse,
    DclPkiAllCertificatesBySkidResponse,
    DclPkiCertificateResponse,
    DclPkiRevocationDistributionPointRaw,
    DclPkiRevocationPointsByIssuerResponse,
    DclPkiRootCertificatesResponse,
    DclPkiRootCertificateSubjectReference,
    DclProductAttestationRaw,
    DclVendorRaw,
} from "#dcl/DclRestApiTypes.js";
import { Duration, Logger, MatterError, Seconds } from "@matter/general";
import {
    DeviceAttestationPkiRevocationDclSchema,
    DeviceModelDclSchema,
    DeviceSoftwareComplianceDclSchema,
    DeviceSoftwareVersionModelDclSchema,
    ProductAttestationDclSchema,
    VendorDclSchema,
    VendorId,
} from "@matter/types";

const logger = new Logger("DclClient");

const DEFAULT_DCL_TIMEOUT = Seconds(5);

/** Base class for all DCL-related errors */
export class MatterDclError extends MatterError {}

/** Error thrown when fetching data from DCL fails */
export class MatterDclResponseError extends MatterDclError {
    readonly response: DclApiErrorResponse;

    constructor(path: string, error: DclApiErrorResponse, options?: ErrorOptions) {
        super(`Error fetching ${path} from DCL: ${error.code} - ${error.message}`, options);
        this.response = error;
    }
}

/** A client class to use "fetch" to get REST data from DCL (Distributed Compliance Ledger) */
export class DclClient {
    #baseUrl: string;

    constructor(config: DclConfig = DclConfig.production) {
        this.#baseUrl = config.url;
    }

    async #fetchPaginatedJson<ItemT>(
        path: string,
        paginatedField: string,
        options?: DclClient.Options,
    ): Promise<ItemT[]> {
        const allItems: ItemT[] = [];
        let nextKey: string | undefined;

        do {
            // Append pagination key to path if present
            const currentPath =
                nextKey !== undefined
                    ? `${path}${path.includes("?") ? "&" : "?"}pagination.key=${encodeURIComponent(nextKey)}`
                    : path;

            const response = await this.#fetchJson<any>(currentPath, options);

            const items = response[paginatedField];
            if (items && Array.isArray(items)) {
                allItems.push(...items);
            }

            // Check for next page
            nextKey = response?.pagination?.next_key;
        } while (nextKey);

        return allItems;
    }

    async #fetchJson<ResponseT>(path: string, options?: DclClient.Options): Promise<ResponseT> {
        const url = new URL(path, this.#baseUrl).toString();
        logger.debug(`Fetching from DCL:`, url);
        try {
            const timeoutMs = options?.timeout ?? DEFAULT_DCL_TIMEOUT;
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                signal: AbortSignal.timeout(timeoutMs),
            });

            if (!response.ok) {
                throw new MatterDclResponseError(path, await response.json());
            }

            return await response.json();
        } catch (error) {
            MatterDclResponseError.reject(error);
            throw new MatterDclResponseError(
                path,
                {
                    code: 500,
                    message: (error as Error).message ?? error,
                    details: [],
                },
                { cause: error },
            );
        }
    }

    async fetchRootCertificateList(options?: DclClient.Options) {
        const certList = await this.#fetchJson<DclPkiRootCertificatesResponse>("/dcl/pki/root-certificates", options);
        if (certList?.approvedRootCertificates?.schemaVersion !== 0) {
            throw new MatterDclError(
                `Unsupported DCL Root Certificate schema version: ${certList.approvedRootCertificates.schemaVersion}`,
            );
        }
        return certList.approvedRootCertificates.certs;
    }

    /**
     * Fetch certificates by their SubjectKeyIdentifier from the DCL. Useful for looking up
     * certificates without knowing their subject DN (e.g. CD signer certificates referenced
     * only by SKID in Certification Declarations).
     *
     * Returns an empty array if no matching certificates exist.
     */
    async fetchCertificatesBySubjectKeyId(subjectKeyId: string, options?: DclClient.Options) {
        // DCL expects SKID as colon-separated uppercase hex (e.g. "FE:34:3F:...")
        const normalized = subjectKeyId.replace(/:/g, "").toUpperCase();
        const skidWithColons = normalized.match(/.{1,2}/g)?.join(":") ?? normalized;
        const path = `/dcl/pki/all-certificates?subjectKeyId=${encodeURIComponent(skidWithColons)}`;
        const response = await this.#fetchJson<DclPkiAllCertificatesBySkidResponse>(path, options);
        const groups = supportedRecords(response?.certificates ?? [], "certificate group");
        const results = new Array<ProductAttestationDclSchema>();
        for (const group of groups) {
            results.push(...supportedRecords(group.certs ?? [], "certificate").map(mapRawCertificate));
        }
        return results;
    }

    async fetchRootCertificateBySubject(subject: DclPkiRootCertificateSubjectReference, options?: DclClient.Options) {
        const path = `/dcl/pki/certificates/${encodeURIComponent(subject.subject)}/${encodeURIComponent(subject.subjectKeyId)}`;
        const response = await this.#fetchJson<DclPkiCertificateResponse>(path, options);
        if (
            !response ||
            !response.approvedCertificates ||
            response.approvedCertificates.subject !== subject.subject ||
            response.approvedCertificates.subjectKeyId !== subject.subjectKeyId ||
            response.approvedCertificates.schemaVersion !== 0
        ) {
            throw new MatterDclError(
                `Root certificate not found for subject: ${subject.subject}, subjectKeyId: ${subject.subjectKeyId}`,
            );
        }
        return supportedRecords(response.approvedCertificates.certs, "certificate").map(mapRawCertificate);
    }

    async fetchModelByVidPid(vid: number, pid: number, options?: DclClient.Options) {
        const path = `/dcl/model/models/${encodeURIComponent(vid)}/${encodeURIComponent(pid)}`;
        const response = await this.#fetchJson<DclModelModelsWithVidPidResponse>(path, options);
        if (
            !response ||
            !response.model ||
            response.model.vid !== vid ||
            response.model.pid !== pid ||
            response.model.schemaVersion !== 0
        ) {
            throw new MatterDclError(`Model not found for VID: ${vid}, PID: ${pid}`);
        }
        return mapRawDeviceModel(response.model);
    }

    async fetchModelVersionsByVidPid(vid: number, pid: number, options?: DclClient.Options) {
        const path = `/dcl/model/versions/${encodeURIComponent(vid)}/${encodeURIComponent(pid)}`;
        const response = await this.#fetchJson<DclModelVersionsWithVidPidResponse>(path, options);
        if (
            !response ||
            !response.modelVersions ||
            response.modelVersions.vid !== vid ||
            response.modelVersions.pid !== pid ||
            response.modelVersions.schemaVersion !== 0
        ) {
            throw new MatterDclError(`Model versions not found for VID: ${vid}, PID: ${pid}`);
        }
        return response.modelVersions.softwareVersions;
    }

    async fetchModelVersionByVidPidSoftwareVersion(
        vid: number,
        pid: number,
        softwareVersion: number,
        options?: DclClient.Options,
    ) {
        const path = `/dcl/model/versions/${encodeURIComponent(vid)}/${encodeURIComponent(pid)}/${encodeURIComponent(softwareVersion)}`;
        const response = await this.#fetchJson<DclModelVersionWithVidPidSoftwareVersionResponse>(path, options);
        if (
            !response ||
            !response.modelVersion ||
            response.modelVersion.vid !== vid ||
            response.modelVersion.pid !== pid ||
            response.modelVersion.softwareVersion !== softwareVersion ||
            response.modelVersion.schemaVersion !== 0
        ) {
            throw new MatterDclError(
                `Model version not found for VID: ${vid}, PID: ${pid}, Software Version: ${softwareVersion}`,
            );
        }
        return mapRawModelVersion(response.modelVersion);
    }

    /**
     * Fetch the compliance record of a software version for a certification program.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.23.10
     */
    async fetchComplianceInfo(
        vid: number,
        pid: number,
        softwareVersion: number,
        certificationType: string,
        options?: DclClient.Options,
    ) {
        const path = `/dcl/compliance/compliance-info/${encodeURIComponent(vid)}/${encodeURIComponent(pid)}/${encodeURIComponent(softwareVersion)}/${encodeURIComponent(certificationType)}`;
        const response = await this.#fetchJson<DclComplianceInfoResponse>(path, options);
        const info = response?.complianceInfo;
        if (
            !info ||
            info.vid !== vid ||
            info.pid !== pid ||
            info.softwareVersion !== softwareVersion ||
            info.certificationType !== certificationType
        ) {
            throw new MatterDclError(
                `Compliance info not found for VID: ${vid}, PID: ${pid}, Software Version: ${softwareVersion}, Certification Type: ${certificationType}`,
            );
        }
        // SchemaVersion 0 and 1 are the ones §11.23.10.15 defines; a later version may change field meanings.
        if (![0, 1].includes(info.schemaVersion)) {
            throw new MatterDclError(
                `Unsupported DCL compliance info schema version ${info.schemaVersion} for VID: ${vid}, PID: ${pid}, Software Version: ${softwareVersion}`,
            );
        }
        return mapRawComplianceInfo(info);
    }

    /**
     * Fetch all vendor information from DCL
     */
    async fetchAllVendors(options?: DclClient.Options) {
        const vendors = await this.#fetchPaginatedJson<DclVendorRaw>("/dcl/vendorinfo/vendors", "vendorInfo", options);
        return supportedRecords(vendors, "vendor").map(mapRawVendor);
    }

    /**
     * Fetch all revocation distribution point entries from DCL.
     * Uses pagination to retrieve all entries across multiple pages.
     */
    async fetchRevocationDistributionPoints(
        options?: DclClient.Options,
    ): Promise<DeviceAttestationPkiRevocationDclSchema[]> {
        const rawItems = await this.#fetchPaginatedJson<DclPkiRevocationDistributionPointRaw>(
            "/dcl/pki/revocation-points",
            "PkiRevocationDistributionPoint",
            options,
        );
        return supportedRecords(rawItems, "revocation point").map(mapRawRevocationPoint);
    }

    /**
     * Fetch revocation distribution points for a specific issuer by their subject key identifier.
     */
    async fetchRevocationDistributionPointsByIssuer(
        issuerSubjectKeyId: string,
        options?: DclClient.Options,
    ): Promise<DeviceAttestationPkiRevocationDclSchema[]> {
        const path = `/dcl/pki/revocation-points/${encodeURIComponent(issuerSubjectKeyId)}`;
        const response = await this.#fetchJson<DclPkiRevocationPointsByIssuerResponse>(path, options);
        const byIssuer = response?.pkiRevocationDistributionPointsByIssuerSubjectKeyID;
        if (byIssuer !== undefined && byIssuer.schemaVersion !== 0) {
            throw new MatterDclError(
                `Unsupported DCL revocation points schema version ${byIssuer.schemaVersion} for issuer ${issuerSubjectKeyId}`,
            );
        }
        return supportedRecords(byIssuer?.points ?? [], "revocation point").map(mapRawRevocationPoint);
    }
}

/**
 * Returns the records with a schema version this client can interpret. A later schema version may change what a field
 * means, so such records are dropped instead of being read with the known layout.
 */
function supportedRecords<T extends { schemaVersion: number }>(records: T[], kind: string) {
    const supported = records.filter(({ schemaVersion }) => schemaVersion === 0);
    if (supported.length < records.length) {
        logger.warn(
            `Ignoring ${records.length - supported.length} DCL ${kind} record(s) with unsupported schema version`,
        );
    }
    return supported;
}

function mapRawVendor(raw: DclVendorRaw): VendorDclSchema {
    return {
        ...raw,
        companyPreferredName: raw.companyPreferredName || undefined,
        vendorLandingPageURL: raw.vendorLandingPageURL || undefined,
    };
}

function mapRawCertificate(raw: DclProductAttestationRaw): ProductAttestationDclSchema {
    return {
        ...raw,
        issuer: raw.issuer || undefined,
        authorityKeyId: raw.authorityKeyId || undefined,
        rootSubject: raw.rootSubject || undefined,
        rootSubjectKeyId: raw.rootSubjectKeyId || undefined,
    };
}

/**
 * The LSF revision and the Terms and Conditions revision, digest and size only have a meaning when their URL is set
 * (Core §11.23.7.20, §11.23.7.24-26).
 */
function mapRawDeviceModel(raw: DclDeviceModelRaw): DeviceModelDclSchema {
    const hasTc = raw.enhancedSetupFlowTCUrl !== "";
    return {
        ...raw,
        commissioningCustomFlowUrl: raw.commissioningCustomFlowUrl || undefined,
        commissioningModeInitialStepsInstruction: raw.commissioningModeInitialStepsInstruction || undefined,
        commissioningModeSecondaryStepsInstruction: raw.commissioningModeSecondaryStepsInstruction || undefined,
        commissioningFallbackUrl: raw.commissioningFallbackUrl || undefined,
        userManualUrl: raw.userManualUrl || undefined,
        supportUrl: raw.supportUrl || undefined,
        productUrl: raw.productUrl || undefined,
        lsfUrl: raw.lsfUrl || undefined,
        lsfRevision: raw.lsfUrl ? raw.lsfRevision : undefined,
        enhancedSetupFlowTCUrl: raw.enhancedSetupFlowTCUrl || undefined,
        enhancedSetupFlowTCRevision: hasTc ? raw.enhancedSetupFlowTCRevision : undefined,
        enhancedSetupFlowTCDigest: hasTc ? raw.enhancedSetupFlowTCDigest || undefined : undefined,
        enhancedSetupFlowTCFileSize: hasTc ? raw.enhancedSetupFlowTCFileSize || undefined : undefined,
        maintenanceUrl: raw.maintenanceUrl || undefined,
        icdUserActiveModeTriggerInstruction: raw.icdUserActiveModeTriggerInstruction || undefined,
        factoryResetStepsInstruction: raw.factoryResetStepsInstruction || undefined,
    };
}

function mapRawComplianceInfo(raw: DclComplianceInfoRaw): DeviceSoftwareComplianceDclSchema {
    const {
        compliantPlatformUsed: _compliantPlatformUsed,
        compliantPlatformVersion: _compliantPlatformVersion,
        certificationIdOfSoftwareComponent: _certificationIdOfSoftwareComponent,
        OSVersion: _osVersion,
        ...fields
    } = raw;
    return {
        ...fields,
        specificationVersion: raw.specificationVersion || undefined,
        history: raw.history.map(item => ({ ...item, reason: item.reason || undefined })),
        certificationRoute: raw.certificationRoute || undefined,
        reason: raw.reason || undefined,
        transport: raw.transport || undefined,
        familyId: raw.familyId || undefined,
        supportedClusters: raw.supportedClusters || undefined,
        programType: raw.programType || undefined,
        programTypeVersion: raw.programTypeVersion || undefined,
        parentChild: raw.parentChild || undefined,
    };
}

/**
 * Maps a raw DCL device software version entry to {@link DeviceSoftwareVersionModelDclSchema}. The DCL sends unset
 * optional fields as `""` or `0`; they become `undefined`.
 */
function mapRawModelVersion(raw: DclDeviceSoftwareVersionModelRaw): DeviceSoftwareVersionModelDclSchema {
    const otaFileSize = /^\d+$/.test(raw.otaFileSize) ? BigInt(raw.otaFileSize) : 0n;
    return {
        ...raw,
        firmwareInformation: raw.firmwareInformation || undefined,
        otaUrl: raw.otaUrl || undefined,
        otaFileSize: otaFileSize > 0n ? otaFileSize : undefined,
        otaChecksum: raw.otaChecksum || undefined,
        otaChecksumType: raw.otaChecksumType || undefined,
        releaseNotesUrl: raw.releaseNotesUrl || undefined,
        specificationVersion: raw.specificationVersion || undefined,
    };
}

/**
 * Maps a raw DCL revocation distribution point entry to the DeviceAttestationPkiRevocationDclSchema format.
 * The DCL API uses "issuerSubjectKeyID" (capital ID) and "dataURL" (capital URL), while the
 * DeviceAttestationPkiRevocationDclSchema uses "issuerSubjectKeyId" and "dataUrl".
 */
function mapRawRevocationPoint(raw: DclPkiRevocationDistributionPointRaw): DeviceAttestationPkiRevocationDclSchema {
    return {
        vid: VendorId(raw.vid, false),
        pid: raw.pid || undefined,
        isPAA: raw.isPAA,
        label: raw.label,
        crlSignerDelegator: raw.crlSignerDelegator || undefined,
        crlSignerCertificate: raw.crlSignerCertificate,
        issuerSubjectKeyId: raw.issuerSubjectKeyID,
        dataUrl: raw.dataURL,
        dataFileSize: raw.dataFileSize ? parseInt(raw.dataFileSize, 10) || undefined : undefined,
        dataDigest: raw.dataDigest || undefined,
        dataDigestType: raw.dataDigestType || undefined,
        revocationType: raw.revocationType,
        schemaVersion: raw.schemaVersion,
    };
}

export namespace DclClient {
    export interface Options {
        /** Timeout for DCL requests. Default is 5s. */
        timeout?: Duration;
    }
}
