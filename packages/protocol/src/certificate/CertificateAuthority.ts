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
import { Icac } from "./kinds/Icac.js";
import { Noc } from "./kinds/Noc.js";
import { Rcac } from "./kinds/Rcac.js";

const logger = Logger.get("CertificateAuthority");

/**
 * Manages the root key pair for a fabric owned by a local node.
 *
 * Supports optional Intermediate Certificate Authority (ICAC) for 3-tier PKI hierarchy.
 * When ICAC is enabled, the certificate chain becomes: RCAC -> ICAC -> NOC instead of RCAC -> NOC.
 *
 * Configuration:
 * - intermediateCert: Enable/disable ICAC generation. Defaults to false (2-tier PKI).
 *
 * Behavior:
 * - When ICAC exists, it is always used to sign NOCs (operational certificates)
 * - When no ICAC exists, the root certificate signs NOCs directly
 *
 * Security implications:
 * - 3-tier PKI allows RCAC to remain in secure storage while ICAC signs operational certificates
 * - Storage of existing certificates is preserved when loading from storage
 * - Configuration changes after creation are not supported
 */
export class CertificateAuthority {
    #crypto: Crypto;
    #rootCertId = BigInt(0);
    #rootKeyPair?: PrivateKey;
    #rootKeyIdentifier?: Bytes;
    #rootCertBytes?: Bytes;
    #nextCertificateId = BigInt(1);
    #construction: Construction<CertificateAuthority>;
    #intermediateCert?: boolean;
    #icacProps?: IcacProps;

    get crypto() {
        return this.#crypto;
    }

    get construction() {
        return this.#construction;
    }

    static async create(
        crypto: Crypto,
        options?: StorageContext | CertificateAuthority.Configuration | CertificateAuthority.PartialConfiguration,
    ) {
        return asyncNew(CertificateAuthority, crypto, options);
    }

    constructor(
        crypto: Crypto,
        options?: StorageContext | CertificateAuthority.Configuration | CertificateAuthority.PartialConfiguration,
    ) {
        this.#crypto = crypto;

        this.#construction = Construction(this, async () => {
            const certValues = options instanceof StorageContext ? await options.values() : (options ?? {});

            if (this.#isValidStoredRootCertificate(certValues)) {
                const hasIcacInStorage = this.#isValidStoredIcacCertificate(certValues);
                if (hasIcacInStorage) {
                    this.#intermediateCert = true;
                } else if (typeof certValues.intermediateCert === "boolean") {
                    this.#intermediateCert = certValues.intermediateCert;
                } else {
                    this.#intermediateCert = false;
                }

                this.#loadFromStorage(certValues);

                // Reset intermediateCert to false if set but no ICAC data exists
                if (this.#intermediateCert && !hasIcacInStorage) {
                    logger.warn(
                        "intermediateCert=true in configuration but no valid ICAC data in storage. Resetting to 2-tier PKI.",
                    );
                    this.#intermediateCert = false;
                }

                logger.info(`Loaded stored credentials with ID ${this.#rootCertId}`);
                return;
            }

            const config = options instanceof StorageContext ? undefined : options;
            this.#intermediateCert = config?.intermediateCert ?? false;

            this.#rootKeyPair = await this.#crypto.createKeyPair();
            this.#rootKeyIdentifier = Bytes.of(await this.#crypto.computeHash(this.#rootKeyPair.publicKey)).slice(
                0,
                20,
            );
            this.#rootCertBytes = await this.#generateRootCert();

            logger.info(`Created new credentials with ID ${this.#rootCertId}`);

            if (this.#intermediateCert) {
                this.#icacProps = await this.#generateIcacProps();
            }

