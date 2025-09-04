/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Base64 } from "../codec/Base64Codec.js";
import { DerCodec, DerNode, DerType } from "../codec/DerCodec.js";
import { MatterError, NotImplementedError } from "../MatterError.js";
import { Bytes } from "../util/Bytes.js";
import { ec } from "./Crypto.js";
import { KeyInputError } from "./CryptoError.js";

const {
    numberToBytesBE,
    bytesToHex,
    p256: { getPublicKey, Point, getSharedSecret },
} = ec;

const JWK_KEYS = [
    "crv",
    "d",
    "dp",
    "dq",
    "e",
    "ext",
    "k",
    "key_ops",
    "kty",
    "n",
    "oth",
    "p",
    "q",
    "qi",
    "use",
    "x",
    "y",
];

export enum KeyType {
    EC = "EC",
    RSA = "RSA",
    oct = "oct",
}

export enum CurveType {
    p256 = "P-256",
    p384 = "P-384",
    p521 = "P-521",
}

enum Asn1ObjectID {
    ecPublicKey = "2a8648ce3d0201",
    prime256r1 = "2a8648ce3d030107",
    prime384r1 = "0103840022",
    prime521r1 = "0103840023",
}

const CurveLookup = {
    [Asn1ObjectID.prime256r1]: CurveType.p256,
    [Asn1ObjectID.prime384r1]: CurveType.p384,
    [Asn1ObjectID.prime521r1]: CurveType.p521,
};

export type BinaryKeyPair = {
    publicKey: Bytes;
    privateKey: Bytes;
};

/**
 * Represents a cryptographic key.
 *
 * Models keys as JWK.  Advantages of this format:
 *
 *   - Standard
 *   - Widely supported
 *   - Fully models relevant key types
 *   - Where not supported, extracting constituent parts for translation is trivial
 */
export interface Key extends JsonWebKey {
    /**
     * The key algorithm, alias for JWK "alg" field.
     */
    algorithm?: Key["alg"];

    /**
     * The elliptic curve type, alias for JWK "crv" field.
     */
    curve?: Key["crv"];

    /**
     * The key type, alias for JWK "kty" field.
     */
    type?: Key["kty"];

    /**
     * Operations supported by the key, alias for JWK "key_ops" field.
     */
    operations?: Key["key_ops"];

    /**
     * The private key, alias for JWK "d" field.
     */
    private?: Key["d"];

    /**
     * Indicates whether the private key is extractable, alias for JSK "ext"
     * field.
     */
    extractable?: Key["ext"];

    alg?: string;
    crv?: CurveType;
    d?: string;
    dp?: string;
    dq?: string;
    e?: string;
    ext?: boolean;
    k?: string;
    key_ops?: string[]; // Ideally KeyUsage but any value is legal
    kty?: KeyType;
    n?: string;
    oth?: RsaOtherPrimesInfo[];
    p?: string;
    q?: string;
    qi?: string;
    use?: string; // "sig" | "enc" are official values but any value is legal
    x?: string;
    y?: string;

    /**
     * Binary alias to private key field.  Automatically encodes/decodes the
     * base-64 private key.
     */
    privateBits?: Bytes;

    /**
     * Binary alias to the x field.  Automatically encodes/decodes the base-64
     * x-point on EC public keys.
     */
    xBits?: Bytes;

    /**
     * Binary alias to the y field.  Automatically encodes/decodes the base-64
     * y-point on EC public keys.
     */
    yBits?: Bytes;

    /**
     * Import (write-only) of private keys encoded in SEC1 format.
     */
    sec1?: Bytes;

    /**
     * Import (write-only) of private keys encoded in PKCS #8 format.
     */
    pkcs8?: Bytes;

    /**
     * Import (write-only) of public keys encoded in SPKI format.
     */
    spki?: Bytes;

    /**
     * Import/export of EC public key in SEC1/SPKI format.  Maps to x & y
     * fields internally.
     */
    publicBits?: Bytes;

    /**
     * Import/export of BinaryKeyPair structure used as an alternate
     * serialization format for legacy reasons.
     */
    keyPairBits?: BinaryKeyPair;

