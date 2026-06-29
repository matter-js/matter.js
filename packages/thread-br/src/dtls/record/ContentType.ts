/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DTLS 1.2 ContentType values (RFC 6347 §4.1, RFC 5246 §6.2.1).
 * The four values listed below are the only ones we encode or accept on the wire;
 * any other byte triggers a decode error.
 */
export const ContentType = {
    CHANGE_CIPHER_SPEC: 20,
    ALERT: 21,
    HANDSHAKE: 22,
    APPLICATION_DATA: 23,
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export function isContentType(value: number): value is ContentType {
    return value === 20 || value === 21 || value === 22 || value === 23;
}
