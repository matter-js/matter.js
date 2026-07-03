/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, MatterError } from "@matter/general";

export type CoapType = "CON" | "NON" | "ACK" | "RST";

export interface CoapMessage {
    type: CoapType;
    code: string;
    messageId: number;
    token: Uint8Array;
    uriPath?: string[];
    payload: Uint8Array;
}

/** Thrown when a CoAP datagram cannot be decoded per RFC 7252 §3. */
export class CoapError extends MatterError {}

const VERSION = 1;
const OPTION_URI_PATH = 11;
const PAYLOAD_MARKER = 0xff;

const TYPE_TO_BITS: Record<CoapType, number> = { CON: 0, NON: 1, ACK: 2, RST: 3 };
const BITS_TO_TYPE: readonly CoapType[] = ["CON", "NON", "ACK", "RST"];

function encodeCode(code: string): number {
    const match = /^(\d)\.(\d{2})$/.exec(code);
    if (match === null) {
        throw new CoapError(`Invalid CoAP code "${code}"`);
    }
    const cls = Number(match[1]);
    const detail = Number(match[2]);
    if (cls > 7 || detail > 31) {
        throw new CoapError(`CoAP code "${code}" out of range (class 0-7, detail 0-31)`);
    }
    return (cls << 5) | detail;
}

function decodeCode(byte: number): string {
    const cls = byte >> 5;
    const detail = byte & 0x1f;
    return `${cls}.${detail.toString().padStart(2, "0")}`;
}

/** RFC 7252 §3.1 option delta/length nibble: 0–12 literal, 13 → +1 ext byte, 14 → +2 ext bytes. */
function encodeExtension(value: number): { nibble: number; extension: number[] } {
    if (value < 13) {
        return { nibble: value, extension: [] };
    }
    if (value < 269) {
        return { nibble: 13, extension: [value - 13] };
    }
    const extended = value - 269;
    return { nibble: 14, extension: [(extended >> 8) & 0xff, extended & 0xff] };
}

/** Avoids spread, which hits the JS engine's call-argument limit for a large payload. */
function pushAll(out: number[], bytes: Iterable<number>): void {
    for (const b of bytes) {
        out.push(b);
    }
}

function encodeOption(out: number[], delta: number, value: Uint8Array): void {
    const d = encodeExtension(delta);
    const l = encodeExtension(value.length);
    out.push((d.nibble << 4) | l.nibble);
    pushAll(out, d.extension);
    pushAll(out, l.extension);
    pushAll(out, value);
}

export namespace CoapMessage {
    export function encode(msg: CoapMessage): Uint8Array {
        const tokenLength = msg.token.length;
        if (tokenLength > 8) {
            throw new CoapError(`CoAP token too long: ${tokenLength} (max 8)`);
        }

        const out = new Array<number>();
        out.push((VERSION << 6) | (TYPE_TO_BITS[msg.type] << 4) | tokenLength);
        out.push(encodeCode(msg.code));
        out.push((msg.messageId >> 8) & 0xff, msg.messageId & 0xff);
        pushAll(out, msg.token);

        if (msg.uriPath !== undefined) {
            let lastOptionNumber = 0;
            for (const segment of msg.uriPath) {
                encodeOption(out, OPTION_URI_PATH - lastOptionNumber, Bytes.of(Bytes.fromString(segment)));
                lastOptionNumber = OPTION_URI_PATH;
            }
        }

        if (msg.payload.length > 0) {
            out.push(PAYLOAD_MARKER);
            pushAll(out, msg.payload);
        }

        return Uint8Array.from(out);
    }

    export function decode(bytes: Uint8Array): CoapMessage {
        if (bytes.length < 4) {
            throw new CoapError(`CoAP message too short: ${bytes.length} bytes`);
        }

        const version = bytes[0] >> 6;
        if (version !== VERSION) {
            throw new CoapError(`Unsupported CoAP version ${version}`);
        }
        const type = BITS_TO_TYPE[(bytes[0] >> 4) & 0x3];
        const tokenLength = bytes[0] & 0x0f;
        if (tokenLength > 8) {
            throw new CoapError(`Invalid CoAP token length ${tokenLength}`);
        }

        const code = decodeCode(bytes[1]);
        const messageId = (bytes[2] << 8) | bytes[3];

        let pos = 4;
        if (pos + tokenLength > bytes.length) {
            throw new CoapError("CoAP token exceeds message length");
        }
        const token = bytes.slice(pos, pos + tokenLength);
        pos += tokenLength;

        const readExtension = (nibble: number): number => {
            if (nibble < 13) {
                return nibble;
            }
            if (nibble === 13) {
                if (pos >= bytes.length) {
                    throw new CoapError("Truncated CoAP option (1-byte extension)");
                }
                return bytes[pos++] + 13;
            }
            if (nibble === 14) {
                if (pos + 2 > bytes.length) {
                    throw new CoapError("Truncated CoAP option (2-byte extension)");
                }
                const value = ((bytes[pos] << 8) | bytes[pos + 1]) + 269;
                pos += 2;
                return value;
            }
            throw new CoapError("Reserved CoAP option nibble 15");
        };

        const uriPath = new Array<string>();
        let optionNumber = 0;
        let payload = new Uint8Array();
        while (pos < bytes.length) {
            const header = bytes[pos];
            if (header === PAYLOAD_MARKER) {
                pos++;
                payload = bytes.slice(pos);
                if (payload.length === 0) {
                    throw new CoapError("CoAP payload marker with no payload");
                }
                break;
            }
            pos++;

            const delta = readExtension(header >> 4);
            const length = readExtension(header & 0x0f);
            optionNumber += delta;
            if (pos + length > bytes.length) {
                throw new CoapError("CoAP option value exceeds message length");
            }
            const value = bytes.slice(pos, pos + length);
            pos += length;

            if (optionNumber === OPTION_URI_PATH) {
                uriPath.push(Bytes.toString(value));
            }
        }

        return {
            type,
            code,
            messageId,
            token,
            uriPath: uriPath.length > 0 ? uriPath : undefined,
            payload,
        };
    }
}
