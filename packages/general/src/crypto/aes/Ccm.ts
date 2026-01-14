/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * NIST: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38c.pdf
 *
 * SJCL: https://github.com/bitwiseshiftleft/sjcl/blob/master/core/ccm.js
 *
 * OpenSSL: https://github.com/openssl/openssl/blob/master/crypto/modes/ccm128.c
 */

import { CRYPTO_AEAD_MIC_LENGTH_BYTES, CRYPTO_AEAD_NONCE_LENGTH_BYTES } from "#crypto/CryptoConstants.js";
import { CryptoInputError } from "#crypto/CryptoError.js";
import { Bytes } from "#util/Bytes.js";
import { Aes } from "./Aes.js";
import { WordArray } from "./WordArray.js";

/**
 * WARNING: Unaudited.  Consider platform replacement if available.
 *
 * This AES-CCM implementation is tailored for Matter:
 *
 * * Only supports 2-byte length
 *
 * * Only supports 13-byte nonce
 *
 * * Stores the MIC in the ciphertext buffer following the ciphertext
 *
 * * Our AES implementation supports multiple key sizes but only 16 bytes are legal
 *
 * We take a few approaches to improve performance:
 *
 * * Uses singletons for temporary working buffers to avoid GC
 *
 * * Uses Uint8Array, Int32Array and DataView depending on which is most efficient while addressing platform byte order
 *
 * * Performs data conversion one block at a time rather than converting entire input/output buffer
 *
 * * Functions are monomorphic and should JIT well
 *
 * Implementation notes:
 *
 * * Data operations operate on 128-bit blocks, either as bytes or as 4 32-bit words in platform byte order.  We share
 *   underlying memory for both formats, but on little-endian platforms they are not directly interchangeable without a
 *   round-trip through a DataView
 *
 * * We encode words as a signed Int32Array because JS bit operations operate on signed 32-bit integers and a
 *   Uint32Array would require manually casting from signed to unsigned
 *
 * * Use of singleton buffers require this code to be synchronous.  If that were to change we would need to convert to a
 *   buffer pool
 *
 * * Some functions only modify singleton buffers and thus do not directly return a value
 *
 * * We use {@link DataView} to read/write words where possible.  However, byte buffers may not align to word
 *   boundaries.  We detect this case and manually read/write the last word
 */
