/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageContext, Transaction } from "#general";
import { EndpointStore } from "#storage/EndpointStore.js";
import { DatasourceStore } from "#storage/server/DatasourceStore.js";
import type { EndpointNumber } from "#types";
import { PeerAddress } from "@matter/protocol";
import type { ClientNodeStore } from "./ClientNodeStore.js";
import { DatasourceCache } from "./DatasourceCache.js";
import { RemoteWriteParticipant } from "./RemoteWriteParticipant.js";

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

    participantFor(transaction: Transaction) {
        let participant = transaction.getParticipant(this.#owner);
        if (participant === undefined) {
            participant = new RemoteWriteParticipant(this.#owner);
            transaction.addParticipants(participant);
        }
        return participant;
    }

    /**
     * Create a {@link Datasource.ExternallyMutableStore} for a behavior.
     */
    createStoreForBehavior(behaviorId: string) {
        const initialValues = this.consumeInitialValues(behaviorId);
        return DatasourceCache(this, behaviorId, initialValues);
    }

    /**
     * Create a {@link Datasource.Store} for a behavior that does not track a remote cluster.
     */
    createStoreForLocalBehavior(behaviorId: string) {
        const initialValues = this.consumeInitialValues(behaviorId);
        return DatasourceStore(this, behaviorId, initialValues);
    }
}
