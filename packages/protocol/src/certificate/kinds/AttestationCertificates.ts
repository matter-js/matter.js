/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError } from "@matter/general";
import { Certificate } from "./Certificate.js";
import { Unsigned } from "./common.js";
import { AttestationCertificate } from "./definitions/attestation.js";
import { MatterCertificate } from "./definitions/base.js";

/**
 * Base class for Attestation Certificates (PAA, PAI, DAC).
 *
 * PAA and PAI certificates may use ML-DSA keys and any of them may carry an ML-DSA signature (PQC Phase 1).
 */
export abstract class AttestationBaseCertificate<CT extends MatterCertificate> extends Certificate<CT> {}

/** PAA (Product Attestation Authority) Certificate. */
export class Paa extends AttestationBaseCertificate<AttestationCertificate.Paa> {
    /** Construct the class from an ASN.1/DER encoded certificate */
    static fromAsn1(asn1: Bytes): Paa {
        const cert = Certificate.parseAsn1Certificate(asn1, Certificate.REQUIRED_PAA_EXTENSIONS, { postQuantum: true });
        return new Paa(cert as AttestationCertificate.Paa);
    }
}

/** PAI (Product Attestation Intermediate) Certificate. */
export class Pai extends AttestationBaseCertificate<AttestationCertificate.Pai> {
    /** Construct the class from an ASN.1/DER encoded certificate */
    static fromAsn1(asn1: Bytes): Pai {
        const cert = Certificate.parseAsn1Certificate(asn1, Certificate.REQUIRED_EXTENSIONS, { postQuantum: true });
        return new Pai(cert as AttestationCertificate.Pai);
    }
}

/** DAC (Device Attestation Certificate) Certificate. */
export class Dac extends AttestationBaseCertificate<AttestationCertificate.Dac> {
    /** Construct the class from an ASN.1/DER encoded certificate */
    static fromAsn1(asn1: Bytes): Dac {
        const cert = Certificate.parseAsn1Certificate(asn1, Certificate.REQUIRED_EXTENSIONS, { postQuantum: true });
        return new Dac(cert as AttestationCertificate.Dac);
    }

    /**
     * @throws CertificateError if the key is not EC P-256
     * @throws KeyInputError if the EC key is malformed
     * @see Matter Core §10.12 and §13.2.3.3: the DAC key stays on ECDSA P-256 under PQC Phase 1
     */
    constructor(cert: AttestationCertificate.Dac | Unsigned<AttestationCertificate.Dac>) {
        super(cert);
        const { algorithm } = this.publicKey;
        if (algorithm !== "ECDSA-P256") {
            throw new CertificateError(`DAC public key must be EC P-256, not ${algorithm}`);
        }
    }
}
