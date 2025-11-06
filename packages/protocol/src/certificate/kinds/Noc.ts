/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Diagnostic, PublicKey } from "#general";
import { CaseAuthenticatedTag, FabricId, NodeId } from "#types";
import { CertificateError } from "./common.js";
import { OperationalCertificate } from "./definitions/operational.js";
import { Icac } from "./Icac.js";
import { OperationalBase } from "./OperationalBase.js";
import { Rcac } from "./Rcac.js";
import { X509Base } from "./X509Base.js";

export class Noc extends OperationalBase<OperationalCertificate.Noc> {
    /** Construct the class from a Tlv version of the certificate */
    static fromTlv(tlv: Bytes) {
        return new Noc(OperationalCertificate.TlvNoc.decode(tlv));
    }

    /** Construct the class from an ASN.1/DER encoded certificate */
    static fromAsn1(asn1: Bytes) {
        const { cert, signature } = X509Base.parseAsn1Certificate(asn1);
        return new Noc({ ...cert, signature });
    }

    /** Validates all basic certificate fields on construction. */
    protected validateFields() {
        const {
            issuer: { icacId, rcacId },
            extensions: {
                basicConstraints: { isCa },
            },
        } = this.cert;
        if (icacId === undefined && rcacId === undefined) {
            throw new CertificateError("Issuer RCAC or ICAC ID must be defined for an operational certificate.");
        }
        if (isCa) {
            throw new CertificateError("Node operational certificate must not be a CA.");
        }
    }

    /**
     * Encodes the certificate with the signature as Matter Tlv.
     * If the certificate is not signed, it throws a CertificateError.
     */
    asSignedTlv() {
        return OperationalCertificate.TlvNoc.encode({ ...this.cert, signature: this.signature });
    }

    /**
     * Verify requirements a Matter Node Operational certificate must fulfill.
     * Rules for this are listed in @see {@link MatterSpecification.v12.Core} §6.5.x
     */
    async verify(crypto: Crypto, root: Rcac, ica?: Icac) {
        this.generalVerify();

        const {
            subject,
            extensions: { extendedKeyUsage, subjectKeyIdentifier, authorityKeyIdentifier },
        } = this.cert;
        const { nodeId, fabricId, caseAuthenticatedTags } = subject;
        const {
            subject: { fabricId: rootFabricId },
        } = root.cert;
        const {
            subject: { fabricId: icaFabricId },
        } = ica?.cert ?? { subject: {} };

        // The subject DN SHALL encode exactly one matter-node-id attribute.
        if (nodeId === undefined || Array.isArray(nodeId)) {
            throw new CertificateError(`Invalid nodeId in NoC certificate: ${Diagnostic.json(nodeId)}`);
        }
        // The matter-node-id attribute’s value SHALL be in the Operational Node ID
        if (!NodeId.isOperationalNodeId(nodeId)) {
            throw new CertificateError(`Invalid nodeId in NoC certificate: ${Diagnostic.json(nodeId)}`);
        }

        // The subject DN SHALL encode exactly one matter-fabric-id attribute.
        if (fabricId === undefined || Array.isArray(fabricId)) {
            throw new CertificateError(`Invalid fabricId in NoC certificate: ${Diagnostic.json(fabricId)}`);
        }
        // The matter-fabric-id attribute’s value SHALL NOT be 0
        if (fabricId === FabricId(0)) {
            throw new CertificateError(`Invalid fabricId in NoC certificate: ${Diagnostic.json(fabricId)}`);
        }

        // The subject DN SHALL NOT encode any matter-icac-id attribute.
        if ("icacId" in subject) {
            throw new CertificateError(`Noc certificate must not contain an icacId.`);
        }

        // The subject DN SHALL NOT encode any matter-rcac-id attribute.
        if ("rcacId" in subject) {
            throw new CertificateError(`Noc certificate must not contain an rcacId.`);
        }

        // The subject DN SHALL NOT encode any matter-vvs-id attribute.
        if ("vvsId" in subject) {
            throw new CertificateError(`Noc certificate must not contain a vvsId.`);
        }

        // The subject DN MAY encode at most three matter-noc-cat attributes.
        if (caseAuthenticatedTags !== undefined) {
            CaseAuthenticatedTag.validateNocTagList(caseAuthenticatedTags); // throws ValidationError
        }

        // When any matter-fabric-id attributes are present in either the Matter Root CA Certificate or the Matter ICA
        // Certificate, the value SHALL match the one present in the Matter Node Operational Certificate (NOC) within
        // the same certificate chain.
        if (rootFabricId !== undefined && rootFabricId !== fabricId) {
            throw new CertificateError(
                `FabricId in NoC certificate does not match the fabricId in the parent certificate. ${Diagnostic.json(
                    rootFabricId,
                )} !== ${Diagnostic.json(fabricId)}`,
            );
        }
        if (icaFabricId !== undefined && icaFabricId !== fabricId) {
            throw new CertificateError(
                `FabricId in NoC certificate does not match the fabricId in the parent certificate. ${Diagnostic.json(
                    icaFabricId,
                )} !== ${Diagnostic.json(fabricId)}`,
            );
        }

        // The basic constraints extension SHALL be encoded with is-ca set to false.
        if (this.cert.extensions.basicConstraints.isCa) {
            throw new CertificateError(`Noc certificate must not have isCa set to true.`);
        }

        // The key usage extension SHALL be encoded with exactly two flags: keyCertSign (0x0020) and CRLSign (0x0040).
        // Formally the check should be the following line but Amazon uses a wrong Root cert which also has
        // digitalCertificate set, so we just check that the two needed are set and ignore additionally set parameters.
        //if (ExtensionKeyUsageSchema.encode(nocCert.extensions.keyUsage) !== 1) {
        if (!this.cert.extensions.keyUsage.digitalSignature) {
            throw new CertificateError(`Noc certificate must have keyUsage set to digitalSignature.`);
        }

        // The extended key usage extension SHALL be encoded with exactly two key-purpose-id values: serverAuth and clientAuth.
        if (extendedKeyUsage === undefined || (!extendedKeyUsage.includes(1) && !extendedKeyUsage.includes(2))) {
            throw new CertificateError(
                `Noc certificate must have extendedKeyUsage with serverAuth and clientAuth: ${Diagnostic.json(extendedKeyUsage)}`,
            );
        }

        // The subject key identifier extension SHALL be present and 160 bit long.
        if (subjectKeyIdentifier === undefined) {
            throw new CertificateError(`Noc certificate must have subjectKeyIdentifier set.`);
        }
        if (subjectKeyIdentifier.byteLength !== 20) {
            throw new CertificateError(`Noc certificate subjectKeyIdentifier must be 160 bit.`);
        }

        // The authority key identifier extension SHALL be present and 160 bit long.
        if (authorityKeyIdentifier === undefined) {
            throw new CertificateError(`Noc certificate must have authorityKeyIdentifier set.`);
        }
        if (authorityKeyIdentifier.byteLength !== 20) {
            throw new CertificateError(`Noc certificate authorityKeyIdentifier must be 160 bit.`);
        }

        // Validate authority key identifier against subject key identifier
        if (!Bytes.areEqual(authorityKeyIdentifier, (ica?.cert ?? root.cert).extensions.subjectKeyIdentifier)) {
            throw new CertificateError(
                `Noc certificate authorityKeyIdentifier must be equal to Root/Ica subjectKeyIdentifier.`,
            );
        }

        await crypto.verifyEcdsa(
            PublicKey((ica?.cert ?? root.cert).ellipticCurvePublicKey),
            this.asUnsignedAsn1(),
            this.signature,
        );
    }
}
