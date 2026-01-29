/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceModelDclSchema, DeviceSoftwareVersionModelDclSchema, ProductAttestationDclSchema } from "#types";

/**
 * DCL Error codes
 * from https://pkg.go.dev/google.golang.org/grpc@v1.60.1/codes
 */
export enum DclErrorCodes {
    Ok = 0,
    Canceled = 1,
    Unknown = 2,
    InvalidArgument = 3,
    DeadlineExceeded = 4,
    NotFound = 5,
    AlreadyExists = 6,
    PermissionDenied = 7,
    ResourceExhausted = 8,
    FailedPrecondition = 9,
    Aborted = 10,
    OutOfRange = 11,
    Unimplemented = 12,
    Internal = 13,
    Unavailable = 14,
    DataLoss = 15,
    Unauthenticated = 16,
}

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

/** Vendor information from DCL */
export interface DclVendorInfo {
    vendorID: number;
    vendorName: string;
    companyLegalName: string;
    companyPreferredName: string;
    vendorLandingPageURL: string;
    creator: string;
    schemaVersion?: number;
}
