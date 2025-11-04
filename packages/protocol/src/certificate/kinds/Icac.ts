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
import { Rcac } from "./Rcac.js";

/**
 * Represents an Intermediate Certificate
 */
export class Icac extends OperationalBase<OperationalCertificate.Icac> {
    /** Construct the class from a Tlv version of the certificate */
    static fromTlv(tlv: Bytes): Icac {
        return new Icac(OperationalCertificate.TlvIcac.decode(tlv));
    }

    /** Validates all basic certificate fields on construction. */
    protected validateFields() {
        const {
            extensions: {
                basicConstraints: { isCa },
            },
        } = this.cert;
        if (!isCa) {
            throw new CertificateError("Intermediate certificate must be a CA.");
        }
    }

    /**
     * Encodes the certificate with the signature as Matter Tlv.
     * If the certificate is not signed, it throws a CertificateError.
     */
    asSignedTlv() {
        return OperationalCertificate.TlvIcac.encode({ ...this.cert, signature: this.signature });
    }

    /**
     * Verify requirements a Matter Intermediate CA certificate must fulfill.
     * Rules for this are listed in @see {@link MatterSpecification.v12.Core} §6.5.x
     */
    async verify(crypto: Crypto, root: Rcac) {
        this.generalVerify();

        const {
            subject,
            issuer: { rcacId },
            extensions,
        } = this.cert;
        const { fabricId, icacId } = subject;
        const { basicConstraints, extendedKeyUsage, subjectKeyIdentifier, authorityKeyIdentifier } = extensions;

        const { fabricId: rootFabricId } = root.cert.subject;
        // The subject DN SHALL NOT encode any matter-node-id attribute.
        if ("nodeId" in subject) {
            throw new CertificateError(`Ica certificate must not contain a nodeId.`);
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

        // The subject DN SHALL encode exactly one matter-icac-id attribute.
        if (icacId === undefined || Array.isArray(icacId)) {
            throw new CertificateError(`Invalid icacId in Ica certificate: ${Diagnostic.json(icacId)}`);
        }

        // The subject DN SHALL NOT encode any matter-rcac-id attribute.
        if ("rcacId" in subject) {
            throw new CertificateError(`Ica certificate must not contain an rcacId.`);
        }

        // The subject DN SHALL NOT encode any matter-noc-cat attribute.
        if ("caseAuthenticatedTags" in subject) {
            throw new CertificateError(`Ica certificate must not contain a caseAuthenticatedTags.`);
        }

        // The subject DN SHALL NOT encode any matter-vvs-id attribute.
        if ("vvsId" in subject) {
            throw new CertificateError(`Ica certificate must not contain a vvsId.`);
        }

        // When any matter-fabric-id attributes are present in either the Matter Root CA Certificate or the Matter ICA
        // Certificate, the value SHALL match the one present in the Matter Node Operational Certificate (NOC) within
        // the same certificate chain.
        // Here means: When both are set, they must match
        if (rootFabricId !== undefined && fabricId !== undefined && rootFabricId !== fabricId) {
            throw new CertificateError(
                `FabricId in Ica certificate does not match the fabricId in the parent certificate. ${Diagnostic.json(
                    rootFabricId,
                )} !== ${Diagnostic.json(fabricId)}`,
            );
        }

        // Verify the certificate chain by checking rcac ids in subject and issuer
        if (root.cert.subject.rcacId !== rcacId) {
            throw new CertificateError(
                `RcacId in Ica certificate does not match the rcacId in the parent certificate. ${Diagnostic.json(
                    root.cert.subject.rcacId,
                )} !== ${Diagnostic.json(rcacId)}`,
            );
        }

        // The basic constraints extension SHALL be encoded with is-ca set to true.
        if (!basicConstraints.isCa) {
            throw new CertificateError(`Ica certificate must have isCa set to true.`);
        }

        // The key usage extension SHALL be encoded with at least two flags: keyCertSign (0x0020) and CRLSign (0x0040)
        // and optionally with digitalSignature (0x0001).
        const keyUsage = ExtensionKeyUsageSchema.encode(extensions.keyUsage);
        if (keyUsage !== 0x0060 && keyUsage !== 0x0061) {
            throw new CertificateError(
                `Ica certificate keyUsage must have keyCertSign and CRLSign and optionally digitalSignature set.`,
            );
        }

        // The extended key usage extension SHALL NOT be present.
        if (extendedKeyUsage !== undefined) {
            throw new CertificateError(`Ica certificate must not have extendedKeyUsage set.`);
        }

        // The subject key identifier extension SHALL be present and 160 bit long.
        if (subjectKeyIdentifier === undefined) {
            throw new CertificateError(`Ica certificate must have subjectKeyIdentifier set.`);
        }
        if (subjectKeyIdentifier.byteLength !== 20) {
            throw new CertificateError(`Ica certificate subjectKeyIdentifier must be 160 bit.`);
        }

        // The authority key identifier extension SHALL be present and 160 bit long.
        if (authorityKeyIdentifier === undefined) {
            throw new CertificateError(`Ica certificate must have authorityKeyIdentifier set.`);
        }
        if (authorityKeyIdentifier.byteLength !== 20) {
            throw new CertificateError(`Ica certificate authorityKeyIdentifier must be 160 bit.`);
        }

        // Validate authority key identifier against subject key identifier
        if (!Bytes.areEqual(authorityKeyIdentifier, root.cert.extensions.subjectKeyIdentifier)) {
            throw new CertificateError(
                `Ica certificate authorityKeyIdentifier must be equal to root cert subjectKeyIdentifier.`,
            );
        }

        await crypto.verifyEcdsa(PublicKey(root.cert.ellipticCurvePublicKey), this.asUnsignedAsn1(), this.signature);
    }
}