    /**
     * Alias for publicBits that throws if no public key is present.
     */
    publicKey: Bytes;

    /**
     * Alias for privateBits that throws if no private key is present.
     */
    privateKey: Bytes;

    /**
     * Alias for keyPairBits that throws if a complete key pair is not present.
     */
    keyPair: BinaryKeyPair;
}

/**
 * EC key without private fields.
 */
export interface PublicKey extends Key {
    type: KeyType.EC;
    curve: CurveType;
    x: string;
    y: string;
    xBits: Bytes;
    yBits: Bytes;
    publicBits: Bytes;
}

/**
 * EC key with extractable private fields.
 */
export interface PrivateKey extends PublicKey {
    private: string;
    d: string;
    privateBits: Bytes;
    privateKey: Bytes;
    keyPair: BinaryKeyPair;
    keyPairBits: BinaryKeyPair;
}

/**
 * Symmetric key.
 */
export interface SymmetricKey extends Key {
    type: KeyType.oct;
    private: string;
    d: string;
}

function checkDerVersion(type: string, node: DerNode | undefined, version: number) {
    const derVersion =
        node &&
        node._tag === DerType.Integer &&
        node._bytes &&
        node._bytes.byteLength === 1 &&
        Bytes.of(node._bytes)[0];

    if (derVersion !== version) {
        throw new KeyInputError(`${type} key version mismatch`);
    }
}

function getDerObjectID(type: string, node?: DerNode) {
    const id = node && node._tag === DerType.ObjectIdentifier && node._bytes?.byteLength > 1 && node._bytes;

    if (id) return id;

    throw new KeyInputError(`Missing object in ${type} key`);
}

function getDerCurve(type: string, node?: DerNode) {
    const oid = getDerObjectID(type, node);
    const curve = (<any>CurveLookup)[Bytes.toHex(oid)];
    if (curve) return curve;
    throw new KeyInputError(`Unsupported ${type} EC curve`);
}

function getDerKey(type: string, node?: DerNode, derType: DerType = DerType.OctetString) {
    const key = node && node._tag === derType && node._bytes?.byteLength > 1 && node._bytes;

    if (key) return key;

    throw new MatterError(`Missing ${type} key node`);
}

// These are private members of Key, each implementing a key import field
namespace Translators {
    // Import SEC1 private key
    export const sec1 = {
        set: function (this: Key, input: Bytes) {
            const decoded = DerCodec.decode(input);

            // Version
            const versionNode = decoded?._elements?.[0];
            checkDerVersion("SEC 1", versionNode, 1);

            // Curve
            const curveNode = decoded?._elements?.[2]?._elements?.[0];
            const curve = getDerCurve("SEC 1", curveNode);

            // Key
            const keyNode = decoded?._elements?.[1];
            const key = getDerKey("SEC 1", keyNode);

            this.type = KeyType.EC;
            this.curve = curve;
            this.privateBits = key;
        },

        get: function () {
            throw new NotImplementedError("SEC1 export not implemented");
        },
    };

    // Import PKCS8 private key
    export const pkcs8 = {
        set: function (this: Key, input: Bytes) {
            const outer = DerCodec.decode(input);

            // Version
            const version = outer?._elements?.[0];
            checkDerVersion("PKCS #8", version, 0);

            // Algorithm
            const algorithmElements = outer?._elements?.[1]?._elements;
            const algorithm = getDerObjectID("PKCS #8", algorithmElements?.[0]);
            if (Bytes.toHex(algorithm) !== Asn1ObjectID.ecPublicKey) {
                throw new KeyInputError("Unsupported PKCS #8 decryption algorithm");
            }

            // Curve
            const curve = getDerCurve("PKCS #8", algorithmElements?.[1]);

            // Private key
            const innerBytes = outer?._elements?.[2]._bytes;
            if (innerBytes === undefined || innerBytes === null) {
                throw new KeyInputError("Invalid PKCS #8 key");
            }
            const inner = DerCodec.decode(innerBytes);
            const key = getDerKey("PKCS #8", inner?._elements?.[1]);

            this.type = KeyType.EC;
            this.curve = curve;
            this.privateBits = key;
        },

        get: function () {
            throw new NotImplementedError("PKCS #8 export not implemented");
        },
    };

