/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Diagnostic, PublicKey } from "#general";
import { FabricId } from "#types";
import { CertificateError } from "./common.js";
import { ExtensionKeyUsageSchema } from "./definitions/base.js";
import { OperationalCertificate } from "./definitions/operational.js";
import { OperationalBase } from "./OperationalBase.js";
import { X509Base } from "./X509Base.js";

export class Rcac extends OperationalBase<OperationalCertificate.Rcac> {
    /** Construct the class from a Tlv version of the certificate */
    static fromTlv(tlv: Bytes): Rcac {
        return new Rcac(OperationalCertificate.TlvRcac.decode(tlv));
    }

    /** Construct the class from an ASN.1/DER encoded certificate */
    static fromAsn1(asn1: Bytes): Rcac {
        const { cert, signature } = X509Base.parseAsn1Certificate(asn1);
        return new Rcac({ ...cert, signature });
    }

    /** Validates all basic certificate fields on construction. */
    protected validateFields() {
        const {
            extensions: {
                basicConstraints: { isCa },
            },
        } = this.cert;
        if (!isCa) {
            throw new CertificateError("Root certificate must be a CA.");
        }
    }

    /**
     * Encodes the certificate with the signature as Matter Tlv.
     * If the certificate is not signed, it throws a CertificateError.
     */
    asSignedTlv() {
        return OperationalCertificate.TlvRcac.encode({ ...this.cert, signature: this.signature });
    }

    /**
     * Verify requirements a Matter Root certificate must fulfill.
     * Rules for this are listed in @see {@link MatterSpecification.v12.Core} §6.5.x
     */
    async verify(crypto: Crypto) {
        this.generalVerify();

        const { subject, extensions } = this.cert;
        const { fabricId, rcacId } = subject;
        const { basicConstraints, subjectKeyIdentifier, authorityKeyIdentifier } = extensions;

        // The subject DN SHALL NOT encode any matter-node-id attribute.
        if ("nodeId" in subject) {
            throw new CertificateError(`Root certificate must not contain a nodeId.`);
        }

        // The subject DN MAY encode at most one matter-fabric-id attribute.
        if (fabricId !== undefined) {
            if (Array.isArray(fabricId)) {
                throw new CertificateError(`Invalid fabricId in NoC certificate: ${Diagnostic.json(fabricId)}`);
            }
            // If present, the matter-fabric-id attribute’s value SHALL NOT be 0
            if (fabricId === FabricId(0)) {
                throw new CertificateError(`Invalid fabricId in NoC certificate: ${Diagnostic.json(fabricId)}`);
            }
        }

        // The subject DN SHALL NOT encode any matter-icac-id attribute.
        if ("icacId" in subject) {
            throw new CertificateError(`Root certificate must not contain an icacId.`);
        }

        // The subject DN SHALL encode exactly one matter-rcac-id attribute.
        if (rcacId === undefined || Array.isArray(rcacId)) {
            throw new CertificateError(`Invalid rcacId in Root certificate: ${Diagnostic.json(rcacId)}`);
        }

        // The subject DN SHALL NOT encode any matter-noc-cat attribute.
        if ("caseAuthenticatedTags" in subject) {
            throw new CertificateError(`Root certificate must not contain a caseAuthenticatedTags.`);
        }

        // The subject DN SHALL NOT encode any matter-vsc-id attribute.
        if ("vvsId" in subject) {
            throw new CertificateError(`Root certificate must not contain a vvsId.`);
        }

        // The basic constraints extension SHALL be encoded with is-ca set to true.
        if (basicConstraints.isCa !== true) {
            throw new CertificateError(`Root certificate must have isCa set to true.`);
        }

        // The key usage extension SHALL be encoded with at least two flags: keyCertSign (0x0020) and CRLSign (0x0040)
        // and optionally with digitalSignature (0x0001).
        const keyUsage = ExtensionKeyUsageSchema.encode(extensions.keyUsage);
        if (keyUsage !== 0x0060 && keyUsage !== 0x0061) {
            throw new CertificateError(
                `Root certificate keyUsage must have keyCertSign and CRLSign and optionally digitalSignature set.`,
            );
        }

        // The extended key usage extension SHALL NOT be present.
        if (extensions.extendedKeyUsage !== undefined) {
            throw new CertificateError(`Root certificate must not have extendedKeyUsage set.`);
        }

        // The subject key identifier extension SHALL be present and 160 bit long.
        if (subjectKeyIdentifier === undefined) {
            throw new CertificateError(`Root certificate must have subjectKeyIdentifier set.`);
        }
        if (subjectKeyIdentifier.byteLength !== 20) {
            throw new CertificateError(`Root certificate subjectKeyIdentifier must be 160 bit.`);
        }

        // The authority key identifier extension SHALL be present and 160 bit long.
        if (authorityKeyIdentifier === undefined) {
            throw new CertificateError(`Root certificate must have authorityKeyIdentifier set.`);
        }
        if (authorityKeyIdentifier.byteLength !== 20) {
            throw new CertificateError(`Root certificate authorityKeyIdentifier must be 160 bit.`);
        }

        // The authority key identifier extension SHALL be equal to the subject key identifier extension.
        if (!Bytes.areEqual(authorityKeyIdentifier, subjectKeyIdentifier)) {
            throw new CertificateError(
                `Root certificate authorityKeyIdentifier must be equal to subjectKeyIdentifier.`,
            );
        }

        await crypto.verifyEcdsa(PublicKey(this.cert.ellipticCurvePublicKey), this.asUnsignedAsn1(), this.signature);
    }
}
