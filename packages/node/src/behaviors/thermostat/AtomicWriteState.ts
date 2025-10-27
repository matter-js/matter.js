/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Thermostat } from "#clusters/thermostat";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Diagnostic, Logger, Millis, Observable, Seconds, Time, Timer, toHex } from "#general";
import { PeerAddress, Val } from "#protocol";
import { AttributeId, ClusterId } from "#types";

const logger = Logger.get("AtomicWriteState");

/** SDK uses 3s for Presets and 9s for Schedules, so just use 9s in general */
const MAXIMUM_ALLOWED_TIMEOUT = Seconds(9);

/**
 * Represents the state of an ongoing atomic write operation.
 *
 * TODO: Move out of thermostat behavior into a more generic behavior handler once used by other clusters too. Then we
 *  also need to adjust how it is handled.
 */
export class AtomicWriteState {
    readonly peerAddress: PeerAddress;
    readonly endpoint: Endpoint;
    readonly clusterId: ClusterId;
    readonly attributeRequests: Thermostat.AtomicRequest["attributeRequests"];
    readonly attributeNames: Map<AttributeId, string> = new Map();
    readonly pendingAttributeValues: Val.Struct = {};
    readonly timeout: number;
    readonly initialValues: Val.Struct;
    readonly closed = Observable<[void]>();
    #timer: Timer;

    constructor(
        peerAddress: PeerAddress,
        endpoint: Endpoint,
        cluster: ClusterId,
        attributeRequests: Thermostat.AtomicRequest["attributeRequests"],
        timeout: number,
        attributeNames: Map<AttributeId, string>,
        initialValues: Val.Struct,
    ) {
        this.peerAddress = peerAddress;
        this.endpoint = endpoint;
        this.clusterId = cluster;
        this.attributeRequests = attributeRequests;
        this.timeout = Math.min(timeout, MAXIMUM_ALLOWED_TIMEOUT);
        this.attributeNames = attributeNames;
        this.initialValues = initialValues;

        this.#timer = Time.getTimer("AtomicWriteState Timeout", Millis(this.timeout), () => this.#timeoutTriggered());
    }

    get [Diagnostic.value]() {
        return Diagnostic.dict({
            peerAddress: this.peerAddress.toString(),
            endpointId: this.endpoint.id,
            clusterId: toHex(this.clusterId),
            attributeRequests: this.attributeRequests,
            timeout: this.timeout,
            initialValues: this.initialValues,
            pendingAttributeValues: this.pendingAttributeValues,
        });
    }

    start() {
        logger.debug(
            `Starting atomic write state for peer ${this.peerAddress.toString()} on endpoint ${this.endpoint.id}`,
        );
        this.#timer.start();
    }

    #timeoutTriggered() {
        logger.debug(
            `Atomic write state for peer ${this.peerAddress.toString()} on endpoint ${this.endpoint.id} timed out`,
        );
        this.close();
    }

    close() {
        logger.debug(
            `Closing atomic write state for peer ${this.peerAddress.toString()} on endpoint ${this.endpoint.id}`,
        );
        if (this.#timer.isRunning) {
            this.#timer.stop();
        }
        this.closed.emit();
    }
}
