/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BinaryKeyPair,
    Bytes,
    Construction,
    Crypto,
    Environment,
    Environmental,
    ImplementationError,
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
    #icacProps?: IcacProps;

    get crypto() {
        return this.#crypto;
    }

    get construction() {
        return this.#construction;
    }

    close() {
        return this.#construction.close();
    }

    /**
     * Creates a new CertificateAuthority instance and use the provided storage to store and retrieve the values.
     * A new certificate is only created when the storage does not contain any credentials.
     * Use the generateIntermediateCert parameter to specify if an ICAC should be created too. The parameter, when set,
     * must match to the storage content if a certificate is stored!
     */
    static create(
        crypto: Crypto,
        storage: StorageContext,
        generateIntermediateCert?: boolean,
    ): Promise<CertificateAuthority>;

    /**
     * Creates a new CertificateAuthority instance with the provided configuration. The used certificate is loaded from
     * the configuration object.
     */
    static create(crypto: Crypto, options: CertificateAuthority.Configuration): Promise<CertificateAuthority>;

    /**
     * Creates a new CertificateAuthority instance with the provided configuration. The configuration is not stored.
     * Use the generateIntermediateCert parameter to specify if an ICAC should be created too.
     */
    static create(crypto: Crypto, generateIntermediateCert?: boolean): Promise<CertificateAuthority>;

    static async create(
        crypto: Crypto,
        options?: StorageContext | CertificateAuthority.Configuration | boolean,
        generateIntermediateCert?: boolean,
    ) {
        return asyncNew(CertificateAuthority, crypto, options, generateIntermediateCert);
    }

    constructor(
        crypto: Crypto,
        options?: StorageContext | CertificateAuthority.Configuration | boolean,
        generateIntermediateCert?: boolean,
    ) {
        this.#crypto = crypto;

        this.#construction = Construction(this, async () => {
            if (typeof options === "boolean") {
                generateIntermediateCert = options;
                options = undefined;
            }

            const certValues = options instanceof StorageContext ? await options.values() : (options ?? {});

            // When generateIntermediateCert is set, we ensure it, or if a valid ICAC is stored then we require it
            // else we check what's in the storage and default to false
            const requireIcac = generateIntermediateCert ?? this.#isValidStoredIcacCertificate(certValues);

            if (this.#isValidStoredRootCertificate(certValues)) {
                this.#loadFromStorage(certValues, requireIcac);
                logger.info(
                    `Loaded stored credentials with ID ${this.#rootCertId}${this.#icacProps !== undefined ? ` and ICAC with ID ${this.#icacProps.certId}` : ""}`,
                );
                return;
            }

            this.#rootKeyPair = await this.#crypto.createKeyPair();
            this.#rootKeyIdentifier = Bytes.of(await this.#crypto.computeHash(this.#rootKeyPair.publicKey)).slice(
                0,
                20,
            );
            this.#rootCertBytes = await this.#generateRootCert();

            if (requireIcac) {
                this.#icacProps = await this.#generateIcacProps();
            }

            logger.info(
                `Created new credentials with ID ${this.#rootCertId}${this.#icacProps !== undefined ? ` and ICAC with ID ${this.#icacProps.certId}` : ""}`,
            );

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
        return {
            rootCertId: this.#rootCertId,
            rootKeyIdentifier: this.construction.assert("root key identifier", this.#rootKeyIdentifier),
            rootCertBytes: this.construction.assert("root cert bytes", this.#rootCertBytes),
            nextCertificateId: this.#nextCertificateId,
            ...(this.#icacProps !== undefined
                ? {
                      rootKeyPair: this.#rootKeyPair?.keyPair, // rootKeyPair is optional when using ICAC
                      icacCertId: this.#icacProps.certId,
                      icacKeyPair: this.construction.assert("icac key pair", this.#icacProps.keyPair).keyPair,
                      icacKeyIdentifier: this.construction.assert("icac key identifier", this.#icacProps.keyIdentifier),
                      icacCertBytes: this.construction.assert("icac cert bytes", this.#icacProps.certBytes),
                  }
                : {
                      rootKeyPair: this.construction.assert("root key pair", this.#rootKeyPair).keyPair,
                  }),
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
            (certValues.rootKeyPair === undefined ||
                Bytes.isBytes(certValues.rootKeyPair) ||
                typeof certValues.rootKeyPair === "object") &&
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

    #loadFromStorage(certValues: Record<string, unknown>, requireIcac?: boolean): void {
        this.#rootCertId = BigInt(certValues.rootCertId as bigint | number);
        if (certValues.rootKeyPair !== undefined) {
            // rootKeyPair is optional when using ICAC (3-tier PKI without RCAC private key)
            this.#rootKeyPair = PrivateKey(certValues.rootKeyPair as BinaryKeyPair);
        }
        this.#rootKeyIdentifier = certValues.rootKeyIdentifier as Bytes;
        this.#rootCertBytes = certValues.rootCertBytes as Bytes;
        this.#nextCertificateId = BigInt(certValues.nextCertificateId as bigint | number);

        const hasIcac = this.#isValidStoredIcacCertificate(certValues);
        if (requireIcac !== undefined && requireIcac !== hasIcac) {
            throw new ImplementationError(
                `Stored credentials contain ICAC certificate: ${hasIcac}, but configuration expected it to be ${requireIcac}`,
            );
        }

        if (hasIcac) {
            this.#icacProps = {
                certId: BigInt(certValues.icacCertId as bigint | number),
                keyPair: PrivateKey(certValues.icacKeyPair as BinaryKeyPair),
                keyIdentifier: certValues.icacKeyIdentifier as Bytes,
                certBytes: certValues.icacCertBytes as Bytes,
            };
        } else {
            // Validate: when no ICAC, rootKeyPair is required for signing NOCs
            if (this.#rootKeyPair === undefined) {
                throw new ImplementationError(
                    "rootKeyPair is required when not using ICAC (2-tier PKI requires RCAC private key to sign NOCs)",
                );
            }
        }
    }

    #buildStorageData(): CertificateAuthority.Configuration {
        return {
            rootCertId: this.#rootCertId,
            rootKeyIdentifier: this.#initializedRootKeyIdentifier,
            rootCertBytes: this.#initializedRootCertBytes,
            nextCertificateId: this.#nextCertificateId,
            ...(this.#icacProps
                ? {
                      rootKeyPair: this.#rootKeyPair?.keyPair, // rootKeyPair is optional when using ICAC
                      icacCertId: this.#icacProps.certId,
                      icacKeyPair: this.#icacProps.keyPair.keyPair,
                      icacKeyIdentifier: this.#icacProps.keyIdentifier,
                      icacCertBytes: this.#icacProps.certBytes,
                  }
                : {
                      rootKeyPair: this.#initializedRootKeyPair.keyPair,
                  }),
        };
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
    /** Base configuration fields shared by both 2-tier and 3-tier PKI */
    type ConfigurationBase = {
        rootCertId: bigint;
        rootKeyIdentifier: Bytes;
        rootCertBytes: Bytes;
        nextCertificateId: bigint;
    };

    /**
     * Configuration for 2-tier PKI (RCAC -> NOC).
     * rootKeyPair is REQUIRED since RCAC signs NOCs directly.
     */
    export type ConfigurationWithoutIcac = ConfigurationBase & {
        rootKeyPair: BinaryKeyPair;
    };

    /**
     * Configuration for 3-tier PKI (RCAC -> ICAC -> NOC).
     * rootKeyPair is OPTIONAL since ICAC signs NOCs, not RCAC.
     * This allows controllers to operate without access to the RCAC private key.
     */
    export type ConfigurationWithIcac = ConfigurationBase & {
        rootKeyPair?: BinaryKeyPair;
        icacCertId: bigint;
        icacKeyPair: BinaryKeyPair;
        icacKeyIdentifier: Bytes;
        icacCertBytes: Bytes;
    };

    /**
     * Configuration for CertificateAuthority with external certificates.
     *
     * When using ICAC (3-tier PKI), the rootKeyPair can be omitted since NOCs are signed
     * by the ICAC, not the RCAC. This allows controllers to operate without access to
     * the RCAC private key.
     */
    export type Configuration = ConfigurationWithoutIcac | ConfigurationWithIcac;
}