    // Import SPKI public key
    export const spki = {
        set: function (this: Key, input: Bytes) {
            const decoded = DerCodec.decode(input);

            const algorithmElements = decoded?._elements?.[0]?._elements;

            // Algorithm
            const algorithm = getDerObjectID("SPKI", algorithmElements?.[0]);
            if (Bytes.toHex(algorithm) !== Asn1ObjectID.ecPublicKey) {
                throw new KeyInputError("Unsupported SPKI decryption algorithm");
            }

            // Curve
            const curve = getDerCurve("SPKI", algorithmElements?.[1]);

            // Key
            const key = getDerKey("SPKI", decoded?._elements?.[1], DerType.BitString);

            this.type = KeyType.EC;
            this.curve = curve;
            this.publicBits = key;
        },

        get: function () {
            throw new NotImplementedError("SPKI export not implemented");
        },
    };

    // Import public key bytes in SEC1/SPKI format
    export const publicBits = {
        set: function (this: Key, input: Bytes) {
            const data = Bytes.of(input);
            if (!(data.length % 2)) {
                throw new KeyInputError("Invalid public key encoding");
            }

            switch (data[0]) {
                case 2:
                case 3:
                    throw new KeyInputError("Unsupported public key compression");

                case 4:
                    break;

                case 5:
                    throw new KeyInputError("Illegal public key format specifier");
            }

            const coordinateLength = (data.length - 1) / 2;

            inferCurve(this, coordinateLength);

            this.type = KeyType.EC;
            this.xBits = data.slice(1, coordinateLength + 1);
            this.yBits = data.slice(coordinateLength + 1);
        },

        get: function (this: Key) {
            if (this.xBits === undefined || this.yBits === undefined) {
                return undefined;
            }

            return Bytes.concat(new Uint8Array([0x04]), this.xBits, this.yBits);
        },
    };

    // Import/export from BinaryKeyPair
    export const keyPairBits = {
        set: function (this: Key, keyPair: BinaryKeyPair) {
            this.publicBits = keyPair.publicKey;
            this.privateBits = keyPair.privateKey;
        },

        get: function (this: Key): BinaryKeyPair | undefined {
            const publicBits = this.publicBits;
            const privateBits = this.privateBits;
            if (publicBits === undefined || privateBits === undefined) {
                return;
            }
            return {
                publicKey: Bytes.of(publicBits),
                privateKey: Bytes.of(privateBits),
            };
        },
    };
}

enum Aliases {
    algorithm = "alg",
    curve = "crv",
    type = "kty",
    operations = "key_ops",
    private = "d",
    extractable = "ext",
}

enum Base64Codecs {
    privateBits = "d",
    xBits = "x",
    yBits = "y",
}

enum AssertedAliases {
    publicKey = "publicBits",
    privateKey = "privateBits",
    keyPair = "keyPairBits",
}

function inferCurve(key: Key, bytes: number) {
    if (!key.curve) {
        // Guess curve based on key length
        switch (bytes) {
            case 66:
                key.curve = CurveType.p521;
                break;

            case 48:
                key.curve = CurveType.p384;
                break;

            case 32:
                key.curve = CurveType.p256;
                break;

            default:
                throw new KeyInputError(`Cannot infer named curve from key length ${bytes}`);
        }
    }
}

/**
 * Generic key factory.
 */