export function Ccm(key: Bytes) {
    const aes = Aes(key);

    return {
        encrypt(input: Ccm.EncryptInput): Bytes {
            validateNonceAndAdata(input);

            const ptLength = input.pt.length;
            if (ptLength > MAX_PLAINTEXT_LENGTH) {
                throw new CryptoInputError(
                    `Cannot encrypt plaintext exceeding maximum length of ${MAX_PLAINTEXT_LENGTH}`,
                );
            }

            // Create view for loading plaintext words in platform byte order
            const ptView = new DataView(input.pt.buffer);

            // Allocate ciphertext output buffer
            const ct = new Uint8Array(ptLength + CRYPTO_AEAD_MIC_LENGTH_BYTES);
            const ctView = new DataView(ct.buffer);

            // Compute MIC using CBC-MAC
            cbcMac(input, ptView, ptLength);

            // Encrypt using CTR mode
            ctr(input, ptView, ctView, ptLength, computedMic);

            for (let i = 0; i < computedMic.words.length; i++) {
                ctView.setInt32(input.pt.length + i * 4, computedMic.words[i]);
            }

            return ct;
        },

        decrypt(input: Ccm.DecryptInput): Bytes {
            validateNonceAndAdata(input);

            if (input.ct.length > MAX_CIPHERTEXT_LENGTH) {
                throw new CryptoInputError(
                    `Cannot decrypt ciphertext longer than maximum length of ${MAX_CIPHERTEXT_LENGTH}`,
                );
            }

            const ptLength = input.ct.length - CRYPTO_AEAD_MIC_LENGTH_BYTES;

            if (ptLength < 0) {
                throw new CryptoInputError(
                    `Cannot decrypt ciphertext shorter than minimum length of ${CRYPTO_AEAD_MIC_LENGTH_BYTES}`,
                );
            }

            // Extract ciphertext (zero copy using a DataView) and MIC from input ciphertext
            const ctView = new DataView(input.ct.buffer, input.ct.byteOffset, ptLength);
            WordArray.bytesToBlock(
                new DataView(input.ct.buffer, input.ct.byteOffset, input.ct.byteLength),
                inputMic.words,
                ptLength,
            );

            // Allocate plaintext output buffer
            const pt = new Uint8Array(ptLength);
            const ptView = new DataView(pt.buffer);

            // Decrypt using CTR mode
            ctr(input, ctView, ptView, ptLength, inputMic);

            // Compute MIC using CBC-MAC
            cbcMac(input, ptView, ptLength);

            for (let i = 0; i < computedMic.words.length; i++) {
                if (inputMic.words[i] !== computedMic.words[i]) {
                    throw new CryptoInputError("Message authentication failed due to invalid signature");
                }
            }

            return pt;
        },
    };

    /**
     * CBC-MAC MIC computation.
     *
     * This includes header generation then CBC-MAC passes on the header, adata and plaintext.
     *
     * Writes to {@link computedMic}.
     */
    function cbcMac(input: Ccm.Input, pt: DataView, ptLength: number) {
        const adataLength = input.adata?.length;

        // Create the header; first add the flag byte and nonce
        computedMic.bytes[0] =
            (adataLength ? 1 << 6 : 0) | ((CRYPTO_AEAD_MIC_LENGTH_BYTES - 2) << 2) | (BYTES_IN_LENGTH - 1);
        computedMic.bytes.set(input.nonce, 1);

        // Convert header to platform byte order
        WordArray.bytesToBlock(computedMic.view, computedMic.words); // Convert to platform byte order

        // Add plaintext length (must occur after conversion to platform byte order)
        computedMic.words[3] = (computedMic.words[3] & 0xffff0000) | ptLength;

        // Start computation
        aes.encrypt(computedMic.words);

        // Add adata
        if (adataLength) {
            // Add length (2 bytes) + first 14 bytes of adata
            tempBlock1.view.setInt16(0, input.adata!.length);
            for (let i = 0; i < 14; i++) {
                tempBlock1.bytes[i + 2] = i < adataLength ? input.adata![i] : 0;
            }

            // Flip to platform byte order and add
            WordArray.bytesToBlock(tempBlock1.view, tempBlock1.words);
            add();

            // Add remainder of adata
            if (adataLength > 14) {
                const adataView = new DataView(input.adata!.buffer);
                for (let i = 14; i < adataLength; i += 16) {
                    WordArray.bytesToBlock(adataView, tempBlock1.words, i);
                    add();
                }
            }
        }

        // Add plaintext
        if (ptLength) {
            for (let i = 0; i < ptLength; i += 16) {
                WordArray.bytesToBlock(pt, tempBlock1.words, i);
                add();
            }
        }

        function add() {
            computedMic.words[0] ^= tempBlock1.words[0];
            computedMic.words[1] ^= tempBlock1.words[1];
            computedMic.words[2] ^= tempBlock1.words[2];
            computedMic.words[3] ^= tempBlock1.words[3];
            aes.encrypt(computedMic.words);
        }
    }

    /**
     * A CTR mode implementation specialized for CCM.
     *
     * Used both for encryption and decryption.
     *
     * Encrypts/decrypts {@link ptLength} bytes of {@link input} into {@link output}.  Also encrypts/decrypts
     * {@link mic} in place.
     */
    function ctr(input: Ccm.Input, from: DataView, to: DataView, ptLength: number, mic: SingletonBuffer) {
        // Initialize the counter (big endian)
        tempBlock1.bytes[0] = BYTES_IN_LENGTH - 1;
        tempBlock1.bytes.set(input.nonce, 1); // Bytes 1 - 13
        tempBlock1.bytes[14] = 0;
        tempBlock1.bytes[15] = 0;

        // Change to platform byte order for CTR computation
        WordArray.bytesToBlock(tempBlock1.view, ctrBlock.words);

        // Encrypt the MIC
        aes.encrypt(ctrBlock.words, tempBlock1.words);
        mic.words[0] ^= tempBlock1.words[0];
        mic.words[1] ^= tempBlock1.words[1];
        mic.words[2] ^= tempBlock1.words[2];
        mic.words[3] ^= tempBlock1.words[3];

        // Process the data
        for (let i = 0; i < ptLength; ) {
            ctrBlock.words[3]++;

            // Convert input block to platform-endian words
            WordArray.bytesToBlock(from, tempBlock1.words, i);

            // Encrypt CTR
            aes.encrypt(ctrBlock.words, tempBlock2.words);

            // Copy block to output buffer
            for (let j = 0; j < 4 && i < ptLength; j++, i += 4) {
                const tempWord = tempBlock2.words[j];
                if (i + 4 < ptLength) {
                    // Full word
                    to.setInt32(i, from.getInt32(i) ^ tempWord);
                } else {
                    // Partial word
                    const partial = WordArray.readPartialWord(from, i, ptLength - i) ^ tempWord;
                    WordArray.writePartialWord(partial, to, i, ptLength - i);
                }
            }
        }
    }
}

