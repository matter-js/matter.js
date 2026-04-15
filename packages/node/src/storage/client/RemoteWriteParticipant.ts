/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction } from "@matter/general";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import type { RemoteWriter } from "./RemoteWriter.js";

/**
 * A transaction participant that persists changes to a remote node.
 *
 * There is one of these for node/transaction pair.  All attributes in a transaction commit with a single interaction.
 */
export class RemoteWriteParticipant implements Transaction.Participant {
    #request: RemoteWriter.Request = [];
    #writer: RemoteWriter;

    /**
     * There is one participant for each transaction/writer pair.  We use the writer function itself as the dedup key.
     */
    get role() {
        return this.#writer;
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

        await this.#writer(request);
    }

    rollback() {
        this.#request = [];
    }

    toString() {
        return `remote-writer`;
    }

    constructor(writer: RemoteWriter) {
        this.#writer = writer;
    }
}
