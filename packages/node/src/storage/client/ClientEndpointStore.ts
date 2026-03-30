/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointStore } from "#storage/EndpointStore.js";
import { DatasourceStore } from "#storage/server/DatasourceStore.js";
import { StorageContext } from "@matter/general";
import { PeerAddress } from "@matter/protocol";
import type { EndpointNumber } from "@matter/types";
import type { ClientNodeStore } from "./ClientNodeStore.js";
import { DatasourceCache } from "./DatasourceCache.js";

export class ClientEndpointStore extends EndpointStore {
    #owner: ClientNodeStore;
    #number: EndpointNumber;

    constructor(owner: ClientNodeStore, number: EndpointNumber, storage: StorageContext) {
        super(storage);
        this.#owner = owner;
        this.#number = number;

        // Upgrade peerAddress to a PeerAddress
        if (!this.#number) {
            const commissioning = this.initialValues.get("commissioning");
            if (commissioning?.peerAddress) {
                commissioning.peerAddress = PeerAddress(commissioning.peerAddress as PeerAddress);
            }
        }
    }

    get number() {
        return this.#number;
    }

    /**
     * Shortcut to persisted peer address so we can use in logging prior to full initialization.
     */
    get peerAddress() {
        return this.initialValues.get("commissioning")?.["peerAddress"];
    }

    /**
     * Create a {@link Datasource.ExternallyMutableStore} for a behavior.
     */
    createStoreForBehavior(behaviorId: string) {
        const initialValues = this.consumeInitialValues(behaviorId);
        return new DatasourceCache({
            writer: this.#owner.write,
            endpointNumber: this.#number,
            behaviorId,
            initialValues,
            localWriter: this.#owner.localWriter,
            buffer: this.#owner.buffer,
        });
    }

    /**
     * Create a {@link Datasource.Store} for a behavior that does not track a remote cluster.
     */
    createStoreForLocalBehavior(behaviorId: string) {
        const initialValues = this.consumeInitialValues(behaviorId);
        return DatasourceStore(this, behaviorId, initialValues);
    }
}
