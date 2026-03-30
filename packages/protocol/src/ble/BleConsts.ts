/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAX_UDP_MESSAGE_SIZE, Millis, Seconds } from "@matter/general";

/** @see {@link MatterSpecification.v11.Core} § 4.17.3.2 */
export namespace MatterBle {
    /** Short 16-bit form of the Matter BLE service UUID. */
    export const serviceUuidShort = "fff6";

    /** Full 128-bit (Bluetooth SIG base UUID) form of the Matter BLE service UUID. */
    export const serviceUuid = "0000fff6-0000-1000-8000-00805f9b34fb";

    /**
     * Returns true if the given UUID matches the Matter BLE service UUID.
     * Accepts both the short 16-bit form ("fff6") and the full 128-bit form
     * ("0000fff6-0000-1000-8000-00805f9b34fb") as some BLE adapters and bindings
     * report the full Bluetooth SIG base UUID instead of the abbreviated form.
     */
    export function isServiceUuid(uuid: string): boolean {
        const lower = uuid.toLowerCase();
        return lower === serviceUuidShort || lower === serviceUuid;
    }

    export const c1CharacteristicUuid = "18EE2EF5-263D-4559-959F-4F9C429F9D11";
    export const c2CharacteristicUuid = "18EE2EF5-263D-4559-959F-4F9C429F9D12";
    export const c3CharacteristicUuid = "64630238-8772-45F2-B87D-748A83218F04";

    export const minimumAttMtu = 20; // 23-byte minimum ATT_MTU - 3 bytes for ATT operation header
    export const maximumBtpMtu = 244; // Maximum size of BTP segment

    export const btpMaxWindowSize = 255; // Server maximum window size

    /**
     * The maximum amount of time after sending a BTP Session Handshake request to wait for a BTP Session Handshake
     * response before closing the connection.
     */
    export const btpConnRspTimeout = Seconds(5); // timer starts when receives handshake request & waits for a subscription request on c2

    /** The maximum amount of time after receipt of a segment before a stand-alone ACK must be sent. */
    export const btpAckTimeout = Seconds(15); // timer in ms before ack should be sent for a segment

    export const btpSendAckTimeout = Millis(btpAckTimeout / 3); // timer starts when we receive a packet and stops when we sends its ack

    /**
     * The maximum amount of time no unique data has been sent over a BTP session before the Central Device must close
     * the BTP session.
     */
    export const btpConnIdleTimeout = Seconds(30);

    /** BTP protocol versions supported, sorted in descending order. */
    export const btpSupportedVersions = [4];

    /**
     * The maximum message size that can be transported in a Matter message via BTP.
     * Seems the chip code in BTPEngine limits the size currently to "one pbuf" which should mean one UDP message.
     */
    export const maxPayloadSize = MAX_UDP_MESSAGE_SIZE;
}
