/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Channel, ChannelType, ConnectedChannel, Duration, MatterError, Transport } from "@matter/general";
import { Scanner } from "../common/Scanner.js";
import { MatterBle } from "./BleConsts.js";

export class BleError extends MatterError {}

/** Thrown when a BLE write or subscribe operation fails because the peripheral disconnected. */
export class BleDisconnectedError extends BleError {}

// TODO - need to factor out the general platform BLE from Matter/BTP so this can move into matter.js-general
export abstract class Ble {
    abstract get peripheralInterface(): BlePeripheralInterface;
    abstract get centralInterface(): Transport;
    abstract get scanner(): Scanner;
}

export interface BlePeripheralInterface extends Transport {
    advertise(advertiseData: Bytes, additionalAdvertisementData?: Bytes, interval?: Duration): Promise<void>;
    stopAdvertising(): Promise<void>;
}

export abstract class BleChannel<T extends Bytes = Bytes> implements Channel<T>, ConnectedChannel {
    readonly maxPayloadSize = MatterBle.MAX_MATTER_PAYLOAD_SIZE;
    readonly isReliable = true as const;
    readonly supportsLargeMessages = false;
    readonly type = ChannelType.BLE;

    abstract name: string;
    abstract send(data: T): Promise<void>;
    abstract close(): Promise<void>;
    abstract onClose(listener: () => void): Transport.Listener;
    abstract [Symbol.asyncIterator](): AsyncIterator<Bytes>;
}
