/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError, Crypto, Diagnostic } from "@matter/general";
import { ExtensionKeyUsageSchema } from "./definitions/base.js";
import { OperationalCertificate } from "./definitions/operational.js";
import { OperationalBase } from "./OperationalBase.js";

const KEY_USAGE_DIGITAL_SIGNATURE = 0x0001;

/**
 * Represents an Vendor Verification Signer Certificate
 */
export class Vvsc extends OperationalBase<OperationalCertificate.Vvsc> {
    /** Construct the class from a Tlv version of the certificate */
    static fromTlv(tlv: Bytes): Vvsc {
        Vvsc.assertTlvSize(tlv);
        return new Vvsc(OperationalCertificate.TlvVvsc.decode(tlv));
    }

    /** Validates all basic certificate fields on construction. */
    protected validateFields() {
        // The basic constraints extension SHALL be encoded with is-ca set to false.
        if (this.cert.extensions.basicConstraints.isCa) {
            throw new CertificateError("Vendor ID Verification Signer certificate must not be a CA.");
        }
    }

    /**
     * Encodes the certificate with the signature as Matter Tlv.
     * If the certificate is not signed, it throws a CertificateError.
     */
    asSignedTlv() {
        return OperationalCertificate.TlvVvsc.encode({ ...this.cert, signature: this.signature.bytes });
    }

    /**
     * Verify requirements a Vendor Verification Signer certificate must fulfill.
     * Rules for this are listed in @see {@link MatterSpecification.v161.Core} §6.5.x
     * // TODO ADD Verification once we know more about the chain
     */
    async verify(_crypto: Crypto) {
        this.generalVerify();

        const {
            subject,
            extensions: { keyUsage, subjectKeyIdentifier, authorityKeyIdentifier },
        } = this.cert;
        const { vvsId } = subject;

        // The key usage extension SHALL be encoded with exactly one flag: digitalSignature.
        if (ExtensionKeyUsageSchema.encode(keyUsage) !== KEY_USAGE_DIGITAL_SIGNATURE) {
            throw new CertificateError(
                `Vvsc certificate keyUsage must have only digitalSignature set: ${Diagnostic.json(keyUsage)}`,
            );
        }

        // The subject key identifier extension SHALL be present.
        if (subjectKeyIdentifier === undefined) {
            throw new CertificateError(`Vvsc certificate must have subjectKeyIdentifier set.`);
        }

        // The authority key identifier extension SHALL be present.
        if (authorityKeyIdentifier === undefined) {
            throw new CertificateError(`Vvsc certificate must have authorityKeyIdentifier set.`);
        }

        // The subject DN SHALL encode exactly one matter-vvs-id attribute.
        if (vvsId === undefined) {
            throw new CertificateError(`Invalid vvsId in Vsc certificate: ${Diagnostic.json(vvsId)}`);
        }

        // The subject DN SHALL NOT encode any matter-node-id attribute.
        if ("nodeId" in subject) {
            throw new CertificateError(`Vsc certificate must not contain a nodeId.`);
        }

        // The subject DN SHALL NOT encode any matter-fabric-id attribute.
        if ("fabricId" in subject) {
            throw new CertificateError(`Vsc certificate must not contain a fabricId.`);
        }

        // The subject DN SHALL NOT encode any matter-noc-cat attribute.
        if ("caseAuthenticatedTags" in subject) {
            throw new CertificateError(`Vvsc certificate must not contain a caseAuthenticatedTags.`);
        }
    }
}
