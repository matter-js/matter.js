/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DerError } from "#codec/DerCodec.js";
import { CertificateError } from "#crypto/CryptoError.js";
import { X509 } from "#crypto/X509.js";

describe("X509", () => {
    describe("ExtendedKeyUsage", () => {
        it("returns undefined for undefined input", () => {
            expect(X509.ExtendedKeyUsage(undefined)).undefined;
        });

        it("encodes known usage values", () => {
            expect(X509.ExtendedKeyUsage([1, 2])).not.undefined;
        });

        it("throws for an unsupported usage value", () => {
            expect(() => X509.ExtendedKeyUsage([99])).throws(DerError, "Unsupported extended key usage");
        });
    });

    describe("BasicConstraints", () => {
        it("encodes CA and non-CA constraints", () => {
            expect(X509.BasicConstraints({ isCa: true, pathLen: 1 })).not.undefined;
            expect(X509.BasicConstraints({ isCa: false })).not.undefined;
        });
    });

    describe("KeyUsage", () => {
        it("accepts a flag object and a numeric value", () => {
            expect(X509.KeyUsage({ digitalSignature: true })).not.undefined;
            expect(X509.KeyUsage(0x01)).not.undefined;
        });
    });

    describe("certificateToDer", () => {
        it("rejects a path length on a non-CA certificate", () => {
            const cert = {
                extensions: { basicConstraints: { isCa: false, pathLen: 1 } },
            } as unknown as X509.UnsignedCertificate;

            expect(() => X509.certificateToDer(cert)).throws(
                CertificateError,
                "Path length must be undefined for non-CA",
            );
        });
    });
});
