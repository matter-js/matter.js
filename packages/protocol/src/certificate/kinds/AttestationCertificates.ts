/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError, InternalError } from "@matter/general";
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

/**
 * Thrown when an attestation certificate uses ML-DSA while the "pqc-phase-1" forward feature is not enabled.
 *
 * The certificate may be valid; this build is configured not to accept it.
 */
export class MlDsaAttestationDisabledError extends CertificateError {}

/**
 * Thrown when a DAC or PAI is well-formed but violates the X.509 profile of its kind.
 *
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.3
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.4
 */
export class CertificateProfileError extends CertificateError {}

export interface AttestationParseOptions {
    /**
     * Accept a certificate that violates the X.509 profile of its kind, and read an absent basic constraints extension
     * as not a CA.  Only for a caller that does not judge the profile: a commissioner that already decided to proceed
     * despite a failed device attestation, a device reading its own certificates, or a parser of a certificate in
     * another role, such as a CRL signer.
     *
     * The PAA profile is not checked either way; for a PAA this option only lets the basic constraints extension be
     * absent.
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

/**
 * Leave out basic constraints, whose absence is a profile violation.  A certificate without key usage or a key
 * identifier is unusable, so those stay required even for a caller that accepts a profile violation.
 */
function withoutBasicConstraints(required: string[]) {
    return required.filter(name => name !== "basicConstraints");
}

const DAC_PAI_REQUIRED_EXTENSIONS = withoutBasicConstraints(Certificate.REQUIRED_EXTENSIONS);

/** PAA (Product Attestation Authority) Certificate. */
export class Paa extends AttestationBaseCertificate<AttestationCertificate.Paa> {
    /**
     * Construct the class from an ASN.1/DER encoded certificate.
     *
     * @throws CertificateError if the certificate cannot be parsed
     * @throws MlDsaAttestationDisabledError for an ML-DSA certificate while PQC Phase 1 is not enabled
     */
    static fromAsn1(asn1: Bytes, options: AttestationParseOptions = {}): Paa {
        const required = options.acceptProfileViolation
            ? withoutBasicConstraints(Certificate.REQUIRED_PAA_EXTENSIONS)
            : Certificate.REQUIRED_PAA_EXTENSIONS;
        const cert = parseAttestationCertificate(asn1, required);
        return new Paa(cert as AttestationCertificate.Paa);
    }
}

/** The extensions a DAC or PAI must carry at most once, as the CHIP SDK checks. */
const DAC_PAI_SINGLE_EXTENSIONS: MatterCertificate.ExtensionName[] = [
    "basicConstraints",
    "keyUsage",
    "subjectKeyIdentifier",
    "authorityKeyIdentifier",
];

function encodingOf(cert: MatterCertificate) {
    if (cert.encoding === undefined) {
        throw new InternalError("A certificate parsed from DER lacks its encoding details");
    }
    return cert.encoding;
}

/**
 * DAC and PAI share these rules:
 *
 * - "The `version` field SHALL be set to `2` to indicate v3 certificate."
 * - "The certificate SHALL carry the following Extensions", among them basic constraints
 * - "Basic Constraint extension SHALL be marked `critical`"
 * - "Key Usage extension SHALL be marked `critical`"
 * - RFC 5280 § 4.2: "A certificate MUST NOT include more than one instance of a particular extension."
 *
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.3
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.4
 * @throws CertificateProfileError naming the violated rule
 */
function assertCommonProfile(kind: "DAC" | "PAI", cert: MatterCertificate) {
    const { version, extensions } = encodingOf(cert);
    if (version !== 2) {
        throw new CertificateProfileError(`${kind} version field must be 2 (v3), not ${version}`);
    }
    for (const name of DAC_PAI_SINGLE_EXTENSIONS) {
        if (extensions.filter(extension => extension.name === name).length > 1) {
            throw new CertificateProfileError(`${kind} carries more than one ${name} extension`);
        }
    }
    const basicConstraints = extensions.find(({ name }) => name === "basicConstraints");
    if (basicConstraints === undefined) {
        throw new CertificateProfileError(`${kind} must carry the basic constraints extension`);
    }
    if (!basicConstraints.critical) {
        throw new CertificateProfileError(`${kind} basic constraints extension must be marked critical`);
    }
    if (!extensions.find(({ name }) => name === "keyUsage")?.critical) {
        throw new CertificateProfileError(`${kind} key usage extension must be marked critical`);
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
 * @throws CertificateProfileError naming the violated rule
 */
function assertPaiProfile(cert: MatterCertificate) {
    assertCommonProfile("PAI", cert);
    const { basicConstraints } = cert.extensions;
    if (!basicConstraints.isCa) {
        throw new CertificateProfileError("PAI basic constraints must have cA set to TRUE");
    }
    if (basicConstraints.pathLen !== 0) {
        throw new CertificateProfileError(`PAI basic constraints must have pathLen 0, not ${basicConstraints.pathLen}`);
    }
    const { keyUsage } = encodingOf(cert);
    if (keyUsage !== 0x0060 && keyUsage !== 0x0061) {
        throw new CertificateProfileError(
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
 * @throws CertificateProfileError naming the violated rule
 */
function assertDacProfile(cert: MatterCertificate) {
    assertCommonProfile("DAC", cert);
    const { basicConstraints } = cert.extensions;
    if (basicConstraints.isCa) {
        throw new CertificateProfileError("DAC basic constraints must have cA set to FALSE");
    }
    if (basicConstraints.pathLen !== undefined) {
        throw new CertificateProfileError(
            `DAC basic constraints must not have a pathLen, found ${basicConstraints.pathLen}`,
        );
    }
    if (encodingOf(cert).keyUsage !== 0x0001) {
        throw new CertificateProfileError("DAC key usage must have only digitalSignature set");
    }
}

/** PAI (Product Attestation Intermediate) Certificate. */
export class Pai extends AttestationBaseCertificate<AttestationCertificate.Pai> {
    /**
     * Construct the class from an ASN.1/DER encoded certificate.
     *
     * @throws CertificateProfileError if the certificate violates the PAI profile
     * @throws CertificateError if the certificate cannot be parsed
     * @throws MlDsaAttestationDisabledError for an ML-DSA certificate while PQC Phase 1 is not enabled
     */
    static fromAsn1(asn1: Bytes, options: AttestationParseOptions = {}): Pai {
        const cert = parseAttestationCertificate(asn1, DAC_PAI_REQUIRED_EXTENSIONS);
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
     * @throws CertificateProfileError if the certificate violates the DAC profile
     * @throws CertificateError if the certificate cannot be parsed or has no EC P-256 key
     * @throws MlDsaAttestationDisabledError for an ML-DSA certificate while PQC Phase 1 is not enabled
     */
    static fromAsn1(asn1: Bytes, options: AttestationParseOptions = {}): Dac {
        const cert = parseAttestationCertificate(asn1, DAC_PAI_REQUIRED_EXTENSIONS);
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
