/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { generate, parse } from "coap-packet";

export type CoapType = "CON" | "NON" | "ACK" | "RST";

export interface CoapMessage {
    type: CoapType;
    code: string;
    messageId: number;
    token: Uint8Array;
    uriPath?: string[];
    payload: Uint8Array;
}

function typeToPacketFlags(type: CoapType): { confirmable: boolean; reset: boolean; ack: boolean } {
    switch (type) {
        case "CON":
            return { confirmable: true, reset: false, ack: false };
        case "NON":
            return { confirmable: false, reset: false, ack: false };
        case "ACK":
            return { confirmable: false, reset: false, ack: true };
        case "RST":
            return { confirmable: false, reset: true, ack: false };
    }
}

function flagsToType(confirmable: boolean, reset: boolean, ack: boolean): CoapType {
    if (reset) return "RST";
    if (ack) return "ACK";
    if (confirmable) return "CON";
    return "NON";
}

export namespace CoapMessage {
    export function encode(msg: CoapMessage): Uint8Array {
        const options = new Array<{ name: string; value: Buffer }>();
        if (msg.uriPath !== undefined) {
            for (const segment of msg.uriPath) {
                options.push({ name: "Uri-Path", value: Buffer.from(segment) });
            }
        }

        const flags = typeToPacketFlags(msg.type);
        const buf = generate({
            ...flags,
            code: msg.code,
            messageId: msg.messageId,
            token: Buffer.from(msg.token),
            options,
            payload: Buffer.from(msg.payload),
        });

        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }

    export function decode(bytes: Uint8Array): CoapMessage {
        const parsed = parse(Buffer.from(bytes));

        const uriPath = new Array<string>();
        for (const opt of parsed.options) {
            if (opt.name === "Uri-Path") {
                uriPath.push(opt.value.toString("utf8"));
            }
        }

        const tokenBuf = parsed.token;
        const payloadBuf = parsed.payload;

        return {
            type: flagsToType(parsed.confirmable, parsed.reset, parsed.ack),
            code: parsed.code,
            messageId: parsed.messageId,
            token: new Uint8Array(tokenBuf.buffer, tokenBuf.byteOffset, tokenBuf.byteLength),
            uriPath: uriPath.length > 0 ? uriPath : undefined,
            payload: new Uint8Array(payloadBuf.buffer, payloadBuf.byteOffset, payloadBuf.byteLength),
        };
    }
}
