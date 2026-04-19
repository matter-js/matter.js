/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError, Logger, Time } from "@matter/general";
import { Certificate } from "./Certificate.js";
import { Unsigned } from "./common.js";
import { MatterCertificate } from "./definitions/base.js";

const logger = Logger.get("OperationalBaseCertificate");

/**
 * Base class for all operational certificates (RCAC, ICAC, NOC)
 */
export abstract class OperationalBase<CT extends MatterCertificate> extends Certificate<CT> {
    constructor(cert: CT | Unsigned<CT>) {
        super(cert);
        this.validateFields();
    }

    /** Validates all basic certificate fields on construction. */
    protected abstract validateFields(): void;

    /** Encodes the signed certificate into the Matter TLV format. */
    abstract asSignedTlv(): Bytes;

    /**
     * Verifies general requirements a Matter certificate fields must fulfill.
     * Rules for this are listed in @see {@link MatterSpecification.v12.Core} §6.5.x
     */
    generalVerify() {
        const cert = this.cert;
        // Spec §6.5 mandates serial number ≤ 20 octets, but real-world devices sometimes ship longer values.
        // Log a warning instead of rejecting to stay interoperable while surfacing non-compliant certificates.
        if (cert.serialNumber.byteLength > 20) {
            logger.warn(
                `Certificate serial number has ${cert.serialNumber.byteLength} octets, exceeds spec maximum of 20 octets.`,
            );
        }

        if (cert.signatureAlgorithm !== 1) {
            // ecdsa-with-sha256
            throw new CertificateError(`Unsupported signature algorithm: ${cert.signatureAlgorithm}`);
        }

        if (cert.publicKeyAlgorithm !== 1) {
            // ec-pub-key
            throw new CertificateError(`Unsupported public key algorithm: ${cert.publicKeyAlgorithm}`);
        }

        if (cert.ellipticCurveIdentifier !== 1) {
            // prime256v1
            throw new CertificateError(`Unsupported elliptic curve identifier: ${cert.ellipticCurveIdentifier}`);
        }

        // All implementations SHALL reject Matter certificates with more than 5 RDNs in a single DN.
        if (Object.keys(cert.subject).length > 5) {
            throw new CertificateError(`Certificate subject must not contain more than 5 RDNs.`);
        }
        if (Object.keys(cert.issuer).length > 5) {
            throw new CertificateError(`Certificate issuer must not contain more than 5 RDNs.`);
        }

        // notBefore date should be already reached, notAfter is not checked right now
        // TODO: implement real checks when we add "Last known Good UTC time"
        if (cert.notBefore * 1000 > Time.nowMs) {
            logger.warn(`Certificate notBefore date is in the future: ${cert.notBefore * 1000} vs ${Time.nowMs}`);
            /*throw new CertificateError(
                `Certificate notBefore date is in the future: ${cert.notBefore * 1000} vs ${Time.nowMs}`,
            );*/
        }
    }
}
