/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ComplianceHistoryItemDclSchema,
    DeviceModelDclSchema,
    DeviceSoftwareComplianceDclSchema,
    DeviceSoftwareVersionModelDclSchema,
    ProductAttestationDclSchema,
    VendorDclSchema,
} from "@matter/types";

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

/** Response for /dcl/pki/all-certificates?subjectKeyId=<skid> */
export interface DclPkiAllCertificatesBySkidResponse {
    certificates: Array<{
        subject: string;
        subjectKeyId: string;
        certs: DclProductAttestationRaw[];
        schemaVersion: number;
    }>;
}

/** Response for /dcl/pki/certificates/{subject}/{subjectKeyId} */
export interface DclPkiCertificateResponse {
    approvedCertificates: {
        subject: string;
        subjectKeyId: string;
        certs: DclProductAttestationRaw[];
        schemaVersion: number;
    };
}

/** Response for /dcl/model/models/{vid}/{pid} */
export interface DclModelModelsWithVidPidResponse {
    model: DclDeviceModelRaw;
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
    modelVersion: DclDeviceSoftwareVersionModelRaw;
}

/*
 * The DCL REST API sends every field of a record and encodes an unset optional field as `""` or `0`. The `*Raw` types
 * describe that wire form; `DclClient` maps them to the schema types, whose optional fields are `undefined` when unset.
 */

/**
 * PAA or PAI certificate record as returned by the DCL REST API.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.23.5
 */
export type DclProductAttestationRaw = Required<ProductAttestationDclSchema>;

/**
 * Device model record as returned by the DCL REST API.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.23.7
 */
export type DclDeviceModelRaw = Required<DeviceModelDclSchema>;

/**
 * Vendor record as returned by the DCL REST API.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.23.3
 */
export type DclVendorRaw = Required<VendorDclSchema>;

/**
 * Compliance record as returned by the DCL REST API, including the four fields the specification publishes as
 * deprecated.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.23.10
 */
export interface DclComplianceInfoRaw extends Required<Omit<DeviceSoftwareComplianceDclSchema, "history">> {
    history: Required<ComplianceHistoryItemDclSchema>[];
    compliantPlatformUsed: string;
    compliantPlatformVersion: string;
    certificationIdOfSoftwareComponent: string;
    OSVersion: string;
}

/**
 * Device software version record as returned by the DCL REST API; the uint64 `otaFileSize` is a decimal string.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.23.8
 */
export interface DclDeviceSoftwareVersionModelRaw extends Required<
    Omit<DeviceSoftwareVersionModelDclSchema, "otaFileSize">
> {
    otaFileSize: string;
}

/** Response for /dcl/compliance/compliance-info/{vid}/{pid}/{softwareVersion}/{certificationType} */
export interface DclComplianceInfoResponse {
    complianceInfo: DclComplianceInfoRaw;
}

/**
 * @deprecated Use {@link VendorDclSchema}.
 */
export type DclVendorInfo = VendorDclSchema;

/**
 * Raw revocation distribution point entry as returned by the DCL REST API.
 * Note: The DCL API uses "issuerSubjectKeyID" (capital ID) and "dataURL" (capital URL),
 * which differ from the DeviceAttestationPkiRevocationDclSchema field naming convention.
 */
export interface DclPkiRevocationDistributionPointRaw {
    vid: number;
    pid: number;
    isPAA: boolean;
    label: string;
    crlSignerDelegator: string;
    crlSignerCertificate: string;
    issuerSubjectKeyID: string;
    dataURL: string;
    dataFileSize: string;
    dataDigest: string;
    dataDigestType: number;
    revocationType: number;
    schemaVersion: number;
}

/** Response for /dcl/pki/revocation-points/{issuerSubjectKeyId} */
export interface DclPkiRevocationPointsByIssuerResponse {
    pkiRevocationDistributionPointsByIssuerSubjectKeyID: {
        issuerSubjectKeyID: string;
        points: DclPkiRevocationDistributionPointRaw[];
        schemaVersion: number;
    };
}
