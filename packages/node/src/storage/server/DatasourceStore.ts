/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import type { EndpointStore } from "#storage/EndpointStore.js";
import { Logger, MaybePromise, Transaction } from "@matter/general";
import { Val } from "@matter/protocol";
import { StoreClosedError } from "../StoreLifecycle.js";
import type { ServerEndpointStore } from "./ServerEndpointStore.js";

const logger = Logger.get("DatasourceStore");

interface StorageParticipant extends Transaction.Participant {
    mutations?: Record<string, Val.Struct>;
}

/**
 * Factory function for the default implementation of {@link Datasource.PersistentStore}.
 *
 * Performs read & write for non-volatile values for a single behavior via the {@link ServerEndpointStore} interface.
 */
export function DatasourceStore(
    endpointStore: EndpointStore,
    behaviorId: string,
    initialValues: Val.Struct | undefined,
): Datasource.PersistentStore {
    return {
        initialValues,

        async set(transaction: Transaction, values: Val.Struct) {
            if (behaviorId === "__proto__") {
                return;
            }
            const participant = participantFor(transaction, endpointStore);
            if (!participant.mutations) {
                participant.mutations = {};
            }
            const behaviorMutations = participant.mutations[behaviorId];
            if (behaviorMutations) {
                for (const key in values) {
                    behaviorMutations[key] = values[key];
                }
            } else {
                participant.mutations[behaviorId] = { ...values };
            }
        },
    };
}

/**
 * We create a single participant per storage/transaction pair.  This function handles setup and retrieval of this
 * participant.
 */
function participantFor(transaction: Transaction, endpointStore: EndpointStore) {
    let participant = transaction.getParticipant(endpointStore) as StorageParticipant | undefined;
    if (participant) {
        return participant;
    }

    participant = {
        role: endpointStore,

        mutations: undefined,

        toString() {
            return endpointStore.toString();
        },

        commit1(): MaybePromise {
            // Persistence serves phase one commit; values are added directly to the journal so nothing necessary here
        },

        async commit2() {
            if (!this.mutations) {
                return;
            }
            try {
                await endpointStore.set(this.mutations);
            } catch (error) {
                // The values of an erased or closed store are gone on purpose; the transaction still applies in memory
                StoreClosedError.accept(error);
                logger.debug(`Values committed after ${endpointStore} ended are not stored:`, error);
            }
        },

        rollback(): MaybePromise {
            delete this.mutations;
        },
    };

    transaction.addParticipants(participant);

    return participant;
}
