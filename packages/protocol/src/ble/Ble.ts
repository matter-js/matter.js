/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Channel, ChannelType, ConnectionlessTransport, Duration, MatterError } from "#general";
import { Scanner } from "../common/Scanner.js";
import { BLE_MAX_MATTER_PAYLOAD_SIZE } from "./BleConsts.js";

export class BleError extends MatterError {}

// TODO - need to factor out the general platform BLE from Matter/BTP so this can move into matter.js-general
export abstract class Ble {
    abstract get peripheralInterface(): BlePeripheralInterface;
    abstract get centralInterface(): ConnectionlessTransport;
    abstract get scanner(): Scanner;
}

export interface BlePeripheralInterface extends ConnectionlessTransport {
    advertise(advertiseData: Bytes, additionalAdvertisementData?: Bytes, interval?: Duration): Promise<void>;
    stopAdvertising(): Promise<void>;
}

export abstract class BleChannel<T> implements Channel<T> {
    readonly maxPayloadSize = BLE_MAX_MATTER_PAYLOAD_SIZE;
    readonly isReliable = true; // BLE uses BTP which is reliable
    readonly type = ChannelType.BLE;

    abstract name: string;
    abstract send(data: T): Promise<void>;
    abstract close(): Promise<void>;
}
