/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decoded MLE Mode TLV (Network Diagnostic TLV type 2).
 *
 * Single-byte bitmap. Layout per OpenThread `src/core/thread/mle_types.hpp`
 * (`DeviceMode`):
 *
 *   bit 3: rx-on-when-idle (0 = sleepy, 1 = always-on)
 *   bit 2: reserved (set on transmit, ignored on receive)
 *   bit 1: full thread device (FTD = 1, MTD = 0)
 *   bit 0: full network data (1 = full set, 0 = stable subset)
 */
export interface Mode {
    rxOnWhenIdle: boolean;
    fullThreadDevice: boolean;
    fullNetworkData: boolean;
}

const FLAG_RX_ON_WHEN_IDLE = 1 << 3;
const FLAG_RESERVED = 1 << 2;
const FLAG_FULL_THREAD_DEVICE = 1 << 1;
const FLAG_FULL_NETWORK_DATA = 1 << 0;

export namespace Mode {
    export function decode(value: Uint8Array): Mode {
        if (value.length !== 1) {
            throw new Error(`Mode TLV must be 1 byte, got ${value.length}`);
        }
        const raw = value[0];
        return {
            rxOnWhenIdle: (raw & FLAG_RX_ON_WHEN_IDLE) !== 0,
            fullThreadDevice: (raw & FLAG_FULL_THREAD_DEVICE) !== 0,
            fullNetworkData: (raw & FLAG_FULL_NETWORK_DATA) !== 0,
        };
    }

    export function encode(mode: Mode): Uint8Array {
        // The reserved bit must be set on transmit per Thread spec / OpenThread `DeviceMode::Set`.
        let raw = FLAG_RESERVED;
        if (mode.rxOnWhenIdle) raw |= FLAG_RX_ON_WHEN_IDLE;
        if (mode.fullThreadDevice) raw |= FLAG_FULL_THREAD_DEVICE;
        if (mode.fullNetworkData) raw |= FLAG_FULL_NETWORK_DATA;
        return new Uint8Array([raw]);
    }
}