export function Key(properties: Partial<Key>) {
    const that = {} as Key;

    // Assign base JWK properties.  All other properties are some form of alias
    for (const key of JWK_KEYS) {
        if ((properties as any)[key] !== undefined) (that as any)[key] = (properties as any)[key];
    }
    function assign(name: string) {
        const d = Object.getOwnPropertyDescriptor(properties, name);
        if (d && d.value !== undefined) {
            (that as any)[name] = d.value;
        }
    }

    // We implement the following in reverse-priority order

    // Aliases map a readable name to the cryptic JWK equivalent
    Object.entries(Aliases).forEach(([alias, target]) => {
        Object.defineProperty(that, alias, {
            get: () => that[target],
            set: value => (that[target] = value),
        });
        assign(alias);
    });

    // Codecs allow for binary read/write on base-64 fields
    Object.entries(Base64Codecs).forEach(([alias, target]) => {
        Object.defineProperty(that, alias, {
            get: () => that[target] !== undefined && Base64.decode(that[target]),
            set: value => (that[target] = value === undefined ? undefined : Base64.encode(value, true)),
        });
        assign(alias);
    });

    // Importers translate external formats
    Object.entries(Translators).forEach(([name, translator]) => {
        Object.defineProperty(that, name, translator as any);
    });

    // Import invocation after all initializations due to dependencies
    Object.keys(Translators).forEach(name => assign(name));

    // Asserted aliases
    Object.entries(AssertedAliases).forEach(([alias, target]) => {
        Object.defineProperty(that, alias, {
            get: () => {
                const result = that[target];
                if (result === undefined) {
                    throw new KeyInputError(`Key field ${target} is not defined`);
                }
                return result;
            },

            set: (value: any) => {
                that[target] = value;
            },
        });

        assign(alias);
    });

    /** Compute public point from private EC key */
    function derivePublicFromPrivate() {
        if (that.type !== KeyType.EC) throw new KeyInputError("EC key type required to compute public point");
        if (!that.private) throw new KeyInputError("EC private key required to compute public point");

        const crv = that.crv;
        let keyLength: number;

        switch (crv) {
            case CurveType.p256:
                keyLength = 32;
                // We can add the other point types easily by exposing more from @noble/curves
                // case CurveType.p384:
                // case CurveType.p521:
                break;

            default:
                throw new KeyInputError(`Unsupported elliptic curve ${crv}`);
        }

        // Compute
        const pubKeyBytes = getPublicKey(Bytes.of(that.privateKey));
        const ecKey = Point.fromHex(bytesToHex(pubKeyBytes));

        // Install
        that.xBits = numberToBytesBE(ecKey.x, keyLength);
        that.yBits = numberToBytesBE(ecKey.y, keyLength);
    }

    if (that.type === KeyType.EC) {
        if (that.d) {
            inferCurve(that, that.privateKey.byteLength);
        } else if (that.xBits) {
            inferCurve(that, that.xBits.byteLength);
        }

        if (that.d && (!that.x || !that.y)) {
            derivePublicFromPrivate();
        }
    }

    return that;
}

/**
 * EC private key factory.
 */
export function PrivateKey(privateKey: Bytes | BinaryKeyPair, options?: Partial<Key>) {
    let priv, pub;
    if (Bytes.isBytes(privateKey)) {
        priv = privateKey;
    } else {
        priv = privateKey.privateKey;
        pub = privateKey.publicKey;
    }
    return Key({
        type: KeyType.EC,
        privateKey: priv,
        publicKey: pub,
        ...options,
    } as Key) as PrivateKey;
}

/**
 * EC public key factory.
 */
export function PublicKey(publicKey: Bytes, options?: Partial<Key>) {
    return Key({
        type: KeyType.EC,
        publicKey,
        ...options,
    }) as PublicKey;
}

/**
 * Symmetric key factory.
 */
export function SymmetricKey(privateKey: Bytes, options?: Partial<Key>) {
    return Key({
        type: KeyType.oct,
        privateKey: privateKey,
        ...options,
    });
}

export namespace Key {
    /**
     * Diffie-Hellman shared secret computation.
     *
     * We provide this for platforms without a native implementation.
     */
    export function sharedSecretFor(key: PrivateKey, peerKey: PublicKey): Bytes {
        // We need to cut the first byte because response is 33bytes, and we need 32bytes
        // https://github.com/paulmillr/noble-curves/discussions/114#discussioncomment-8609063
        return Bytes.of(getSharedSecret(Bytes.of(key.privateBits), Bytes.of(peerKey.publicBits))).slice(1, 33);
    }
}
