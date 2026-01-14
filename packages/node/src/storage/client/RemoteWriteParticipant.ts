/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction } from "#general";
import { Val } from "#protocol";
import { EndpointNumber } from "#types";
import type { ClientNodeStore } from "./ClientNodeStore.js";
import type { RemoteWriter } from "./RemoteWriter.js";

/**
 * A transaction participant that persists changes to a remote node.
 *
 * There is one of these for node/transaction pair.  All attributes in a transaction commit with a single interaction.
 */
export class RemoteWriteParticipant implements Transaction.Participant {
    #request: RemoteWriter.Request = [];
    #store: ClientNodeStore;

    /**
     * There is one participant for each transaction/client node pair.  We therefore use the store as the role.
     */
    get role() {
        return this.#store;
    }

    /**
     * Add an attribute update to the write request.
     */
    set(endpointNumber: EndpointNumber, behaviorId: string, values: Val.Struct) {
        this.#request.push({
            number: endpointNumber,
            behaviorId: behaviorId,
            values,
        });
    }

    async commit2() {
        if (!this.#request.length) {
            return;
        }

        const request = this.#request;
        this.#request = [];

        await this.#store.write(request);
    }

    rollback() {
        this.#request = [];
    }

    toString() {
        return `writer#${this.#store.id}`;
    }

    constructor(store: ClientNodeStore) {
        this.#store = store;
    }
}
