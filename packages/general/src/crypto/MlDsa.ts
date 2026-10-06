/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DerBitString, DerCodec, DerNode, DerObject, DerSequenceDefinition, DerType } from "#codec/DerCodec.js";
import { Bytes } from "#util/Bytes.js";
import type { MaybePromise } from "#util/Promises.js";
import { KeyInputError, SignatureEncodingError } from "./CryptoError.js";

/**
 * ML-DSA (FIPS 204) parameters and encodings.
 *
 * Matter PQC Phase 1 permits ML-DSA-44 and ML-DSA-65 for PAA and PAI certificates.
 *
 * @see {@link https://csrc.nist.gov/pubs/fips/204/final FIPS 204}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9881 RFC 9881} for the X.509 algorithm identifiers and key encodings
 */
export namespace MlDsa {
    export type ParameterSet = "ML-DSA-44" | "ML-DSA-65";

    export interface Parameters {
        /** DER content bytes of the RFC 9881 algorithm OID, as hex. */
        readonly oid: string;
        readonly publicKeyLength: number;
        readonly signatureLength: number;
    }

    export const PARAMETERS: Readonly<Record<ParameterSet, Parameters>> = {
        // id-ml-dsa-44, 2.16.840.1.101.3.4.3.17
        "ML-DSA-44": { oid: "608648016503040311", publicKeyLength: 1312, signatureLength: 2420 },
        // id-ml-dsa-65, 2.16.840.1.101.3.4.3.18
        "ML-DSA-65": { oid: "608648016503040312", publicKeyLength: 1952, signatureLength: 3309 },
    };

    /** Length of the key generation seed ξ (FIPS 204 Algorithm 1), which RFC 9881 uses as the private key. */
    export const SEED_LENGTH = 32;

    /**
     * An ML-DSA private key in seed form, with its public key.
     *
     * The seed is the RFC 9881 "seed" private key format; every backend expands the full signing key from it.
     */
    export interface PrivateKey {
        readonly parameterSet: ParameterSet;
        readonly seed: Bytes;
        readonly publicKey: Bytes;
    }

    /** Distinguish an ML-DSA private key from the JWK of an EC key. */
    export function isPrivateKey(key: PrivateKey | JsonWebKey): key is PrivateKey {
        return "parameterSet" in key && "seed" in key;
    }

    // Only the OIDs above may resolve, which an object literal cannot promise: it answers for Object.prototype too
    const parameterSetsByOid = new Map<string, ParameterSet>([
        [PARAMETERS["ML-DSA-44"].oid, "ML-DSA-44"],
        [PARAMETERS["ML-DSA-65"].oid, "ML-DSA-65"],
    ]);

    /** Resolve the parameter set identified by an algorithm OID, or undefined if the OID is not ML-DSA-44 or -65. */
    export function parameterSetForOid(oid: Bytes): ParameterSet | undefined {
        return parameterSetsByOid.get(Bytes.toHex(oid));
    }

    /**
     * The AlgorithmIdentifier for a certificate's signature algorithm or public key algorithm.
     *
     * RFC 9881 §2 requires the parameters field to be absent.
     */
    export function AlgorithmIdentifier(parameterSet: ParameterSet) {
        return DerObject(PARAMETERS[parameterSet].oid);
    }

    /** SubjectPublicKeyInfo of an ML-DSA key, as a DER definition. */
    export interface PublicKeyInfo extends DerSequenceDefinition {
        algorithm: DerObject;
        publicKey: DerBitString;
    }

    /** The SubjectPublicKeyInfo definition for a raw ML-DSA public key, for DER encoding. */
    export function SubjectPublicKeyInfo(parameterSet: ParameterSet, publicKey: Bytes): PublicKeyInfo {
        assertPublicKey(parameterSet, publicKey);
        return {
            algorithm: AlgorithmIdentifier(parameterSet),
            publicKey: DerBitString(publicKey),
        };
    }

    /** Encode a raw ML-DSA public key as SubjectPublicKeyInfo DER. */
    export function encodeSubjectPublicKeyInfo(parameterSet: ParameterSet, publicKey: Bytes) {
        return DerCodec.encode(SubjectPublicKeyInfo(parameterSet, publicKey));
    }

    /**
     * Decode SubjectPublicKeyInfo DER that carries an ML-DSA-44 or ML-DSA-65 public key.
     *
     * Accepts only the canonical RFC 9881 encoding and throws {@link KeyInputError} for anything else.
     */
    export function decodeSubjectPublicKeyInfo(spki: Bytes): { parameterSet: ParameterSet; publicKey: Bytes } {
        let root: DerNode;
        try {
            root = DerCodec.decode(spki);
        } catch (cause) {
            throw new KeyInputError("Invalid SubjectPublicKeyInfo DER", { cause });
        }

        const oid = root._elements?.[0]?._elements?.[0];
        const parameterSet = oid?._tag === DerType.ObjectIdentifier ? parameterSetForOid(oid._bytes) : undefined;
        if (parameterSet === undefined) {
            throw new KeyInputError("SubjectPublicKeyInfo algorithm is not ML-DSA-44 or ML-DSA-65");
        }

        const publicKey = Bytes.of(root._elements?.[1]?._bytes ?? new Uint8Array());
        assertPublicKey(parameterSet, publicKey);

        // One comparison rejects parameters, foreign tags, BIT STRING padding and trailing data alike
        if (!Bytes.areEqual(encodeSubjectPublicKeyInfo(parameterSet, publicKey), spki)) {
            throw new KeyInputError(`${parameterSet} SubjectPublicKeyInfo is not in canonical RFC 9881 encoding`);
        }

        return { parameterSet, publicKey };
    }

    export function assertPublicKey(parameterSet: ParameterSet, publicKey: Bytes) {
        const expected = PARAMETERS[parameterSet].publicKeyLength;
        if (publicKey.byteLength !== expected) {
            throw new KeyInputError(
                `${parameterSet} public key must be ${expected} bytes, got ${publicKey.byteLength}`,
            );
        }
    }

    export function assertSignature(parameterSet: ParameterSet, signature: Bytes) {
        const expected = PARAMETERS[parameterSet].signatureLength;
        if (signature.byteLength !== expected) {
            throw new SignatureEncodingError(
                `${parameterSet} signature must be ${expected} bytes, got ${signature.byteLength}`,
            );
        }
    }

    export function assertPrivateKey(key: PrivateKey) {
        if (key.seed.byteLength !== SEED_LENGTH) {
            throw new KeyInputError(
                `${key.parameterSet} private key seed must be ${SEED_LENGTH} bytes, got ${key.seed.byteLength}`,
            );
        }
        assertPublicKey(key.parameterSet, key.publicKey);
    }

    /**
     * The raw ML-DSA primitive of one crypto backend.
     *
     * {@link Crypto} validates inputs and maps errors around it, so an implementation needs to do neither.
     */
    export interface Implementation {
        /** Expand the public key from a seed (FIPS 204 Algorithm 6). */
        publicKeyOf(parameterSet: ParameterSet, seed: Bytes): MaybePromise<Bytes>;

        /**
         * Sign with an empty context.
         *
         * @param entropy randomness for hedged signing, which an implementation with its own source may ignore
         */
        sign(privateKey: PrivateKey, message: Bytes, entropy: Bytes): MaybePromise<Bytes>;

        /** Verify with an empty context; false for any signature that does not verify. */
        verify(parameterSet: ParameterSet, publicKey: Bytes, message: Bytes, signature: Bytes): MaybePromise<boolean>;
    }
}
