/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BinaryKeyPair,
    Bytes,
    Crypto,
    ImplementationError,
    InternalError,
    Logger,
    PrivateKey,
    StorageContext,
    Time,
    toHex,
} from "@matter/general";
import { CaseAuthenticatedTag, FabricId, NodeId } from "@matter/types";
import type { CertificateAuthority } from "./CertificateAuthority.js";
import { jsToMatterDate } from "./kinds/definitions/asn.js";
import { OperationalCertificate } from "./kinds/definitions/operational.js";
import { Icac } from "./kinds/Icac.js";
import { Noc } from "./kinds/Noc.js";
import { Rcac } from "./kinds/Rcac.js";

const logger = Logger.get("CertificateAuthority");

/**
 * The built-in issuer of a {@link CertificateAuthority}: holds the root key pair and an optional ICAC key pair and
 * signs NOCs locally.
 *
 * - When an ICAC exists, it signs every NOC; else the root signs them directly.
 * - Stored credentials are loaded as they are; configuration changes after creation are not supported.
 * - A 3-tier PKI lets the RCAC private key stay in secure storage while the ICAC signs NOCs.
 */
export class LocalIssuer implements CertificateAuthority.Issuer {
    #crypto: Crypto;
    #rootCertId = BigInt(0);
    #rootKeyPair?: PrivateKey;
    #rootKeyIdentifier?: Bytes;
    #rootCertBytes?: Bytes;
    #rootSubject?: OperationalCertificate.Rcac["subject"];
    #nextCertificateId = BigInt(1);
    #icacProps?: IcacProps;
    #storage?: StorageContext;

    constructor(crypto: Crypto, storage?: StorageContext) {
        this.#crypto = crypto;
        this.#storage = storage;
    }

    /**
     * Load the credentials from the storage or {@link config}, or create new ones.  New credentials are stored when a
     * storage is set.  {@link generateIntermediateCert}, when set, must match what is stored.
     */
    async initialize(config?: CertificateAuthority.Configuration, generateIntermediateCert?: boolean) {
        const certValues = this.#storage !== undefined ? await this.#storage.values() : (config ?? {});

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
        this.#rootKeyIdentifier = Bytes.of(await this.#crypto.computeHash(this.#rootKeyPair.publicKey, "SHA-1"));
        this.#installRootCert(await this.#generateRootCert());

        if (requireIcac) {
            this.#icacProps = await this.#generateIcacProps();
        }

        logger.info(
            `Created new credentials with ID ${this.#rootCertId}${this.#icacProps !== undefined ? ` and ICAC with ID ${this.#icacProps.certId}` : ""}`,
        );

        if (this.#storage !== undefined) {
            await this.#storage.set(this.#buildStorageData());
        }
    }

    /** Discard the key material, persisted and in memory. */
    async erase() {
        this.#rootKeyPair = undefined;
        this.#rootKeyIdentifier = undefined;
        this.#rootCertBytes = undefined;
        this.#rootSubject = undefined;
        this.#icacProps = undefined;
        await this.#storage?.clearAll();
    }

    get rootCert(): Bytes {
        return this.#initializedRootCertBytes;
    }

    get icacCert(): Bytes | undefined {
        return this.#icacProps?.certBytes;
    }

    get config(): CertificateAuthority.Configuration {
        return this.#buildStorageData();
    }

    async issueNoc({
        publicKey,
        fabricId,
        nodeId,
        caseAuthenticatedTags,
    }: CertificateAuthority.Issuer.NocRequest): Promise<CertificateAuthority.Issuer.IssuedNoc> {
        const icac = this.icacCert;
        return { noc: await this.#signNoc(publicKey, fabricId, nodeId, caseAuthenticatedTags), icac };
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
        const keyIdentifier = Bytes.of(await this.#crypto.computeHash(keyPair.publicKey, "SHA-1"));

        const now = Time.now;
        const cert = new Icac({
            serialNumber: Bytes.fromHex(toHex(certId)),
            signatureAlgorithm: 1 /* EcdsaWithSHA256 */,
            publicKeyAlgorithm: 1 /* EC */,
            ellipticCurveIdentifier: 1 /* P256v1 */,
            issuer: this.#initializedRootSubject,
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
            subject: cert.cert.subject,
        };
    }

    async #signNoc(
        publicKey: Bytes,
        fabricId: FabricId,
        nodeId: NodeId,
        caseAuthenticatedTags?: readonly CaseAuthenticatedTag[],
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
                subjectKeyIdentifier: Bytes.of(await this.#crypto.computeHash(publicKey, "SHA-1")),
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

    /** The subject DN of the root is the issuer DN of the certificates the root signs. */
    #installRootCert(bytes: Bytes) {
        this.#rootCertBytes = bytes;
        this.#rootSubject = Rcac.fromTlv(bytes).cert.subject;
    }

    get #initializedRootSubject() {
        if (this.#rootSubject === undefined) {
            throw new InternalError("Root certificate is not installed");
        }
        return this.#rootSubject;
    }

    get #initializedRootCertBytes() {
        if (this.#rootCertBytes === undefined) {
            throw new InternalError("Root certificate is not installed");
        }
        return this.#rootCertBytes;
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
        this.#installRootCert(certValues.rootCertBytes as Bytes);
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
                subject: Icac.fromTlv(certValues.icacCertBytes as Bytes).cert.subject,
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

    #getSigningParameters() {
        if (this.#icacProps) {
            return {
                issuer: this.#icacProps.subject,
                signingKey: this.#icacProps.keyPair,
                authorityKeyId: this.#icacProps.keyIdentifier,
            };
        }

        return {
            issuer: this.#initializedRootSubject,
            signingKey: this.#initializedRootKeyPair,
            authorityKeyId: this.#initializedRootKeyIdentifier,
        };
    }
}

interface IcacProps {
    certId: bigint;
    keyPair: PrivateKey;
    keyIdentifier: Bytes;
    certBytes: Bytes;

    /** The issuer DN of the NOCs this ICAC signs. */
    subject: OperationalCertificate.Icac["subject"];
}
