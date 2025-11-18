/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, PrivateKey, Time, toHex } from "#general";
import { VendorId } from "#types";
import {
    TestCert_PAA_NoVID_PrivateKey,
    TestCert_PAA_NoVID_PublicKey,
    TestCert_PAA_NoVID_SKID,
} from "./ChipPAAuthorities.js";
import { Dac, Paa, Pai } from "./kinds/AttestationCertificates.js";
import { jsToMatterDate } from "./kinds/definitions/asn.js";

function getPaiCommonName(vendorId: VendorId, productId?: number) {
    return `node-matter Dev PAI 0x${vendorId.toString(16).toUpperCase()} ${
        productId === undefined ? "no PID" : `0x${productId.toString(16).toUpperCase()}`
    }`;
}

function getDacCommonName(vendorId: VendorId, productId: number) {
    return `node-matter Dev DAC 0x${vendorId.toString(16).toUpperCase()}/0x${productId.toString(16).toUpperCase()}`;
}

function getPaaCommonName() {
    // Do not change this because we use the official Matter Test PAA and the certificate uses this name!
    return "Matter Test PAA";
}

export class AttestationCertificateManager {
    private paaCertId = BigInt(0);

    // We use the official PAA cert for now because else pairing with Chip tool do not work because
    // only this one is the Certificate store
    readonly #paaKeyPair = PrivateKey(TestCert_PAA_NoVID_PrivateKey, {
        publicKey: TestCert_PAA_NoVID_PublicKey,
    });
    readonly #crypto: Crypto;
    readonly #vendorId: VendorId;
    readonly #paiKeyPair: PrivateKey;
    readonly #paiKeyIdentifier: Bytes;
    readonly #paaKeyIdentifier = TestCert_PAA_NoVID_SKID;
    readonly #paiCertId = BigInt(1);
    readonly #paiCertBytes;
    #nextCertificateId = 2;

    constructor(crypto: Crypto, vendorId: VendorId, paiKeyPair: PrivateKey, paiKeyIdentifier: Bytes) {
        this.#crypto = crypto;
        this.#vendorId = vendorId;
        this.#paiKeyPair = paiKeyPair;
        this.#paiKeyIdentifier = paiKeyIdentifier;
        this.#paiCertBytes = this.generatePAICert(vendorId);
    }

    static async create(crypto: Crypto, vendorId: VendorId) {
        const key = await crypto.createKeyPair();
        const identifier = Bytes.of(await crypto.computeHash(key.publicKey));
        return new AttestationCertificateManager(crypto, vendorId, key, identifier.slice(0, 20));
    }

    getPAICert() {
        return this.#paiCertBytes;
    }

    async getDACert(productId: number) {
        const dacKeyPair = await this.#crypto.createKeyPair();
        return {
            keyPair: dacKeyPair,
            dac: await this.generateDaCert(dacKeyPair.publicKey, this.#vendorId, productId),
        };
    }

    // Method unused for now because we use the official Matter Test PAA, but is functional
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    private async generatePAACert(vendorId?: VendorId) {
        const now = Time.now;
        const cert = new Paa({
            serialNumber: Bytes.fromHex(toHex(this.paaCertId)),
            signatureAlgorithm: 1 /* EcdsaWithSHA256 */,
            publicKeyAlgorithm: 1 /* EC */,
            ellipticCurveIdentifier: 1 /* P256v1 */,
            issuer: {
                commonName: getPaaCommonName(),
                vendorId: vendorId,
            },
            notBefore: jsToMatterDate(now, -1),
            notAfter: jsToMatterDate(now, 10),
            subject: {
                commonName: getPaaCommonName(),
                vendorId: vendorId,
            },
            ellipticCurvePublicKey: this.#paaKeyPair.publicKey,
            extensions: {
                basicConstraints: {
                    isCa: true,
                    pathLen: 1,
                },
                keyUsage: {
                    keyCertSign: true,
                    cRLSign: true,
                },
                subjectKeyIdentifier: this.#paaKeyIdentifier,
                authorityKeyIdentifier: this.#paaKeyIdentifier,
            },
        });
        await cert.sign(this.#crypto, this.#paaKeyPair);
        return cert.asSignedAsn1();
    }

    private async generatePAICert(vendorId: VendorId, productId?: number) {
        const now = Time.now;
        const cert = new Pai({
            serialNumber: Bytes.fromHex(toHex(this.#paiCertId)),
            signatureAlgorithm: 1 /* EcdsaWithSHA256 */,
            publicKeyAlgorithm: 1 /* EC */,
            ellipticCurveIdentifier: 1 /* P256v1 */,
            issuer: {
                commonName: getPaaCommonName(),
            },
            notBefore: jsToMatterDate(now, -1),
            notAfter: jsToMatterDate(now, 10),
            subject: {
                commonName: getPaiCommonName(vendorId, productId),
                vendorId: vendorId,
                productId: productId,
            },
            ellipticCurvePublicKey: this.#paiKeyPair.publicKey,
            extensions: {
                basicConstraints: {
                    isCa: true,
                    pathLen: 0,
                },
                keyUsage: {
                    keyCertSign: true,
                    cRLSign: true,
                },
                subjectKeyIdentifier: this.#paiKeyIdentifier,
                authorityKeyIdentifier: this.#paaKeyIdentifier,
            },
        });
        await cert.sign(this.#crypto, this.#paaKeyPair);
        return cert.asSignedAsn1();
    }

    async generateDaCert(publicKey: Bytes, vendorId: VendorId, productId: number) {
        const now = Time.now;
        const certId = this.#nextCertificateId++;
        const cert = new Dac({
            serialNumber: Bytes.fromHex(toHex(certId)),
            signatureAlgorithm: 1 /* EcdsaWithSHA256 */,
            publicKeyAlgorithm: 1 /* EC */,
            ellipticCurveIdentifier: 1 /* P256v1 */,
            notBefore: jsToMatterDate(now, -1),
            notAfter: jsToMatterDate(now, 10),
            issuer: {
                commonName: getPaiCommonName(vendorId),
                vendorId: vendorId,
            },
            subject: {
                commonName: getDacCommonName(vendorId, productId),
                vendorId: vendorId,
                productId: productId,
            },
            ellipticCurvePublicKey: publicKey,
            extensions: {
                basicConstraints: {
                    isCa: false,
                },
                keyUsage: {
                    digitalSignature: true,
                },
                subjectKeyIdentifier: Bytes.of(await this.#crypto.computeHash(publicKey)).slice(0, 20),
                authorityKeyIdentifier: this.#paiKeyIdentifier,
            },
        });
        await cert.sign(this.#crypto, this.#paiKeyPair);
        return cert.asSignedAsn1();
    }
}
