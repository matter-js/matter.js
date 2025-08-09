/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, ChannelType, TransportInterface } from "#general";
import { BlePeripheralInterface } from "@matter/protocol";
import { BlenoBleServer } from "./BlenoBleServer.js";

export class BlenoPeripheralInterface implements BlePeripheralInterface {
    constructor(private readonly blenoServer: BlenoBleServer) {}

    // TransportInterface
    onData(listener: (socket: Channel<Uint8Array>, data: Uint8Array) => void): TransportInterface.Listener {
        this.blenoServer.setMatterMessageListener(listener);
        return {
            close: async () => await this.close(),
        };
    }

    async close() {
        await this.blenoServer.close();
    }

    supports(type: ChannelType, address?: string) {
        if (type === ChannelType.BLE) {
            return true;
        }

        if (address === undefined) {
            return true;
        }

        return this.blenoServer.clientAddress === address;
    }

    advertise(advertiseData: Uint8Array, additionalAdvertisementData?: Uint8Array, intervalMs?: number) {
        return this.blenoServer.advertise(advertiseData, additionalAdvertisementData, intervalMs);
    }

    stopAdvertising() {
        return this.blenoServer.stopAdvertising();
    }
}
