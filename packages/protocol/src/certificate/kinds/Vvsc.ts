/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Diagnostic } from "#general";
import { CertificateError } from "./common.js";
import { OperationalCertificate } from "./definitions/operational.js";
import { OperationalBase } from "./OperationalBase.js";

/**
 * Represents an Vendor Verification Signer Certificate
 */
export class Vvsc extends OperationalBase<OperationalCertificate.Vvsc> {
    /** Construct the class from a Tlv version of the certificate */
    static fromTlv(tlv: Bytes): Vvsc {
        return new Vvsc(OperationalCertificate.TlvVvsc.decode(tlv));
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
        return OperationalCertificate.TlvVvsc.encode({ ...this.cert, signature: this.signature });
    }

    /**
     * Verify requirements a Matter Intermediate CA certificate must fulfill.
     * Rules for this are listed in @see {@link MatterSpecification.v12.Core} §6.5.x
     * // TODO ADD Verification once we know more about the chain
     */
    async verify(_crypto: Crypto) {
        this.generalVerify();

        const { subject } = this.cert;
        const { vvsId } = subject;

        // The subject DN SHALL encode exactly one matter-vvs-id attribute.
        if (vvsId === undefined || Array.isArray(vvsId)) {
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
