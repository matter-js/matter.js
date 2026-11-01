/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError, Crypto } from "@matter/general";
import { rawKeyUsage } from "./definitions/base.js";
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
     * Rules for this are listed in @see {@link MatterSpecification.v161.Core} § 6.5.12
     * // TODO Verify the VVSC chain, see the open TODO in VendorIdVerification.verifyData
     */
    async verify(_crypto: Crypto) {
        this.generalVerify();

        const {
            subject,
            extensions: { keyUsage },
        } = this.cert;

        // The key usage extension SHALL be encoded with exactly one flag: digitalSignature.
        const keyUsageBits = rawKeyUsage(keyUsage);
        if (keyUsageBits !== KEY_USAGE_DIGITAL_SIGNATURE) {
            throw new CertificateError(
                `Vvsc certificate keyUsage must have only digitalSignature set: 0x${keyUsageBits.toString(16)}`,
            );
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
