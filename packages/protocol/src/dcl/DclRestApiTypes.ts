/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceModelDclSchema, DeviceSoftwareVersionModelDclSchema, ProductAttestationDclSchema } from "#types";

export interface DclApiErrorResponse {
    code: number;
    message: string;
    details: string[];
}

export interface DclPkiRootCertificateSubjectReference {
    subject: string;
    subjectKeyId: string;
}

/** Response for /dcl/pki/root-certificates */
export interface DclPkiRootCertificatesResponse {
    approvedRootCertificates: {
        certs: DclPkiRootCertificateSubjectReference[];
        schemaVersion: number;
    };
}

/** Response for /dcl/pki/certificates/{subject}/{subjectKeyId} */
export interface DclPkiCertificateResponse {
    approvedCertificates: {
        subject: string;
        subjectKeyId: string;
        certs: ProductAttestationDclSchema[];
        schemaVersion: number;
    };
}

/** Response for /dcl/model/models/{vid}/{pid} */
export interface DclModelModelsWithVidPidResponse {
    model: DeviceModelDclSchema;
}

/** Response for /dcl/model/versions/{vid}/{pid} */
export interface DclModelVersionsWithVidPidResponse {
    modelVersions: {
        vid: number;
        pid: number;
        softwareVersions: number[];
        schemaVersion: number;
    };
}

/** Response for /dcl/model/versions/{vid}/{pid}/{softwareVersion} */
export interface DclModelVersionWithVidPidSoftwareVersionResponse {
    modelVersion: DeviceSoftwareVersionModelDclSchema;
}
