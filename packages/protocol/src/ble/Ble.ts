/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Channel, ChannelType, ConnectedChannel, Duration, Observable, Transport } from "@matter/general";
import { Scanner } from "../common/Scanner.js";
import { PeerCommunicationError } from "../peer/PeerCommunicationError.js";
import { MatterBle } from "./BleConsts.js";

export class BleError extends PeerCommunicationError {}

/** Thrown when a BLE write or subscribe operation fails because the peripheral disconnected. */
export class BleDisconnectedError extends BleError {}

/**
 * Fired as the `cause` when the BLE transport under a PASE session closes, triggering a
 * force-close of the session so pending exchanges reject immediately instead of waiting
 * for MRP timeouts.
 */
export class BleChannelClosedError extends BleDisconnectedError {}

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

    readonly #closed = Observable<[]>();
    #closedFired = false;

    /**
     * Emitted exactly once when the channel is lost (peripheral disconnect, BTP session close,
     * or explicit {@link close}).  Consumers that hold a secure session over this channel use
     * this to force-close the session and reject pending exchanges without waiting for MRP
     * timeouts.
     *
     * Subclasses must call {@link emitClosed} from each of their termination paths.  The
     * latch guarantees exactly-once semantics regardless of which triggers fire.
     */
    get closed() {
        return this.#closed;
    }

    protected emitClosed() {
        if (this.#closedFired) {
            return;
        }
        this.#closedFired = true;
        this.#closed.emit();
    }
}
