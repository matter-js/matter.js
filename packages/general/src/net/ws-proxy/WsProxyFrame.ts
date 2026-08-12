/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkError } from "../Network.js";

/** Framing error on a WS-proxy binary frame. */
export class WsProxyFrameError extends NetworkError {}

const HEADER_SIZE = 3;

/**
 * Binary WS-proxy frame: [1 byte opcode] [2 bytes handle big-endian] [N bytes payload].
 * Minimum size 3 bytes (empty payload). Layout is wire-compatible with BLE proxy protocol v1.
 */
export interface WsProxyFrame {
    opcode: number;
    handle: number;
    payload: Uint8Array;
}

export function encodeWsProxyFrame(opcode: number, handle: number, payload: Uint8Array): Uint8Array {
    const frame = new Uint8Array(HEADER_SIZE + payload.length);
    frame[0] = opcode & 0xff;
    frame[1] = (handle >> 8) & 0xff;
    frame[2] = handle & 0xff;
    frame.set(payload, HEADER_SIZE);
    return frame;
}

export function decodeWsProxyFrame(data: Uint8Array): WsProxyFrame {
    if (data.length < HEADER_SIZE) {
        throw new WsProxyFrameError(`Binary frame too short: ${data.length} bytes, minimum ${HEADER_SIZE}`);
    }
    return {
        opcode: data[0],
        handle: (data[1] << 8) | data[2],
        payload: data.subarray(HEADER_SIZE),
    };
}
