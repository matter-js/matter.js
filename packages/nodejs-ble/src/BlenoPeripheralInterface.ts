/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Channel, ChannelType, ConnectionlessTransport, Duration, ImplementationError } from "#general";
import { BlePeripheralInterface } from "@matter/protocol";
import { BlenoBleServer } from "./BlenoBleServer.js";

export class BlenoPeripheralInterface implements BlePeripheralInterface {
    constructor(private readonly blenoServer: BlenoBleServer) {}

    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): ConnectionlessTransport.Listener {
        this.blenoServer.setMatterMessageListener(listener);
        return {
            close: async () => await this.close(),
        };
    }

    openChannel(): never {
        throw new ImplementationError("Outbound connections are not supported on peripheral interfaces");
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

    advertise(advertiseData: Bytes, additionalAdvertisementData?: Bytes, interval?: Duration) {
        return this.blenoServer.advertise(advertiseData, additionalAdvertisementData, interval);
    }

    stopAdvertising() {
        return this.blenoServer.stopAdvertising();
    }
}
