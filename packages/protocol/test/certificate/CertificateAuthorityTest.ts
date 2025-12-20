/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { Icac } from "#certificate/kinds/Icac.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { Rcac } from "#certificate/kinds/Rcac.js";
import { Bytes, StandardCrypto, StorageBackendMemory, StorageContext, StorageManager } from "#general";
import { CaseAuthenticatedTag, FabricId, NodeId } from "#types";

const crypto = new StandardCrypto();

describe("CertificateAuthority", () => {
    describe("2-tier PKI (default)", () => {
        it("creates a new CA without ICAC", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const rootCert = ca.rootCert;
            const icacCert = ca.icacCert;

            expect(rootCert).ok;
            expect(icacCert).undefined;

            const rcac = Rcac.fromTlv(rootCert);
            expect(BigInt(rcac.cert.subject.rcacId)).equal(BigInt(0));
        });

        it("generates NOC signed by root", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n), [
                CaseAuthenticatedTag(0x00010001),
            ]);

            const nocCert = Noc.fromTlv(noc);
            expect(BigInt(nocCert.cert.issuer.rcacId!)).equal(BigInt(0));
            expect(nocCert.cert.issuer.icacId).undefined;
        });

        it("persists and loads from storage", async () => {
            const storage = new StorageManager(new StorageBackendMemory());
            await storage.initialize();
            const context = storage.createContext("test");

            const ca1 = await CertificateAuthority.create(crypto, context);
            const rootCert1 = ca1.rootCert;

            const ca2 = new CertificateAuthority(crypto, context);
            await ca2.construction;
            const rootCert2 = ca2.rootCert;

            expect(Bytes.toHex(rootCert1)).equal(Bytes.toHex(rootCert2));
            expect(ca2.icacCert).undefined;

            await storage.close();
        });
    });

    describe("3-tier PKI with ICAC", () => {
        it("creates a CA with ICAC when intermediateCert=true", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const rootCert = ca.rootCert;
            const icacCert = ca.icacCert;

            expect(rootCert).ok;
            expect(icacCert).ok;

            const rcac = Rcac.fromTlv(rootCert);
            const icac = Icac.fromTlv(icacCert!);

            expect(BigInt(rcac.cert.subject.rcacId)).equal(BigInt(0));
            expect(BigInt(icac.cert.subject.icacId!)).equal(BigInt(1));
            expect(BigInt(icac.cert.issuer.rcacId!)).equal(BigInt(0));
        });

        it("generates NOC signed by ICAC when ICAC exists", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n));

            const nocCert = Noc.fromTlv(noc);
            expect(BigInt(nocCert.cert.issuer.icacId!)).equal(BigInt(1));
            expect(nocCert.cert.issuer.rcacId).undefined;
        });

        it("persists ICAC to storage", async () => {
            const storage = new StorageManager(new StorageBackendMemory());
            await storage.initialize();
            const context = storage.createContext("test");

            const ca1 = await CertificateAuthority.create(crypto, true);
            const icacCert1 = ca1.icacCert;
            const config1 = ca1.config;
            await context.set(config1);

            const ca2 = new CertificateAuthority(crypto, config1);
            await ca2.construction;
            const icacCert2 = ca2.icacCert;

            expect(icacCert1).ok;
            expect(icacCert2).ok;
            expect(Bytes.toHex(icacCert1!)).equal(Bytes.toHex(icacCert2!));

            await storage.close();
        });

        it("auto-detects ICAC from storage when ica option not provided", async () => {
            const storage = new StorageManager(new StorageBackendMemory());
            await storage.initialize();
            const context = storage.createContext("test");

            const ca1 = await CertificateAuthority.create(crypto, true);
            await ca1.construction;
            expect(ca1.icacCert).ok;

            await context.set(ca1.config);

            const ca2 = new CertificateAuthority(crypto, context);
            await ca2.construction;

            expect(ca2.icacCert).ok;

            await storage.close();
        });

        it("loads ICAC from storage and sets intermediateCert=true (storage takes precedence)", async () => {
            const storage = new StorageManager(new StorageBackendMemory());
            await storage.initialize();
            const context = storage.createContext("test");

            const ca1 = await CertificateAuthority.create(crypto, true);
            await ca1.construction;
            expect(ca1.icacCert).ok;

            await context.set(ca1.config);

            const ca2 = new CertificateAuthority(crypto, context);
            await ca2.construction;

            expect(ca2.icacCert).ok;

            await storage.close();
        });
    });

    describe("Configuration behavior", () => {
        let storage: StorageManager;
        let context: StorageContext;

        beforeEach(async () => {
            storage = new StorageManager(new StorageBackendMemory());
            storage.initialize();
            context = storage.createContext("test");
        });

        afterEach(async () => {
            await storage.close();
        });

        it("throws ImplementationError when intermediateCert=true but no ICAC data in storage", async () => {
            const ca1 = await CertificateAuthority.create(crypto, context, false);
            await ca1.construction;

            await expect(CertificateAuthority.create(crypto, context, true)).rejectedWith(
                "Stored credentials contain ICAC certificate: false, but configuration expected it to be true",
            );
        });

        it("throws ImplementationError when ICAC data exists but intermediateCert=false", async () => {
            const ca1 = await CertificateAuthority.create(crypto, context, true);
            await ca1.construction;

            await expect(CertificateAuthority.create(crypto, context, false)).rejectedWith(
                "Stored credentials contain ICAC certificate: true, but configuration expected it to be false",
            );
        });
    });

    describe("Certificate ID management", () => {
        it("increments certificate IDs correctly", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const keyPair1 = await crypto.createKeyPair();
            const keyPair2 = await crypto.createKeyPair();

            const noc1 = await ca.generateNoc(keyPair1.publicKey, FabricId(1n), NodeId(100n));
            const noc2 = await ca.generateNoc(keyPair2.publicKey, FabricId(1n), NodeId(101n));

            const nocCert1 = Noc.fromTlv(noc1);
            const nocCert2 = Noc.fromTlv(noc2);

            const id1 = BigInt("0x" + Bytes.toHex(nocCert1.cert.serialNumber));
            const id2 = BigInt("0x" + Bytes.toHex(nocCert2.cert.serialNumber));

            expect(id2).equal(id1 + 1n);
        });

        it("allocates ICAC cert ID before NOC IDs", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const icacCert = Icac.fromTlv(ca.icacCert!);
            const icacId = BigInt("0x" + Bytes.toHex(icacCert.cert.serialNumber));

            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n));
            const nocCert = Noc.fromTlv(noc);
            const nocId = BigInt("0x" + Bytes.toHex(nocCert.cert.serialNumber));

            expect(icacId).equal(BigInt(1));
            expect(nocId).equal(BigInt(2));
        });
    });

    describe("Configuration export", () => {
        it("exports complete configuration with ICAC", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const config = ca.config;

            expect(BigInt(config.rootCertId)).equal(BigInt(0));
            expect(BigInt(config.icacCertId!)).equal(BigInt(1));
            expect(config.icacKeyPair).ok;
            expect(config.icacKeyIdentifier).ok;
            expect(config.icacCertBytes).ok;
        });

        it("can reconstruct CA from exported config", async () => {
            const ca1 = await CertificateAuthority.create(crypto, true);
            const config = ca1.config;

            const ca2 = await CertificateAuthority.create(crypto, config);
            const rootCert1 = ca1.rootCert;
            const rootCert2 = ca2.rootCert;
            const icacCert1 = ca1.icacCert;
            const icacCert2 = ca2.icacCert;

            expect(Bytes.toHex(rootCert1)).equal(Bytes.toHex(rootCert2));
            expect(Bytes.toHex(icacCert1!)).equal(Bytes.toHex(icacCert2!));
        });
    });

    describe("NOC generation with CATs", () => {
        it("generates NOC with CASE Authenticated Tags", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const keyPair = await crypto.createKeyPair();
            const cats = [CaseAuthenticatedTag(0x00010001), CaseAuthenticatedTag(0x00020001)];
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n), cats);

            const nocCert = Noc.fromTlv(noc);
            expect(nocCert.cert.subject.caseAuthenticatedTags).deep.equal(cats);
        });
    });
});
