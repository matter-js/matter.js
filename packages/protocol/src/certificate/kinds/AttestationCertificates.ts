/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError } from "@matter/general";
import { Specification } from "@matter/model";
import { Certificate } from "./Certificate.js";
import { Unsigned } from "./common.js";
import { AttestationCertificate } from "./definitions/attestation.js";
import { MatterCertificate } from "./definitions/base.js";

/**
 * Base class for Attestation Certificates (PAA, PAI, DAC).
 *
 * PAA and PAI certificates may use ML-DSA keys and any of them may carry an ML-DSA signature (PQC Phase 1).  Parsing
 * admits ML-DSA only while {@link Specification.isForwardFeatureEnabled} reports "pqc-phase-1".
 */
export abstract class AttestationBaseCertificate<CT extends MatterCertificate> extends Certificate<CT> {}

/** @throws CertificateError for an ML-DSA certificate while PQC Phase 1 is not enabled */
function parseAttestationCertificate(asn1: Bytes, requiredExtensions: string[]) {
    const cert = Certificate.parseAsn1Certificate(asn1, requiredExtensions, { postQuantum: true });
    const mlDsa = cert.mlDsaSignature ?? cert.mlDsaPublicKey?.parameterSet;
    if (mlDsa !== undefined && !Specification.isForwardFeatureEnabled("pqc-phase-1")) {
        throw new CertificateError(
            `ML-DSA attestation certificates are not supported: this certificate uses ${mlDsa} and PQC Phase 1 is not enabled`,
        );
    }
    return cert;
}

/** PAA (Product Attestation Authority) Certificate. */
export class Paa extends AttestationBaseCertificate<AttestationCertificate.Paa> {
    /** Construct the class from an ASN.1/DER encoded certificate */
    static fromAsn1(asn1: Bytes): Paa {
        const cert = parseAttestationCertificate(asn1, Certificate.REQUIRED_PAA_EXTENSIONS);
        return new Paa(cert as AttestationCertificate.Paa);
    }
}

/** PAI (Product Attestation Intermediate) Certificate. */
export class Pai extends AttestationBaseCertificate<AttestationCertificate.Pai> {
    /** Construct the class from an ASN.1/DER encoded certificate */
    static fromAsn1(asn1: Bytes): Pai {
        const cert = parseAttestationCertificate(asn1, Certificate.REQUIRED_EXTENSIONS);
        return new Pai(cert as AttestationCertificate.Pai);
    }
}

/** DAC (Device Attestation Certificate) Certificate. */
export class Dac extends AttestationBaseCertificate<AttestationCertificate.Dac> {
    /** Construct the class from an ASN.1/DER encoded certificate */
    static fromAsn1(asn1: Bytes): Dac {
        const cert = parseAttestationCertificate(asn1, Certificate.REQUIRED_EXTENSIONS);
        return new Dac(cert as AttestationCertificate.Dac);
    }

    /**
     * PQC Phase 1 keeps the DAC key on ECDSA P-256.
     *
     * @throws CertificateError if the key is not EC P-256
     * @throws KeyInputError if the EC key is malformed
     */
    constructor(cert: AttestationCertificate.Dac | Unsigned<AttestationCertificate.Dac>) {
        super(cert);
        const { algorithm } = this.publicKey;
        if (algorithm !== "ECDSA-P256") {
            throw new CertificateError(`DAC public key must be EC P-256, not ${algorithm}`);
        }
    }
}
