/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simulates a Matter-compatible BLE peripheral for testing.
 * Generates advertisement data and GATT service/characteristic structures.
 */

import { Bytes } from "@matter/general";

export interface MockBleDeviceConfig {
    discriminator: number;
    vendorId: number;
    productId: number;
    address?: string;
    name?: string;
}

export class MockBleDevice {
    readonly address: string;
    readonly name: string;
    readonly discriminator: number;
    readonly vendorId: number;
    readonly productId: number;

    constructor(config: MockBleDeviceConfig) {
        this.discriminator = config.discriminator;
        this.vendorId = config.vendorId;
        this.productId = config.productId;
        this.address = config.address ?? "AA:BB:CC:DD:EE:FF";
        this.name = config.name ?? `MATTER-${config.discriminator}`;
    }

    /**
     * Generate the 8-byte Matter BLE advertisement service data (fff6).
     * Format: [opcode(1)] [discriminator(2)] [vendorId(2)] [productId(2)] [flags(1)]
     */
    get advertisementServiceData(): Uint8Array {
        const data = new Uint8Array(8);
        // Opcode byte: version=0, additional data=0
        data[0] = 0x00;
        // Discriminator (little-endian 12-bit in 2 bytes)
        data[1] = this.discriminator & 0xff;
        data[2] = (this.discriminator >> 8) & 0x0f;
        // Vendor ID (little-endian)
        data[3] = this.vendorId & 0xff;
        data[4] = (this.vendorId >> 8) & 0xff;
        // Product ID (little-endian)
        data[5] = this.productId & 0xff;
        data[6] = (this.productId >> 8) & 0xff;
        // Flags
        data[7] = 0x00;
        return data;
    }

    /**
     * Generate a device_discovered event data object for this device.
     */
    get discoveredEventData(): Record<string, unknown> {
        return {
            address: this.address,
            name: this.name,
            rssi: -55,
            connectable: true,
            service_data: {
                fff6: Bytes.toBase64(this.advertisementServiceData),
            },
            service_uuids: ["fff6"],
        };
    }

    /**
     * Return mock GATT services for this device.
     */
    get services(): Array<{ uuid: string }> {
        return [{ uuid: "fff6" }];
    }

    /**
     * Return mock GATT characteristics for the Matter service.
     */
    get characteristics(): Array<{ uuid: string; properties: string[] }> {
        return [
            { uuid: "18EE2EF5-263D-4559-959F-4F9C429F9D11", properties: ["write"] },
            { uuid: "18EE2EF5-263D-4559-959F-4F9C429F9D12", properties: ["notify"] },
            { uuid: "18EE2EF5-263D-4559-959F-4F9C429F9D13", properties: ["read"] },
        ];
    }

    /**
     * Generate a BTP handshake response for a given request.
     * Returns a minimal valid 6-byte handshake response.
     */
    generateBtpHandshakeResponse(): Uint8Array {
        // BTP handshake response: [0x65, 0x6C, version, mtu(2 bytes LE), windowSize]
        const response = new Uint8Array(6);
        response[0] = 0x65; // BTP response opcode byte 1
        response[1] = 0x6c; // BTP response opcode byte 2
        response[2] = 0x04; // BTP version 4
        response[3] = 0xf4; // MTU low byte (244)
        response[4] = 0x00; // MTU high byte
        response[5] = 0x06; // Window size 6
        return response;
    }
}
