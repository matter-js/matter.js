/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, MaybePromise, PublicKey } from "#general";
import { VendorId } from "#types";
import { DclCertificateService } from "../dcl/DclCertificateService.js";
import { Dac, Paa, Pai } from "./kinds/AttestationCertificates.js";
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

    export async function validate(context: Context, data: DeviceAttestationData): Promise<void> {
        const { crypto, dclCertificateService } = context;

        // Step 1: Parse DAC and PAI from DER
        const dac = Dac.fromAsn1(data.dac);
        const pai = Pai.fromAsn1(data.pai);

        // Step 2: PAA Trust Store lookup - find PAA by PAI's authority key identifier
        const paiAkid = pai.cert.extensions.authorityKeyIdentifier;
        const paaMetadata = dclCertificateService.getCertificate(paiAkid);
        if (paaMetadata === undefined) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.PaaNotTrusted,
                `PAA not found in trust store for authority key identifier ${Bytes.toHex(paiAkid)}`,
            );
        }

        // Step 3: Certificate chain signature verification
        // Get PAA certificate DER bytes from storage and parse
        const paaDer = await dclCertificateService.getCertificateAsDer(paiAkid);
        const paa = Paa.fromAsn1(paaDer);

        // Verify PAI is signed by PAA
        try {
            await crypto.verifyEcdsa(
                PublicKey(paa.cert.ellipticCurvePublicKey),
                pai.asUnsignedDer(),
                pai.signature,
            );
        } catch (error) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificateChainInvalid,
                `PAI signature verification failed: ${error}`,
            );
        }

        // Verify DAC is signed by PAI
        try {
            await crypto.verifyEcdsa(
                PublicKey(pai.cert.ellipticCurvePublicKey),
                dac.asUnsignedDer(),
                dac.signature,
            );
        } catch (error) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificateChainInvalid,
                `DAC signature verification failed: ${error}`,
            );
        }

        // Step 4: VendorID matching
        // DAC vendorId must match PAI vendorId
        if (dac.cert.subject.vendorId !== pai.cert.subject.vendorId) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.VendorIdMismatch,
                `DAC vendorId ${dac.cert.subject.vendorId} does not match PAI vendorId ${pai.cert.subject.vendorId}`,
            );
        }

        // If PAA has a vendorId, it must match PAI vendorId
        const paaVendorId = paa.cert.subject.vendorId;
        if (paaVendorId !== undefined && paaVendorId !== pai.cert.subject.vendorId) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.VendorIdMismatch,
                `PAA vendorId ${paaVendorId} does not match PAI vendorId ${pai.cert.subject.vendorId}`,
            );
        }
    }
}
