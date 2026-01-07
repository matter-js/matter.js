/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAX_UDP_MESSAGE_SIZE, Millis, Seconds } from "#general";

/** @see {@link MatterSpecification.v11.Core} § 4.17.3.2 */
export const BLE_MATTER_SERVICE_UUID_SHORT = "fff6";
export const BLE_MATTER_SERVICE_UUID = "0000FFF6-0000-1000-8000-00805F9B34FB";
export const BLE_MATTER_C1_CHARACTERISTIC_UUID = "18EE2EF5-263D-4559-959F-4F9C429F9D11";
export const BLE_MATTER_C2_CHARACTERISTIC_UUID = "18EE2EF5-263D-4559-959F-4F9C429F9D12";
export const BLE_MATTER_C3_CHARACTERISTIC_UUID = "64630238-8772-45F2-B87D-748A83218F04";

export const BLE_MINIMUM_ATT_MTU = 20; // 23-byte minimum ATT_MTU - 3 bytes for ATT operation header
export const BLE_MAXIMUM_BTP_MTU = 244; // Maximum size of BTP segment

export const BTP_MAXIMUM_WINDOW_SIZE = 255; // Server maximum window size

/**
 * The maximum amount of time after sending a BTP Session Handshake request to wait for a BTP Session Handshake response
 * before closing the connection.
 */
export const BTP_CONN_RSP_TIMEOUT = Seconds(5); // timer starts when receives handshake request & waits for a subscription request on c2

/** The maximum amount of time after receipt of a segment before a stand-alone ACK must be sent. */
export const BTP_ACK_TIMEOUT = Seconds(15); // timer in ms before ack should be sent for a segment

export const BTP_SEND_ACK_TIMEOUT = Millis(BTP_ACK_TIMEOUT / 3); // timer starts when we receive a packet and stops when we sends its ack

/**
 * The maximum amount of time no unique data has been sent over a BTP session before the Central Device must close the
 * BTP session.
 */
export const BTP_CONN_IDLE_TIMEOUT = Seconds(30);

/**
 * The maximum message size that can be transported in a Matter message via BTP.
 * Seems the chip code in BTPEngine limits the size currently to "one pbuf" which should mean one UDP message.
 */
export const BLE_MAX_MATTER_PAYLOAD_SIZE = MAX_UDP_MESSAGE_SIZE;
