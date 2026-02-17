/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, EcdsaSignature, Logger, MaybePromise, PublicKey } from "#general";
import { VendorId } from "#types";
import { TlvAttestation } from "../common/OperationalCredentialsTypes.js";
import { DclCertificateService } from "../dcl/DclCertificateService.js";
import { Dac, Paa, Pai } from "./kinds/AttestationCertificates.js";
import { CertificationDeclaration } from "./kinds/CertificationDeclaration.js";
import { CommissioningError } from "../peer/CommissioningError.js";

const logger = Logger.get("DeviceAttestationValidator");

/** Reasons a device attestation validation can fail. */
export enum DeviceAttestationFailure {
    PaaNotTrusted = "PaaNotTrusted",
    CertificateChainInvalid = "CertificateChainInvalid",
    CertificateExpired = "CertificateExpired",
    VendorIdMismatch = "VendorIdMismatch",
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

        /**
         * Optional map of known CD signer public keys, keyed by subject key identifier hex (lowercase).
         *
         * If provided, the validator uses this map to verify the CD signature.
         * If the signer's SKID is not found in this map (or the map is not provided),
         * CD signature verification is skipped with a warning.
         *
         * In the future, the CD signer certificate will be fetched from DCL by SKID.
         */
        cdSignerPublicKeys?: Map<string, PublicKey>;
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

