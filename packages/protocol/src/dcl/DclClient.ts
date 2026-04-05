/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { DclConfig } from "#dcl/DclConfig.js";
import {
    DclApiErrorResponse,
    DclModelModelsWithVidPidResponse,
    DclModelVersionsWithVidPidResponse,
    DclModelVersionWithVidPidSoftwareVersionResponse,
    DclPkiCertificateResponse,
    DclPkiRevocationDistributionPointRaw,
    DclPkiRevocationPointsByIssuerResponse,
    DclPkiRootCertificatesResponse,
    DclPkiRootCertificateSubjectReference,
    DclVendorInfo,
} from "#dcl/DclRestApiTypes.js";
import { DeviceAttestationPkiRevocationDclSchema, VendorId } from "@matter/types";
import { Duration, Logger, MatterError, Seconds } from "@matter/general";

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
        return response.approvedCertificates.certs;
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
        return response.model;
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
        return response.modelVersion;
    }

    /**
     * Fetch all vendor information from DCL
     */
    async fetchAllVendors(options?: DclClient.Options) {
        return this.#fetchPaginatedJson<DclVendorInfo>("/dcl/vendorinfo/vendors", "vendorInfo", options);
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
        return rawItems.map(mapRawRevocationPoint);
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
        const rawPoints = response?.pkiRevocationDistributionPointsByIssuerSubjectKeyID?.points ?? [];
        return rawPoints.map(mapRawRevocationPoint);
    }
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
