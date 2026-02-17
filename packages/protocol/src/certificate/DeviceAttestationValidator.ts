/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, MaybePromise } from "#general";
import { VendorId } from "#types";
import { DclCertificateService } from "../dcl/DclCertificateService.js";
import { CommissioningError } from "../peer/CommissioningError.js";

/** Reasons a device attestation validation can fail. */
export enum DeviceAttestationFailure {
    PaaNotTrusted = "PaaNotTrusted",
    CertificateChainInvalid = "CertificateChainInvalid",
    CertificateExpired = "CertificateExpired",
    VendorIdMismatch = "VendorIdMismatch",
    ProductIdMismatch = "ProductIdMismatch",
    AttestationSignatureInvalid = "AttestationSignatureInvalid",
    AttestationNonceMismatch = "AttestationNonceMismatch",
    CertificationDeclarationSignatureInvalid = "CertificationDeclarationSignatureInvalid",
    CertificationDeclarationFieldMismatch = "CertificationDeclarationFieldMismatch",
    CertificateRevoked = "CertificateRevoked",
    FirmwareInfoMismatch = "FirmwareInfoMismatch",
}

/** Error thrown when device attestation validation fails. */
export class DeviceAttestationError extends CommissioningError {
    constructor(
        readonly failure: DeviceAttestationFailure,
        message: string,
    ) {
        super(message);
    }
}

export namespace DeviceAttestationValidator {
    export interface Context {
        crypto: Crypto;
        dclCertificateService: DclCertificateService;
        attestationChallenge: Bytes;
    }

    export interface DeviceAttestationData {
        dac: Bytes;
        pai: Bytes;
        attestationElements: Bytes;
        attestationSignature: Bytes;
        attestationNonce: Bytes;
        vendorId: VendorId;
        productId: number;
    }

    export type OnAttestationFailure =
        | boolean
        | ((failure: DeviceAttestationFailure, reason: string) => MaybePromise<boolean>);

    export async function validate(_context: Context, _data: DeviceAttestationData): Promise<void> {
        // Will be implemented step by step in subsequent tasks
    }
}