    export async function validate(context: Context, data: DeviceAttestationData): Promise<{ dacPublicKey: ReturnType<typeof PublicKey> }> {
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

        // Step 3b: Certificate validity - validate chain at DAC's notBefore timestamp
        // Per Matter spec Section 6.2.3.1: chain validation SHALL be performed with respect
        // to the notBefore timestamp of the DAC. A notAfter value of 0 means infinite validity.
        const dacNotBefore = dac.cert.notBefore;

        // PAI must be valid at DAC's notBefore
        if (dacNotBefore < pai.cert.notBefore) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificateExpired,
                `DAC notBefore (${dacNotBefore}) is before PAI notBefore (${pai.cert.notBefore})`,
            );
        }
        if (pai.cert.notAfter !== 0 && dacNotBefore > pai.cert.notAfter) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificateExpired,
                `DAC notBefore (${dacNotBefore}) is after PAI notAfter (${pai.cert.notAfter})`,
            );
        }

        // PAA must be valid at DAC's notBefore
        if (dacNotBefore < paa.cert.notBefore) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificateExpired,
                `DAC notBefore (${dacNotBefore}) is before PAA notBefore (${paa.cert.notBefore})`,
            );
        }
        if (paa.cert.notAfter !== 0 && dacNotBefore > paa.cert.notAfter) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificateExpired,
                `DAC notBefore (${dacNotBefore}) is after PAA notAfter (${paa.cert.notAfter})`,
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

        // Step 5: Revocation check
        if (!dclCertificateService.hasRevocationData) {
            logger.warn(
                "No revocation data available; skipping revocation check (per spec Section 6.2.4.2)",
            );
        } else {
            // Check DAC revocation
            const dacSerialNumber = dac.cert.serialNumber;
            const dacAkid = dac.cert.extensions.authorityKeyIdentifier;
            if (dclCertificateService.isRevoked(dacAkid, dacSerialNumber)) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificateRevoked,
                    "Device Attestation Certificate has been revoked",
                );
            }

            // Check PAI revocation
            const paiSerialNumber = pai.cert.serialNumber;
            if (dclCertificateService.isRevoked(paiAkid, paiSerialNumber)) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificateRevoked,
                    "Product Attestation Intermediate certificate has been revoked",
                );
            }
        }

        // Step 6: AttestationNonce match
        const attestationInfo = TlvAttestation.decode(data.attestationElements);
        if (!Bytes.areEqual(attestationInfo.attestationNonce, data.attestationNonce)) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.AttestationNonceMismatch,
                "AttestationNonce in response does not match the nonce sent to the device",
            );
        }

        // Step 7: Attestation Signature verification
        // The device signs [attestationElements, attestationChallenge] concatenated.
        // See DeviceCertification.ts where signEcdsa(privateKey, [data, session.attestationChallengeKey]) is used.
        // signEcdsa internally concatenates the array elements via Bytes.concat.
        const dacPublicKey = PublicKey(dac.cert.ellipticCurvePublicKey);
        try {
            await crypto.verifyEcdsa(
                dacPublicKey,
                Bytes.concat(data.attestationElements, context.attestationChallenge),
                new EcdsaSignature(data.attestationSignature),
            );
        } catch {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.AttestationSignatureInvalid,
                "Attestation signature verification failed against DAC public key",
            );
        }

        // Step 8: Certification Declaration signature verification
        const cd = CertificationDeclaration.parse(attestationInfo.declaration);
        const cdSignerSkidHex = Bytes.toHex(cd.signerSubjectKeyId);

        if (context.cdSignerPublicKeys !== undefined) {
            const cdSignerPublicKey = context.cdSignerPublicKeys.get(cdSignerSkidHex);
            if (cdSignerPublicKey !== undefined) {
                try {
                    await crypto.verifyEcdsa(cdSignerPublicKey, cd.signedData, cd.signature);
                } catch {
                    throw new DeviceAttestationError(
                        DeviceAttestationFailure.CertificationDeclarationSignatureInvalid,
                        "Certification Declaration signature verification failed",
                    );
                }
            } else {
                logger.warn(
                    `CD signer SKID ${cdSignerSkidHex} not found in cdSignerPublicKeys map; skipping CD signature verification`,
                );
            }
        } else {
            // TODO: Fetch CD signer certificate from DCL by cd.signerSubjectKeyId
            logger.warn("No cdSignerPublicKeys provided in context; skipping CD signature verification");
        }

        // Step 9: Certification Declaration field validation (Matter spec Section 6.2.3.1)
        const cdContent = cd.content;

        // vendor_id SHALL match BasicInformation VendorID
        if (cdContent.vendorId !== data.vendorId) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                `CD vendor_id ${cdContent.vendorId} does not match BasicInformation VendorID ${data.vendorId}`,
            );
        }

        // product_id_array SHALL contain BasicInformation ProductID
        if (!cdContent.produceIdArray.includes(data.productId)) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                `CD product_id_array does not contain BasicInformation ProductID ${data.productId}`,
            );
        }

        // CD SHALL contain both or neither of dac_origin_vendor_id and dac_origin_product_id
        const hasDacOriginVid = cdContent.dacOriginVendorId !== undefined;
        const hasDacOriginPid = cdContent.dacOriginProductId !== undefined;
        if (hasDacOriginVid !== hasDacOriginPid) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                "CD has only one of dac_origin_vendor_id and dac_origin_product_id",
            );
        }

        if (hasDacOriginVid && hasDacOriginPid) {
            // If BOTH dac_origin fields present: validate against dac_origin values
            if (dac.cert.subject.vendorId !== cdContent.dacOriginVendorId) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "DAC vendorId does not match CD dac_origin_vendor_id",
                );
            }
            if (pai.cert.subject.vendorId !== cdContent.dacOriginVendorId) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "PAI vendorId does not match CD dac_origin_vendor_id",
                );
            }
            const dacProductId = dac.cert.subject.productId;
            if (dacProductId !== undefined && dacProductId !== cdContent.dacOriginProductId) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "DAC productId does not match CD dac_origin_product_id",
                );
            }
            const paiProductId = pai.cert.subject.productId;
            if (paiProductId !== undefined && paiProductId !== cdContent.dacOriginProductId) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "PAI productId does not match CD dac_origin_product_id",
                );
            }
        } else {
            // NEITHER dac_origin fields: validate against vendor_id / product_id_array
            if (dac.cert.subject.vendorId !== cdContent.vendorId) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "DAC vendorId does not match CD vendor_id",
                );
            }
            if (pai.cert.subject.vendorId !== cdContent.vendorId) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "PAI vendorId does not match CD vendor_id",
                );
            }
            const dacProductId = dac.cert.subject.productId;
            if (dacProductId !== undefined && !cdContent.produceIdArray.includes(dacProductId)) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "DAC productId not found in CD product_id_array",
                );
            }
            const paiProductId = pai.cert.subject.productId;
            if (paiProductId !== undefined && !cdContent.produceIdArray.includes(paiProductId)) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "PAI productId not found in CD product_id_array",
                );
            }
        }

        // If authorizedPaaList is present, PAA's SKI must be in it
        if (cdContent.authorizedPaaList !== undefined) {
            const paaSki = paa.cert.extensions.subjectKeyIdentifier;
            const found = cdContent.authorizedPaaList.some(entry => Bytes.areEqual(entry, paaSki));
            if (!found) {
                throw new DeviceAttestationError(
                    DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                    "PAA subject key identifier not in CD authorized_paa_list",
                );
            }
        }

        // Step 10: Firmware information (log warning if present but validation not yet supported)
        if (attestationInfo.firmwareInfo !== undefined && Bytes.of(attestationInfo.firmwareInfo).length > 0) {
            logger.warn("Firmware information present in attestation elements but validation is not yet supported");
        }

        return { dacPublicKey: PublicKey(dac.cert.ellipticCurvePublicKey) };
    }
}
