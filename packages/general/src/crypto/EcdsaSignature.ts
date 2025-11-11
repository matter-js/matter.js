/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DerCodec, DerError, DerRawUint } from "#codec/DerCodec.js";
import { Bytes } from "#util/Bytes.js";
import { SignatureEncodingError } from "./CryptoError.js";

/**
 * An ECDSA signature.
 *
 * Input and output may be IEEE-P1363 or DER encoded.  Matter helpfully mixes and matches so we validate input to ensure
 * the correct encoding is specified.  Extraction to bytes must explicitly use {@link bytes} or {@link der} to specify
 * the desired format.
 *
 * Currently we only support 256-bit curves.
 */
export class EcdsaSignature {
    #bytes: Bytes;

    constructor(bytes: Bytes, encoding = "ieee-p1363") {
        if (encoding === "der") {
            try {
                const decoded = DerCodec.decode(bytes);

                const r = DerCodec.decodeBigUint(decoded?._elements?.[0], 32);
                const s = DerCodec.decodeBigUint(decoded?._elements?.[1], 32);

                this.#bytes = Bytes.concat(r, s);
            } catch (cause) {
                DerError.accept(cause);

                throw new SignatureEncodingError("Could not decode DER signature", { cause });
            }
        } else {
            // Change this if/when we support more curves
            if (bytes.byteLength !== 64) {
                throw new SignatureEncodingError("Invalid IEEE P1364 signature length");
            }
            this.#bytes = bytes;
        }
    }

    /**
     * Access signature in IEEE P1363 format.
     */
    get bytes() {
        return this.#bytes;
    }

    /**
     * Access signature in DER format.
     */
    get der() {
        const bytes = Bytes.of(this.#bytes);
        const bytesPerComponent = bytes.length / 2;

        return DerCodec.encode({
            r: DerRawUint(bytes.slice(0, bytesPerComponent)),
            s: DerRawUint(bytes.slice(bytesPerComponent)),
        });
    }
}

export namespace EcdsaSignature {
    /**
     * IEEE P1363 encoding.
     *
     * This is a simple concatenation of the raw R and S elements
     */
    export const IEEE_P1363 = "ieee-p1363";

    /**
     * DER encoding.
     *
     * This encodes R and S elements in a sequence of separate integers.
     */
    export const DER = "der";

    export type Encoding = typeof IEEE_P1363 | typeof DER;
}
