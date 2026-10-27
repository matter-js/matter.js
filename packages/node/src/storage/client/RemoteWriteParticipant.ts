/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger, Transaction } from "@matter/general";
import { Val, WriteResult } from "@matter/protocol";
import { EndpointNumber, Status } from "@matter/types";
import type { RemoteWriter } from "./RemoteWriter.js";

const logger = Logger.get("RemoteWriteParticipant");

// A peer ID is unique only within one controller, but a transaction may span peers of several controllers, so the
// diagnostic name — which the transaction requires to be unique — carries an ordinal derived from writer identity
const writerOrdinals = new WeakMap<RemoteWriter, number>();
let nextWriterOrdinal = 0;

function ordinalFor(writer: RemoteWriter) {
    let ordinal = writerOrdinals.get(writer);
    if (ordinal === undefined) {
        ordinal = nextWriterOrdinal++;
        writerOrdinals.set(writer, ordinal);
    }
    return ordinal;
}

/**
 * A transaction participant that persists changes to a remote node.
 *
 * There is one of these for node/transaction pair.  All attributes in a transaction commit with a single interaction.
 *
 * The Write Request is the transaction's durable write, so it goes out in commit phase one.  The values the peer
 * accepts are settled in the cache right away, while the transaction still holds its locks; a declined attribute fails
 * phase one, which rolls back every participant.  Accepted values are device truth and stay either way.  Their change
 * notifications are released when the transaction concludes, so no observer runs inside the commit.
 */
export class RemoteWriteParticipant implements Transaction.Participant {
    #request: RemoteWriter.Request = [];
    #writer: RemoteWriter;
    #name: string;
    #pending = new Map<string, RemoteWriteParticipant.PendingWrite>();
    #releases = new Array<() => Promise<void>>();

    /**
     * There is one participant for each transaction/writer pair.  We use the writer function itself as the dedup key.
     */
    get role() {
        return this.#writer;
    }

    /**
     * Add an attribute update to the write request.
     *
     * @param receiver settles the values the peer accepts
     * @param epoch the receiver's epoch when this write is queued, so it can tell a value the peer settled afterwards
     * from one that predates the write
     */
    set(
        endpointNumber: EndpointNumber,
        behaviorId: string,
        values: Val.Struct,
        receiver: RemoteWriteParticipant.Receiver,
        epoch: number,
    ) {
        const key = writeKey(endpointNumber, behaviorId);
        if (this.#pending.has(key)) {
            throw new InternalError(`${this} received a second write for ${key} in one commit`);
        }

        this.#request.push({ number: endpointNumber, behaviorId, values });
        this.#pending.set(key, { receiver, epoch, values });
    }

    async commit1() {
        if (!this.#request.length) {
            return;
        }

        const request = this.#request;
        const pending = this.#pending;
        this.#request = [];
        this.#pending = new Map();

        const statuses = await this.#writer(request);

        const failedByCluster = new Map<string, Set<string>>();
        for (const { status, path } of statuses) {
            if (status === Status.Success) {
                continue;
            }
            const key = writeKey(path.endpointId, String(path.clusterId));
            let ids = failedByCluster.get(key);
            if (!ids) {
                ids = new Set();
                failedByCluster.set(key, ids);
            }
            ids.add(String(path.attributeId));
        }

        for (const [key, { receiver, values, epoch }] of pending) {
            const failed = failedByCluster.get(key);
            const accepted = Object.fromEntries(Object.entries(values).filter(([id]) => !failed?.has(id)));
            try {
                const { release, persistFailure } = await receiver.settleAccepted(accepted, epoch);
                this.#releases.push(release);
                if (persistFailure !== undefined) {
                    logger.warn(
                        `Failed to persist values ${this.#name} wrote to ${key}; the device and the local cache hold them:`,
                        persistFailure,
                    );
                }
            } catch (e) {
                logger.warn(`Failed to settle values ${this.#name} wrote to ${key} in the local cache:`, e);
            }
        }

        WriteResult.assertSuccess(statuses);
    }

    async conclusion() {
        const releases = this.#releases;
        this.#releases = [];

        for (const release of releases) {
            try {
                await release();
            } catch (e) {
                logger.warn(`Failed to announce values ${this.#name} wrote:`, e);
            }
        }
    }

    rollback() {
        this.#request = [];
        this.#pending = new Map();
    }

    toString() {
        return `remote-writer<${this.#name}>`;
    }

    constructor(writer: RemoteWriter, name: string) {
        this.#writer = writer;
        this.#name = `${name}#${ordinalFor(writer)}`;
    }
}

function writeKey(endpointNumber: EndpointNumber | number, behaviorId: string) {
    return `${endpointNumber}|${behaviorId}`;
}

export namespace RemoteWriteParticipant {
    /**
     * Settles the values of a write the peer accepted in the local cache.
     */
    export interface Receiver {
        /**
         * Settle {@link values}, except for an attribute the peer settled after {@link epoch}: what the device
         * reported while the write was in flight outranks the write.  The values apply in memory even when persisting
         * them fails.
         */
        settleAccepted(values: Val.Struct, epoch: number): Promise<Settled>;
    }

    /**
     * The result of {@link Receiver.settleAccepted}.
     */
    export interface Settled {
        /**
         * Releases the change notifications of the settled values.  They are announced in settlement order, after the
         * announcements of earlier changes of the cluster, including those held until their own transaction ends, so
         * they may complete after this resolves.
         */
        release: () => Promise<void>;

        /**
         * The error that kept the values from being persisted locally, if any.  A failure thrown as `undefined` is not
         * reported.
         */
        persistFailure?: unknown;
    }

    /**
     * The values of one cluster a transaction writes, with the receiver that settles those the peer accepts and its
     * epoch when the write was queued.
     */
    export interface PendingWrite {
        receiver: Receiver;
        epoch: number;
        values: Val.Struct;
    }
}
