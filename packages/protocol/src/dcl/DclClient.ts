/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DclApiErrorResponse,
    DclModelModelsWithVidPidResponse,
    DclModelVersionsWithVidPidResponse,
    DclModelVersionWithVidPidSoftwareVersionResponse,
    DclPkiCertificateResponse,
    DclPkiRootCertificatesResponse,
    DclPkiRootCertificateSubjectReference,
    DclVendorInfo,
} from "#dcl/DclRestApiTypes.js";
import { Duration, Logger, MatterError, Seconds } from "#general";

const logger = new Logger("DclClient");

// Swagger for DCL: https://zigbee-alliance.github.io/distributed-compliance-ledger/#/
const DCL_PRODUCTION_URL = "https://on.dcl.csa-iot.org";
const DCL_TEST_URL = "https://on.test-net.dcl.csa-iot.org";

const DEFAULT_DCL_TIMEOUT = Seconds(5);

/** Base class for all DCL-related errors */
export class MatterDclError extends MatterError {}

/** Error thrown when fetching data from DCL fails */
export class MatterDclResponseError extends MatterDclError {
    constructor(path: string, error: DclApiErrorResponse, options?: ErrorOptions) {
        super(`Error fetching ${path} from DCL: ${error.code} - ${error.message}`, options);
    }
}

/** A client clas to use "fetch" to get REST DAta from DCL (Decentraland) */
export class DclClient {
    #baseUrl: string;

    constructor(private readonly production: boolean = true) {
        this.#baseUrl = this.production ? DCL_PRODUCTION_URL : DCL_TEST_URL;
    }

    async #fetchPaginatedJson<ItemT>(path: string, options?: DclClient.Options): Promise<ItemT[]> {
        const allItems: any[] = [];
        let nextKey: string | undefined;

        do {
            // Append pagination key to path if present
            const currentPath =
                nextKey !== undefined
                    ? `${path}${path.includes("?") ? "&" : "?"}pagination.key=${encodeURIComponent(nextKey)}`
                    : path;

            const response = await this.#fetchJson<any>(currentPath, options);

            // Auto-detect the data field (it's the field that's not "pagination")
            const dataField = Object.keys(response || {}).find(key => key !== "pagination");
            if (dataField) {
                const items = response[dataField];
                if (items && Array.isArray(items)) {
                    allItems.push(...items);
                }
            }

            // Check for next page
            nextKey = response?.pagination?.next_key;
        } while (nextKey);

        return allItems;
    }

    async #fetchJson<ResponseT>(path: string, options?: DclClient.Options): Promise<ResponseT> {
        const url = new URL(path, this.#baseUrl).toString();
        logger.debug(`Fetching for DCL:`, url);
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
            MatterError.accept(error);
            throw new MatterDclResponseError(
                path,
                {
                    code: 500,
                    message: error.message,
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
        return this.#fetchPaginatedJson<DclVendorInfo>("/dcl/vendorinfo/vendors", options);
    }
}

export namespace DclClient {
    export interface Options {
        /** Timeout for DCL requests. Default is 5s. */
        timeout?: Duration;
    }
}
