/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ContextTagged,
    ContextTaggedBytes,
    DatatypeOverride,
    DerBitString,
    DerCodec,
    DerError,
    DerNodeDefinition,
    DerObject,
    DerSequenceDefinition,
    DerType,
    ObjectId,
    RawBytes,
} from "#codec/DerCodec.js";
import { ImplementationError } from "#MatterError.js";
import { Bytes } from "#util/Bytes.js";
import type { Crypto } from "./Crypto.js";
import { CertificateError } from "./CryptoError.js";
import { Key } from "./Key.js";
import { Pem } from "./Pem.js";
import { X962 } from "./X962.js";

export namespace X509 {
    /**
     * Sign a certificate.
     */
    export async function sign(crypto: Crypto, key: Key, cert: UnsignedCertificate): Promise<Certificate> {
        return {
            ...cert,
            signature: (await crypto.signEcdsa(key, certificateToDer(cert))).der,
        };
    }

    /**
     * Serialize a certificate to PEM.
     */
    export function certificateToPem(cert: Certificate | UnsignedCertificate) {
        return Pem.encode(certificateToDer(cert));
    }

    /**
     * Serialize a certificate to DER.
     */
    export function certificateToDer(cert: Certificate | UnsignedCertificate) {
        const { serialNumber, signatureAlgorithm, issuer, validity, subject, publicKey, extensions } = cert;

        const {
            basicConstraints: { isCa, pathLen },
        } = extensions;
        if (!isCa && pathLen !== undefined) {
            throw new CertificateError("Path length must be undefined for non-CA certificates.");
        }

        let ast: Record<string, DerNodeDefinition> = {
            version: ContextTagged(0, 2), // v3
            serialNumber: DatatypeOverride(DerType.Integer, serialNumber),
            signatureAlgorithm: signatureAlgorithm ?? X962.EcdsaWithSHA256,
            issuer,
            validity,
            subject,
            publicKeyInfo: publicKey,
            extensions: ContextTagged(3, extensionsToAst(extensions)),
        };

        if ("signature" in cert) {
            ast = {
                ast,
                signatureAlgorithm: cert.signatureAlgorithm,
                signature: DerBitString(cert.signature),
            };
        }

        return DerCodec.encode(ast);
    }

    export const KeyUsageFlags = [
        "digitalSignature",
        "nonRepudiation",
        "keyEncipherment",
        "dataEncipherment",
        "keyAgreement",
        "keyCertSign",
        "cRLSign",
        "encipherOnly",
        "decipherOnly",
    ] as const;

    export interface KeyUsage extends Partial<Record<(typeof KeyUsageFlags)[number], boolean>> {}

    export interface DistinguishedName extends Record<string, DerNodeDefinition> {}

    export interface Extension {
        basicConstraints: {
            isCa: boolean;
            pathLen?: number;
        };
        subjectKeyIdentifier: Bytes;
        keyUsage: KeyUsage;
        extendedKeyUsage?: number[];
        authorityKeyIdentifier: Bytes;
        futureExtension?: Bytes[];
    }

    export namespace Extension {
        export const BASIC_CONSTRAINTS = 0x551d13n;
        export const KEY_USAGE = 0x551d0fn;
        export const EXTENDED_KEY_USAGE = 0x551d25n;
        export const SUBJECT_KEY_IDENTIFIER = 0x551d0en;
        export const AUTHORITY_KEY_IDENTIFIER = 0x551d23n;
    }

    export interface ValidityWindow extends DerSequenceDefinition {
        notBefore: Date;
        notAfter: Date;
    }

    export interface EcPublicKey extends DerSequenceDefinition {
        type: {
            algorithm: ObjectId;
            curve: ObjectId;
        };
        bytes: DerBitString;
    }

    export interface UnsignedCertificate {
        serialNumber: Bytes;
        signatureAlgorithm: DerObject;
        issuer: DistinguishedName;
        validity: ValidityWindow;
        subject: DistinguishedName;
        publicKey: EcPublicKey;
        extensions: Extension;
    }

    export interface Certificate extends UnsignedCertificate {
        signature: Bytes;
    }

