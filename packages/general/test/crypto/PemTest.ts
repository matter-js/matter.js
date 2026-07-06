/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateError } from "#crypto/CryptoError.js";
import { Pem } from "#crypto/Pem.js";
import { Bytes } from "#util/Bytes.js";

describe("Pem", () => {
    const der = Bytes.fromHex("0102030405");

    describe("encode", () => {
        it("wraps DER bytes in a CERTIFICATE block by default", () => {
            const pem = Pem.encode(der);

            expect(pem.startsWith("-----BEGIN CERTIFICATE-----\n")).equal(true);
            expect(pem.endsWith("\n-----END CERTIFICATE-----")).equal(true);
        });

        it("uppercases a custom block kind", () => {
            const pem = Pem.encode(der, "private key");

            expect(pem.startsWith("-----BEGIN PRIVATE KEY-----")).equal(true);
            expect(pem.endsWith("-----END PRIVATE KEY-----")).equal(true);
        });
    });

    describe("asDer", () => {
        it("round-trips encoded bytes", () => {
            expect(Bytes.toHex(Pem.asDer(Pem.encode(der)))).equal(Bytes.toHex(der));
        });

        it("passes raw DER bytes through unchanged", () => {
            expect(Pem.asDer(der)).equal(der);
        });

        it("throws when no BEGIN line is present", () => {
            expect(() => Pem.asDer("no markers here")).throws(CertificateError, "No BEGIN line");
        });

        it("throws when no END line is present", () => {
            expect(() => Pem.asDer("-----BEGIN CERTIFICATE-----\nAQIDBAU=")).throws(CertificateError, "No END line");
        });
    });
});
