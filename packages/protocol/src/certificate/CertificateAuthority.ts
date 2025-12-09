/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BinaryKeyPair,
    Bytes,
    Construction,
    Crypto,
    Environment,
    Environmental,
    InternalError,
    Logger,
    PrivateKey,
    StorageContext,
    StorageManager,
    Time,
    asyncNew,
    toHex,
} from "#general";
import { CaseAuthenticatedTag, FabricId, NodeId } from "#types";
import { jsToMatterDate } from "./kinds/definitions/asn.js";
import { Noc } from "./kinds/Noc.js";
import { Rcac } from "./kinds/Rcac.js";

const logger = Logger.get("CertificateAuthority");

/**
 * Manages the root key pair for a fabric owned by a local node.
 * TODO: Add support for (optional) ICACs
 */
export class CertificateAuthority {
    #crypto: Crypto;
    #rootCertId = BigInt(0);
    #rootKeyPair?: PrivateKey;
    #rootKeyIdentifier?: Bytes;
    #rootCertBytes?: Bytes;
    #nextCertificateId = BigInt(1);
    #construction: Construction<CertificateAuthority>;

    get crypto() {
        return this.#crypto;
    }

    get construction() {
        return this.#construction;
    }

    static async create(crypto: Crypto, options?: StorageContext | CertificateAuthority.Configuration) {
        return asyncNew(CertificateAuthority, crypto, options);
    }

    constructor(crypto: Crypto, options?: StorageContext | CertificateAuthority.Configuration) {
        this.#crypto = crypto;
        this.#construction = Construction(this, async () => {
            // Use provided CA config or read from storage, otherwise initialize and store
            const certValues = options instanceof StorageContext ? await options.values() : (options ?? {});

            this.#rootKeyPair = await this.#crypto.createKeyPair();
            this.#rootKeyIdentifier = Bytes.of(await this.#crypto.computeHash(this.#rootKeyPair.publicKey)).slice(
                0,
                20,
            );
            this.#rootCertBytes = await this.#generateRootCert();

            if (
                (typeof certValues.rootCertId === "number" || typeof certValues.rootCertId === "bigint") &&
                (Bytes.isBytes(certValues.rootKeyPair) || typeof certValues.rootKeyPair === "object") &&
                Bytes.isBytes(certValues.rootKeyIdentifier) &&
                Bytes.isBytes(certValues.rootCertBytes) &&
                (typeof certValues.nextCertificateId === "number" || typeof certValues.nextCertificateId === "bigint")
            ) {
                this.#rootCertId = BigInt(certValues.rootCertId);
                this.#rootKeyPair = PrivateKey(certValues.rootKeyPair as BinaryKeyPair);
                this.#rootKeyIdentifier = certValues.rootKeyIdentifier;
                this.#rootCertBytes = certValues.rootCertBytes;
                this.#nextCertificateId = BigInt(certValues.nextCertificateId);
                logger.info(`Loaded stored credentials with certificate ID ${this.#rootCertId}`);
                return;
            }

            logger.info(`Created new credentials with ID ${this.#rootCertId}`);

            if (options instanceof StorageContext) {
                await options.set({
                    rootCertId: this.#rootCertId,
                    rootKeyPair: this.#rootKeyPair.keyPair,
                    rootKeyIdentifier: this.#rootKeyIdentifier,
                    rootCertBytes: this.#rootCertBytes,
                    nextCertificateId: this.#nextCertificateId,
                });
            }
        });
    }

    static [Environmental.create](env: Environment) {
        const storage = env.get(StorageManager).createContext("certificates");
        const instance = new CertificateAuthority(env.get(Crypto), storage);
        env.set(CertificateAuthority, instance);
        return instance;
    }

    get rootCert(): Bytes {
        return this.#construction.assert("root cert", this.#rootCertBytes);
    }

    get config(): CertificateAuthority.Configuration {
        return {
            rootCertId: this.#rootCertId,
            rootKeyPair: this.construction.assert("root key pair", this.#rootKeyPair).keyPair,
            rootKeyIdentifier: this.construction.assert("root key identifier", this.#rootKeyIdentifier),
            rootCertBytes: this.construction.assert("root cert bytes", this.#rootCertBytes),
            nextCertificateId: this.#nextCertificateId,
        };
    }

    async #generateRootCert() {
        const now = Time.now;
        const cert = new Rcac({
            serialNumber: Bytes.fromHex(toHex(this.#rootCertId)),
            signatureAlgorithm: 1 /* EcdsaWithSHA256 */,
            publicKeyAlgorithm: 1 /* EC */,
            ellipticCurveIdentifier: 1 /* P256v1 */,
            issuer: { rcacId: this.#rootCertId },
            notBefore: jsToMatterDate(now, -1),
            notAfter: jsToMatterDate(now, 10),
            subject: { rcacId: this.#rootCertId },
            ellipticCurvePublicKey: this.#initializedRootKeyPair.publicKey,
            extensions: {
                basicConstraints: { isCa: true },
                keyUsage: {
                    keyCertSign: true,
                    cRLSign: true,
                },
                subjectKeyIdentifier: this.#initializedRootKeyIdentifier,
                authorityKeyIdentifier: this.#initializedRootKeyIdentifier,
            },
        });
        await cert.sign(this.#crypto, this.#initializedRootKeyPair);
        return cert.asSignedTlv();
    }

    async generateNoc(
        publicKey: Bytes,
        fabricId: FabricId,
        nodeId: NodeId,
        caseAuthenticatedTags?: CaseAuthenticatedTag[],
    ) {
        const now = Time.now;
        const certId = this.#nextCertificateId++;
        const cert = new Noc({
            serialNumber: Bytes.fromHex(toHex(certId)),
            signatureAlgorithm: 1 /* EcdsaWithSHA256 */,
            publicKeyAlgorithm: 1 /* EC */,
            ellipticCurveIdentifier: 1 /* P256v1 */,
            issuer: { rcacId: this.#rootCertId },
            notBefore: jsToMatterDate(now, -1),
            notAfter: jsToMatterDate(now, 10),
            subject: { fabricId, nodeId, caseAuthenticatedTags },
            ellipticCurvePublicKey: publicKey,
            extensions: {
                basicConstraints: { isCa: false },
                keyUsage: {
                    digitalSignature: true,
                },
                extendedKeyUsage: [2, 1],
                subjectKeyIdentifier: Bytes.of(await this.#crypto.computeHash(publicKey)).slice(0, 20),
                authorityKeyIdentifier: this.#initializedRootKeyIdentifier,
            },
        });
        await cert.sign(this.#crypto, this.#initializedRootKeyPair);
        return cert.asSignedTlv();
    }

    get #initializedRootKeyPair() {
        if (this.#rootKeyPair === undefined) {
            throw new InternalError("CA private key is not installed");
        }
        return this.#rootKeyPair;
    }

    get #initializedRootKeyIdentifier() {
        if (this.#rootKeyIdentifier === undefined) {
            throw new InternalError("CA key identifier is not installed");
        }
        return this.#rootKeyIdentifier;
    }
}

export namespace CertificateAuthority {
    export type Configuration = {
        rootCertId: bigint;
        rootKeyPair: BinaryKeyPair;
        rootKeyIdentifier: Bytes;
        rootCertBytes: Bytes;
        nextCertificateId: bigint;
    };
}