    export function SubjectKeyIdentifier(identifier: Bytes) {
        return DerObject(Extension.SUBJECT_KEY_IDENTIFIER, { value: DerCodec.encode(identifier) });
    }

    export function AuthorityKeyIdentifier(identifier: Bytes) {
        return DerObject(Extension.AUTHORITY_KEY_IDENTIFIER, {
            value: DerCodec.encode({ id: ContextTaggedBytes(0, identifier) }),
        });
    }

    export function BasicConstraints(constraints: any) {
        const toEncode = { ...constraints };
        if (toEncode?.isCa === false) {
            // This is the default value, so we can remove it per
            // https://datatracker.ietf.org/doc/html/rfc5280#appendix-B
            delete toEncode.isCa;
        }
        return DerObject(Extension.BASIC_CONSTRAINTS, { critical: true, value: DerCodec.encode(toEncode) });
    }

    export function ExtendedKeyUsage(values: number[] | undefined) {
        if (values === undefined) {
            return;
        }
        const data = {} as any;
        values.forEach(value => {
            switch (value) {
                case 1: // server Auth
                    data.serverAuth = ObjectId(ExtendedKeyUsage.SERVER_AUTH);
                    break;
                case 2: // client Auth
                    data.clientAuth = ObjectId(ExtendedKeyUsage.CLIENT_AUTH);
                    break;
                case 3: // Code Signing
                    data.codeSigning = ObjectId(ExtendedKeyUsage.CODE_SIGNING);
                    break;
                case 4: // Email Protection
                    data.emailProtection = ObjectId(ExtendedKeyUsage.EMAIL_PROTECTION);
                    break;
                case 5: // Time Stamping
                    data.timeStamping = ObjectId(ExtendedKeyUsage.TIME_STAMPING);
                    break;
                case 6: // OCSP Signing
                    data.ocspSigning = ObjectId(ExtendedKeyUsage.OCSP_SIGNING);
                    break;
                default:
                    throw new DerError(`Unsupported extended key usage value ${value}`);
            }
        });

        return DerObject(Extension.EXTENDED_KEY_USAGE, {
            critical: true,
            value: DerCodec.encode(data),
        });
    }

    export namespace ExtendedKeyUsage {
        export const SERVER_AUTH = 0x2b06010505070301n;
        export const CLIENT_AUTH = 0x2b06010505070302n;
        export const CODE_SIGNING = 0x2b06010505070303n;
        export const EMAIL_PROTECTION = 0x2b06010505070304n;
        export const TIME_STAMPING = 0x2b06010505070308n;
        export const OCSP_SIGNING = 0x2b06010505070309n;
    }

    export function KeyUsage(value: number | KeyUsage) {
        if (typeof value !== "number") {
            value = encodeKeyUsage(value);
        }

        return DerObject(Extension.KEY_USAGE, {
            critical: true,
            value: DerCodec.encode(DatatypeOverride(DerType.BitString, value)),
        });
    }
}

const ExtensionEncoders = {
    basicConstraints: X509.BasicConstraints,
    keyUsage: X509.KeyUsage,
    extendedKeyUsage: X509.ExtendedKeyUsage,
    subjectKeyIdentifier: X509.SubjectKeyIdentifier,
    authorityKeyIdentifier: X509.AuthorityKeyIdentifier,
    futureExtension: (future?: Bytes[]) => RawBytes(Bytes.concat(...(future ?? []))),
};

/**
 * Convert X509.Extension to DER input AST.
 */
function extensionsToAst(extensions: X509.Extension) {
    const ast: DerSequenceDefinition = {};

    for (const key in extensions) {
        const encoder = ExtensionEncoders[key as keyof X509.Extension];
        if (encoder === undefined) {
            throw new ImplementationError(`Unsupported X.509 certificate extension ${key}`);
        }

        ast[key] = encoder(extensions[key as keyof X509.Extension]);
    }

    return ast;
}
/**
 * Convert X509.KeyUsage to DER input AST.
 */
function encodeKeyUsage(flags: X509.KeyUsage) {
    let bit = 1;
    let encoded = 0;
    for (const flag of X509.KeyUsageFlags) {
        if (flags[flag]) {
            encoded |= bit;
        }
        bit <<= 1;
    }
    return encoded;
}
