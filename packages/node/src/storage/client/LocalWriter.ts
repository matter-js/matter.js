/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "@matter/general";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import type { ClientNodeStore } from "./ClientNodeStore.js";

/**
 * Handles local storage persistence for client datasource caches.
 */
export class LocalWriter {
    #nodeStore: ClientNodeStore;

    constructor(nodeStore: ClientNodeStore) {
        this.#nodeStore = nodeStore;
    }

    async persist(endpointNumber: EndpointNumber, behaviorId: string, values: Val.Struct) {
        await this.#nodeStore.storeForEndpointNumber(endpointNumber).set({ [behaviorId]: values });
    }

    erase(endpointNumber: EndpointNumber, behaviorId: string): MaybePromise<void> {
        return this.#nodeStore.storeForEndpointNumber(endpointNumber).eraseStoreForBehavior(behaviorId);
    }
}
