/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Logger, Mutex, Seconds, Time } from "@matter/general";

const logger = Logger.get("LifecycleMutex");

/**
 * Serializes the lifecycle operations of a node and its endpoints.
 *
 * Code that runs while the mutex is held, such as a reset handler or the initialization or close of a behavior, must
 * not await an operation that waits for the same mutex: the two wait for each other forever.  The mutex cannot tell
 * such a call from a call made elsewhere while the mutex is held, so it does not refuse it.  Instead it logs a warning
 * that names both operations once an operation has waited {@link LifecycleMutex.STALL_WARNING}.
 *
 * ## Lock order
 *
 * Code that holds a lock may await only a lock of a higher level.  Joining a verb in progress, as a repeated verb call
 * or `ClientNode.act()` on an inactive node does, counts as waiting for the locks that verb takes.
 *
 * | level | lock                                                   | held while awaiting                                         |
 * |-------|--------------------------------------------------------|-------------------------------------------------------------|
 * | 1     | server node mutex (`NodeLifecycle.mutex`)              | 2; 4 of each peer (`Peers` applies the intent of its peers) |
 * | 2     | server tree mutex (`EndpointLifecycle.treeMutex`)      | 3 (`resetStorage()` erases the peers); 4 (the destruction closes the peers) |
 * | 3     | `Peers` mutex                                          | 4 and 6 (a peer delete, an act that joins a peer verb); 7   |
 * | 4     | peer node mutex                                        | 5a, 5b, 6                                                   |
 * | 5a    | `NetworkClient` subscription changes                   | 5b, 5c                                                      |
 * | 5b    | `ClientStructure` report apply                         | 6 (a delete of an endpoint the peer dropped)                |
 * | 5c    | `ClientStructure` fabric filter adoption               | 8, 9                                                        |
 * | 6     | peer tree mutex                                        | 7 (the wipe of a delete or erase)                           |
 * | 7     | `ClientNodeStores` erase of one ID                     | 8                                                           |
 * | 8     | `StoreLifecycle` of a store (erase and close wait for running writes) | 9                                            |
 * | 9     | `ClientCacheBuffer` queue                              | nothing; a flush write refuses instead of waiting           |
 *
 * Exceptions, each safe for the reason given:
 *
 * - `ClientNode.prepareStart()` awaits the start of the server node (1) before the peer takes its node mutex, and
 *   only while the server node is offline, so no peer lock is held then.
 * - A verb of a node takes the node offline (4) before it takes the tree mutex (6), because a report apply (5b) may
 *   wait for the tree mutex.
 * - `ClientNode.deleteDespiteServerTeardown()` for a node whose close or delete runs registers the erase of its ID
 *   (7) and then joins that verb (4 and 6).  The node dropped its store collection first, so that verb never enters
 *   level 7 for the same ID.
 * - The fabric filter adoption (5c) runs only under the subscription changes (5a) and never awaits 5b or 6.
 * - The peer tree mutex (6) awaits 5a only for a reset or destroy of a peer root, after the node went offline: closing
 *   the behaviors waits for the `NetworkClient` reactors that hold the subscription changes, and a node verb goes
 *   offline at level 4 before it takes level 6.
 *
 * Calls that deadlock:
 *
 * - `act()` on a client node from code that holds the tree mutex of that node, while a verb of the node is in
 *   progress: the act joins the verb, which waits for the tree mutex.
 * - Any lifecycle verb, `start()` or `stop()` of a node awaited from code that runs during a verb of the same node,
 *   such as a reset handler.
 *
 * @internal
 */
export class LifecycleMutex {
    #mutex: Mutex;
    #holder?: string;

    constructor(owner: {}) {
        this.#mutex = new Mutex(owner);
    }

    /**
     * Run {@link step} as {@link operation} while holding the mutex.  The step is queued before this method returns.
     *
     * @param operation describes the operation in the warning, for example "closing node0.part0"
     */
    hold<T>(operation: string, step: () => Promise<T>): Promise<T> {
        const stalled = stallTimer(operation, () => this.#holder ?? "another lifecycle operation");
        return this.#mutex.produce(async () => {
            stalled.stop();
            this.#holder = operation;
            try {
                return await step();
            } finally {
                this.#holder = undefined;
            }
        });
    }
}

export namespace LifecycleMutex {
    /**
     * How long an operation waits before a warning is logged.
     */
    export const STALL_WARNING = Seconds(10);
}

/**
 * Await {@link promise}, the lifecycle operation in progress that {@link awaited} names, with the warning of
 * {@link LifecycleMutex}.  {@link operation} names the caller.
 *
 * @internal
 */
export async function awaitLifecycleOperation<T>(operation: string, awaited: string, promise: PromiseLike<T>) {
    const stalled = stallTimer(operation, () => awaited);
    try {
        return await promise;
    } finally {
        stalled.stop();
    }
}

function stallTimer(operation: string, holder: () => string) {
    return Time.getTimer(`Lifecycle mutex wait: ${operation}`, LifecycleMutex.STALL_WARNING, () => {
        const awaited = holder();
        logger.warn(
            `${operation} has waited ${Duration.format(LifecycleMutex.STALL_WARNING)} for ${awaited};`,
            `possible deadlock: if code running inside ${awaited} awaits ${operation}, neither finishes`,
        );
    }).start();
}
