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
import { ExtensionKeyUsageSchema, MatterCertificate } from "./definitions/base.js";

/**
 * Base class for Attestation Certificates (PAA, PAI, DAC).
 *
 * PAA and PAI certificates may use ML-DSA keys and any of them may carry an ML-DSA signature (PQC Phase 1).  Parsing
 * admits ML-DSA only while {@link Specification.isForwardFeatureEnabled} reports "pqc-phase-1".
 */
export abstract class AttestationBaseCertificate<CT extends MatterCertificate> extends Certificate<CT> {}

/**
 * Thrown when an attestation certificate uses ML-DSA while the "pqc-phase-1" forward feature is not enabled.
 *
 * The certificate may be valid; this build is configured not to accept it.
 */
export class MlDsaAttestationDisabledError extends CertificateError {}

export interface AttestationParseOptions {
    /**
     * Accept a certificate that violates the X.509 profile of its kind.  Only for a caller that does not judge the
     * profile: a commissioner that already decided to proceed despite a failed device attestation, a device reading
     * its own certificates, or a parser of a certificate in another role, such as a PAI-delegated CRL signer.
     */
    acceptProfileViolation?: boolean;
}

/** @throws MlDsaAttestationDisabledError for an ML-DSA certificate while PQC Phase 1 is not enabled */
function parseAttestationCertificate(asn1: Bytes, requiredExtensions: string[]) {
    const cert = Certificate.parseAsn1Certificate(asn1, requiredExtensions, { postQuantum: true });
    const mlDsa = cert.mlDsaSignature ?? cert.mlDsaPublicKey?.parameterSet;
    if (mlDsa !== undefined && !Specification.isForwardFeatureEnabled("pqc-phase-1")) {
        throw new MlDsaAttestationDisabledError(
            `ML-DSA attestation certificates are not supported: this certificate uses ${mlDsa} and PQC Phase 1 is not enabled`,
        );
    }
    return cert;
}

const DAC_PAI_EXTENSIONS_WITHOUT_PROFILE = Certificate.REQUIRED_EXTENSIONS.filter(name => name !== "basicConstraints");

/**
 * Parse a DAC or PAI.  When the caller accepts a profile violation, a certificate without the basic constraints
 * extension parses as not a CA, which is what RFC 5280 § 4.2.1.9 makes of an absent extension.
 *
 * @throws MlDsaAttestationDisabledError for an ML-DSA certificate while PQC Phase 1 is not enabled
 */
function parseDacOrPai(asn1: Bytes, acceptProfileViolation = false) {
    if (!acceptProfileViolation) {
        return parseAttestationCertificate(asn1, Certificate.REQUIRED_EXTENSIONS);
    }
    const cert = parseAttestationCertificate(asn1, DAC_PAI_EXTENSIONS_WITHOUT_PROFILE);
    cert.extensions.basicConstraints ??= { isCa: false };
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

/**
 * DAC and PAI share these rules:
 *
 * - "The `version` field SHALL be set to `2` to indicate v3 certificate."
 * - "Basic Constraint extension SHALL be marked `critical`"
 * - "Key Usage extension SHALL be marked `critical`"
 *
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.3
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.4
 * @throws CertificateError naming the violated rule
 */
function assertCommonProfile(kind: "DAC" | "PAI", cert: MatterCertificate) {
    if (cert.version !== 2) {
        throw new CertificateError(`${kind} version field must be 2 (v3), not ${cert.version}`);
    }
    if (!cert.criticalExtensions?.includes("basicConstraints")) {
        throw new CertificateError(`${kind} basic constraints extension must be marked critical`);
    }
    if (!cert.criticalExtensions?.includes("keyUsage")) {
        throw new CertificateError(`${kind} key usage extension must be marked critical`);
    }
}

/**
 * Enforce the PAI profile:
 *
 * - "Basic Constraint extension SHALL be marked `critical` and have the `cA` field set to TRUE and `pathLen` field set
 *   to 0."
 * - "Both the `keyCertSign` and `cRLSign` bits SHALL be set in the `KeyUsage` bitstring", "The `digitalSignature` bit
 *   MAY be set", "Other bits SHALL NOT be set"
 *
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.4
 * @throws CertificateError naming the violated rule
 */
function assertPaiProfile(cert: MatterCertificate) {
    assertCommonProfile("PAI", cert);
    const { basicConstraints, keyUsage } = cert.extensions;
    if (!basicConstraints.isCa) {
        throw new CertificateError("PAI basic constraints must have cA set to TRUE");
    }
    if (basicConstraints.pathLen !== 0) {
        throw new CertificateError(`PAI basic constraints must have pathLen 0, not ${basicConstraints.pathLen}`);
    }
    const usage = ExtensionKeyUsageSchema.encode(keyUsage);
    if (usage !== 0x0060 && usage !== 0x0061) {
        throw new CertificateError(
            "PAI key usage must have keyCertSign and cRLSign set, may have digitalSignature set, and no other bit",
        );
    }
}

/**
 * Enforce the DAC profile:
 *
 * - "Basic Constraint extension SHALL be marked `critical` and have the `cA` field set to FALSE."
 * - "The `KeyUsage` bitstring SHALL only have the `digitalSignature` bit set."
 *
 * RFC 5280 § 4.2.1.9 does not allow `pathLenConstraint` without `cA`; like the CHIP SDK, a DAC with a pathLen is
 * refused.
 *
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.3
 * @throws CertificateError naming the violated rule
 */
function assertDacProfile(cert: MatterCertificate) {
    assertCommonProfile("DAC", cert);
    const { basicConstraints, keyUsage } = cert.extensions;
    if (basicConstraints.isCa) {
        throw new CertificateError("DAC basic constraints must have cA set to FALSE");
    }
    if (basicConstraints.pathLen !== undefined) {
        throw new CertificateError(`DAC basic constraints must not have a pathLen, found ${basicConstraints.pathLen}`);
    }
    if (ExtensionKeyUsageSchema.encode(keyUsage) !== 0x0001) {
        throw new CertificateError("DAC key usage must have only digitalSignature set");
    }
}

/** PAI (Product Attestation Intermediate) Certificate. */
export class Pai extends AttestationBaseCertificate<AttestationCertificate.Pai> {
    /**
     * Construct the class from an ASN.1/DER encoded certificate.
     *
     * @throws CertificateError if the certificate cannot be parsed or violates the PAI profile
     * @throws MlDsaAttestationDisabledError for an ML-DSA certificate while PQC Phase 1 is not enabled
     */
    static fromAsn1(asn1: Bytes, options: AttestationParseOptions = {}): Pai {
        const cert = parseDacOrPai(asn1, options.acceptProfileViolation);
        const pai = new Pai(cert as AttestationCertificate.Pai);
        if (!options.acceptProfileViolation) {
            assertPaiProfile(cert);
        }
        return pai;
    }
}

/** DAC (Device Attestation Certificate) Certificate. */
export class Dac extends AttestationBaseCertificate<AttestationCertificate.Dac> {
    /**
     * Construct the class from an ASN.1/DER encoded certificate.
     *
     * @throws CertificateError if the certificate cannot be parsed, has no EC P-256 key, or violates the DAC profile
     * @throws MlDsaAttestationDisabledError for an ML-DSA certificate while PQC Phase 1 is not enabled
     */
    static fromAsn1(asn1: Bytes, options: AttestationParseOptions = {}): Dac {
        const cert = parseDacOrPai(asn1, options.acceptProfileViolation);
        const dac = new Dac(cert as AttestationCertificate.Dac);
        if (!options.acceptProfileViolation) {
            assertDacProfile(cert);
        }
        return dac;
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
