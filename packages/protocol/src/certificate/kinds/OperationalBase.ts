/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DerBitString, DerCodec, Logger, Time, X962 } from "#general";
import { X509Base } from "./X509Base.js";
import { assertCertificateDerSize, CertificateError, Unsigned } from "./common.js";
import { X509Certificate } from "./definitions/base.js";

const logger = Logger.get("OperationalBaseCertificate");

/**
 * Base class for all operational certificates (RCAC, ICAC, NOC)
 */
export abstract class OperationalBase<CT extends X509Certificate> extends X509Base<CT> {
    constructor(cert: CT | Unsigned<CT>) {
        super(cert);
        this.validateFields();
    }

    /** Validates all basic certificate fields on construction. */
    protected abstract validateFields(): void;

    /** Encodes the signed certificate into the Matter TLV format. */
    abstract asSignedTlv(): Bytes;

    /**
     * Returns the signed certificate in ASN.1 DER format.
     * If the certificate is not signed, it throws a CertificateError.
     */
    asSignedAsn1() {
        const certificate = this.genericBuildAsn1Structure(this.cert);
        const certBytes = DerCodec.encode({
            certificate,
            signAlgorithm: X962.EcdsaWithSHA256,
            signature: DerBitString(this.signature.der),
        });
        assertCertificateDerSize(certBytes);
        return certBytes;
    }

    /**
     * Verifies general requirements a Matter certificate fields must fulfill.
     * Rules for this are listed in @see {@link MatterSpecification.v12.Core} §6.5.x
     */
    generalVerify() {
        const cert = this.cert;
        if (cert.serialNumber.byteLength > 20)
            throw new CertificateError(
                `Serial number must not be longer then 20 octets. Current serial number has ${cert.serialNumber.byteLength} octets.`,
            );

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