export namespace Ccm {
    export interface Input {
        nonce: Uint8Array;
        adata: Uint8Array | undefined; // Do not use ? to ensure object shape remains stable
    }

    export interface EncryptInput extends Input {
        /**
         * Plaintext
         */
        pt: Uint8Array;
    }

    export interface DecryptInput extends Input {
        /**
         * Ciphertext + tag
         */
        ct: Uint8Array;
    }
}

export const BYTES_IN_LENGTH = 2; // NIST q parameter, length of payload length; only 2 bytes supported by Matter
export const MAX_CIPHERTEXT_LENGTH = Math.pow(2, BYTES_IN_LENGTH * 8);
export const MAX_PLAINTEXT_LENGTH = MAX_CIPHERTEXT_LENGTH - CRYPTO_AEAD_MIC_LENGTH_BYTES;

/**
 * A buffer used for encryption.
 *
 * We encrypt/decrypt synchronously, so it is safe to use singletons to avoid GC hit.
 */
class SingletonBuffer {
    #words?: Int32Array;
    #bytes?: Uint8Array;
    #view?: DataView;

    get words() {
        if (this.#words === undefined) {
            this.#words = new Int32Array(4);
        }
        return this.#words;
    }

    get bytes() {
        if (this.#bytes === undefined) {
            this.#bytes = new Uint8Array(this.words.buffer);
        }
        return this.#bytes;
    }

    /**
     * The word and byte views of the buffer above are insufficient because we must account for platform endianness.  So
     * we also make a DataView available.
     */
    get view() {
        if (this.#view === undefined) {
            this.#view = new DataView(this.words.buffer);
        }
        return this.#view;
    }
}

/**
 * The "MIC" is the 16-byte authentication tag, called the "MAC" in the NIST spec and "tag" in SJCL.  We store
 * concatenated to the end of the ciphertext as required by Matter.
 *
 * This buffer is for the MIC we compute from the input plaintext.
 */
const computedMic = new SingletonBuffer();

/**
 * This buffer is for the MIC we receive as input on decryption.
 */
const inputMic = new SingletonBuffer();

/**
 * CTR block buffer.
 */
const ctrBlock = new SingletonBuffer();

/**
 * General-purpose block buffer.
 */
const tempBlock1 = new SingletonBuffer();

/**
 * General-purpose block buffer.
 */
const tempBlock2 = new SingletonBuffer();

function validateNonceAndAdata(input: Ccm.Input) {
    if (input.nonce.length !== CRYPTO_AEAD_NONCE_LENGTH_BYTES) {
        throw new CryptoInputError("Nonce must be 13 bytes");
    }

    if (input.adata && input.adata.length > 0xffff) {
        throw new CryptoInputError(`Associated adata exceeds maximum length of ${MAX_PLAINTEXT_LENGTH}`);
    }
}