            if (options instanceof StorageContext) {
                await options.set(this.#buildStorageData());
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

    get icacCert(): Bytes | undefined {
        if (!this.#icacProps) {
            return undefined;
        }
        return this.#construction.assert("icac cert", this.#icacProps.certBytes);
    }

    get config(): CertificateAuthority.Configuration {
        const config: CertificateAuthority.Configuration = {
            rootCertId: this.#rootCertId,
            rootKeyPair: this.construction.assert("root key pair", this.#rootKeyPair).keyPair,
            rootKeyIdentifier: this.construction.assert("root key identifier", this.#rootKeyIdentifier),
            rootCertBytes: this.construction.assert("root cert bytes", this.#rootCertBytes),
            nextCertificateId: this.#nextCertificateId,
            intermediateCert: this.#intermediateCert,
        };

        if (this.#icacProps) {
            config.icacCertId = this.#icacProps.certId;
            config.icacKeyPair = this.construction.assert("icac key pair", this.#icacProps.keyPair).keyPair;
            config.icacKeyIdentifier = this.construction.assert("icac key identifier", this.#icacProps.keyIdentifier);
            config.icacCertBytes = this.construction.assert("icac cert bytes", this.#icacProps.certBytes);
        }

        return config;
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

    async #generateIcacProps(): Promise<IcacProps> {
        const certId = this.#nextCertificateId++;
        const keyPair = await this.#crypto.createKeyPair();
        const keyIdentifier = Bytes.of(await this.#crypto.computeHash(keyPair.publicKey)).slice(0, 20);

        const now = Time.now;
        const cert = new Icac({
            serialNumber: Bytes.fromHex(toHex(certId)),
            signatureAlgorithm: 1 /* EcdsaWithSHA256 */,
            publicKeyAlgorithm: 1 /* EC */,
            ellipticCurveIdentifier: 1 /* P256v1 */,
            issuer: { rcacId: this.#rootCertId },
            notBefore: jsToMatterDate(now, -1),
            notAfter: jsToMatterDate(now, 10),
            subject: { icacId: certId },
            ellipticCurvePublicKey: keyPair.publicKey,
            extensions: {
                basicConstraints: { isCa: true },
                keyUsage: {
                    keyCertSign: true,
                    cRLSign: true,
                },
                subjectKeyIdentifier: keyIdentifier,
                authorityKeyIdentifier: this.#initializedRootKeyIdentifier,
            },
        });
        await cert.sign(this.#crypto, this.#initializedRootKeyPair);

        return {
            certId,
            keyPair,
            keyIdentifier,
            certBytes: cert.asSignedTlv(),
        };
    }

    async generateNoc(
        publicKey: Bytes,
        fabricId: FabricId,
        nodeId: NodeId,
        caseAuthenticatedTags?: CaseAuthenticatedTag[],
    ) {
        const now = Time.now;
        const certId = this.#nextCertificateId++;

        const { issuer, signingKey, authorityKeyId } = this.#getSigningParameters();

        const cert = new Noc({
            serialNumber: Bytes.fromHex(toHex(certId)),
            signatureAlgorithm: 1 /* EcdsaWithSHA256 */,
            publicKeyAlgorithm: 1 /* EC */,
            ellipticCurveIdentifier: 1 /* P256v1 */,
            issuer,
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
                authorityKeyIdentifier: authorityKeyId,
            },
        });
        await cert.sign(this.#crypto, signingKey);
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

    #isValidStoredRootCertificate(certValues: Record<string, unknown>): boolean {
        return (
            (typeof certValues.rootCertId === "number" || typeof certValues.rootCertId === "bigint") &&
            (Bytes.isBytes(certValues.rootKeyPair) || typeof certValues.rootKeyPair === "object") &&
            Bytes.isBytes(certValues.rootKeyIdentifier) &&
            Bytes.isBytes(certValues.rootCertBytes) &&
            (typeof certValues.nextCertificateId === "number" || typeof certValues.nextCertificateId === "bigint")
        );
    }

    #isValidStoredIcacCertificate(certValues: Record<string, unknown>): boolean {
        return (
            (typeof certValues.icacCertId === "number" || typeof certValues.icacCertId === "bigint") &&
            (Bytes.isBytes(certValues.icacKeyPair) || typeof certValues.icacKeyPair === "object") &&
            Bytes.isBytes(certValues.icacKeyIdentifier) &&
            Bytes.isBytes(certValues.icacCertBytes)
        );
    }

    #loadFromStorage(certValues: Record<string, unknown>): void {
        this.#rootCertId = BigInt(certValues.rootCertId as bigint | number);
        this.#rootKeyPair = PrivateKey(certValues.rootKeyPair as BinaryKeyPair);
        this.#rootKeyIdentifier = certValues.rootKeyIdentifier as Bytes;
        this.#rootCertBytes = certValues.rootCertBytes as Bytes;
        this.#nextCertificateId = BigInt(certValues.nextCertificateId as bigint | number);

        if (this.#isValidStoredIcacCertificate(certValues)) {
            this.#icacProps = {
                certId: BigInt(certValues.icacCertId as bigint | number),
                keyPair: PrivateKey(certValues.icacKeyPair as BinaryKeyPair),
                keyIdentifier: certValues.icacKeyIdentifier as Bytes,
                certBytes: certValues.icacCertBytes as Bytes,
            };
        }
    }

    #buildStorageData(): CertificateAuthority.StorageData {
        const data: CertificateAuthority.StorageData = {
            rootCertId: this.#rootCertId,
            rootKeyPair: this.#initializedRootKeyPair.keyPair,
            rootKeyIdentifier: this.#initializedRootKeyIdentifier,
            rootCertBytes: this.#initializedRootCertBytes,
            nextCertificateId: this.#nextCertificateId,
            intermediateCert: this.#intermediateCert,
        };

        if (this.#icacProps) {
            data.icacCertId = this.#icacProps.certId;
            data.icacKeyPair = this.#icacProps.keyPair.keyPair;
            data.icacKeyIdentifier = this.#icacProps.keyIdentifier;
            data.icacCertBytes = this.#icacProps.certBytes;
        }

        return data;
    }

    #getSigningParameters(): {
        issuer: { rcacId: bigint } | { icacId: bigint };
        signingKey: PrivateKey;
        authorityKeyId: Bytes;
    } {
        if (this.#icacProps) {
            return {
                issuer: { icacId: this.#icacProps.certId },
                signingKey: this.#icacProps.keyPair,
                authorityKeyId: this.#icacProps.keyIdentifier,
            };
        }

        return {
            issuer: { rcacId: this.#rootCertId },
            signingKey: this.#initializedRootKeyPair,
            authorityKeyId: this.#initializedRootKeyIdentifier,
        };
    }

    get #initializedRootCertBytes() {
        if (this.#rootCertBytes === undefined) {
            throw new InternalError("Root certificate is not installed");
        }
        return this.#rootCertBytes;
    }
}

interface IcacProps {
    certId: bigint;
    keyPair: PrivateKey;
    keyIdentifier: Bytes;
    certBytes: Bytes;
}

export namespace CertificateAuthority {
    export type PartialConfiguration = {
        intermediateCert?: boolean;
    };

    export type Configuration = {
        rootCertId: bigint;
        rootKeyPair: BinaryKeyPair;
        rootKeyIdentifier: Bytes;
        rootCertBytes: Bytes;
        nextCertificateId: bigint;
        intermediateCert?: boolean;
        icacCertId?: bigint;
        icacKeyPair?: BinaryKeyPair;
        icacKeyIdentifier?: Bytes;
        icacCertBytes?: Bytes;
    };

    export type StorageData = {
        rootCertId: bigint;
        rootKeyPair: BinaryKeyPair;
        rootKeyIdentifier: Bytes;
        rootCertBytes: Bytes;
        nextCertificateId: bigint;
        intermediateCert?: boolean;
        icacCertId?: bigint;
        icacKeyPair?: BinaryKeyPair;
        icacKeyIdentifier?: Bytes;
        icacCertBytes?: Bytes;
    };
}
