/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Base64 } from "#codec/Base64Codec.js";
import { DerCodec } from "#codec/DerCodec.js";
import { Bytes } from "#util/Bytes.js";
import { CertificateError } from "./CryptoError.js";

export type PemOrDer = Bytes | string;

/**
 * PEM encoding semantics per RFC 7468.
 */
export namespace Pem {
    export function encode(der: {} | Bytes, kind = "CERTIFICATE") {
        kind = kind.toUpperCase();

        let bytes: Bytes;
        if (Bytes.isBytes(der)) {
            bytes = der;
        } else {
            bytes = DerCodec.encode(der);
        }

        const body = Base64.encode(Bytes.of(bytes))
            .match(/.{1,64}/g)!
            .join("\n");

        return `-----BEGIN ${kind}-----\n${body}\n-----END ${kind}-----`;
    }

    export function asDer(pemOrDer: PemOrDer) {
        if (Bytes.isBytes(pemOrDer)) {
            if (Bytes.of(pemOrDer)[0] === "-".charCodeAt(0)) {
                pemOrDer = new TextDecoder().decode(pemOrDer);
            } else {
                return pemOrDer;
            }
        }

        const lines = pemOrDer.split("\n");
        let startPos = 0;
        while (startPos < lines.length && !lines[startPos].startsWith("-----BEGIN ")) {
            startPos++;
        }
        if (startPos >= lines.length) {
            throw new CertificateError("No BEGIN line in PEM file");
        }

        let endPos = startPos + 1;
        while (endPos < lines.length && !lines[endPos].startsWith("-----END ")) {
            endPos++;
        }
        if (endPos >= lines.length) {
            throw new CertificateError("No END line in PEM file");
        }

        const base64 = lines
            .slice(startPos + 1, endPos)
            .join("")
            .replace(/\s/g, "");

        try {
            return Base64.decode(base64);
        } catch (cause) {
            const error = new CertificateError(`Error in PEM base64 encoding`);
            error.cause = cause;
            throw error;
        }
    }

    export function decode(pemOrDer: PemOrDer) {
        const bytes = asDer(pemOrDer);

        try {
            return DerCodec.decode(bytes);
        } catch (cause) {
            const error = new CertificateError(`Error in PEM DER encoding`);
            error.cause = cause;
            throw error;
        }
    }
}
