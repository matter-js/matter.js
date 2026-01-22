/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsMessageType, DnsQuery, DnsRecord, DnsRecordClass, DnsRecordType } from "#codec/DnsCodec.js";
import { Logger } from "#log/Logger.js";
import { RetrySchedule } from "#net/RetrySchedule.js";
import { Time } from "#time/Time.js";
import { Hours, Millis, Seconds } from "#time/TimeUnit.js";
import { Abort } from "#util/Abort.js";
import { BasicMultiplex } from "#util/Multiplex.js";
import { ObservableValue } from "#util/Observable.js";
import type { DnssdName } from "./DnssdName.js";
import type { DnssdNames } from "./DnssdNames.js";

const logger = new Logger("DiscoverySolicitor");

/**
 * Solicits DNS-SD records for specific names.
 */
export interface DnssdSolicitor {
    /**
     * Send a single MDNS query for a specific DNS-SD name.
     *
     * Multiple solicitations for the same name are coalesced into the same query using a macrotask.
     */
    solicit(solicitation: DnssdSolicitor.Solicitation): void;

    /**
     * Send MDNS queries for a specific DNS-SD name using a standard MDNS transmission schedule.
     *
     * The solicitor does not have a notion of "discovery complete", so this function does not return until
     * {@link DnssdSolicitor.Discovery.abort} signals abort (or the solicitor is closed).
     *
     * Multiple simultaneous attempts to complete discovery of the same name will not result in redundant solicitations.
     *
     * If fields in {@link discovery} change their value is used for the next solicitation.
     */
    discover(discovery: DnssdSolicitor.Discovery): Promise<void>;
}

/**
 * Solicit one or more record types for a name.
 *
 * "Soliciting" consists of broadcasting a query for a DNS-SD name.  Groups multiple solicitations in the same
 * macrotask into a single packet.
 */
export namespace DnssdSolicitor {
    /**
     * Configures solicitation of a single name.
     */
    export interface Solicitation {
        /**
         * The name to solicit.
         */
        name: DnssdName;

        /**
         * Record types to request.
         */
        recordTypes: DnsRecordType[];

        /**
         * Additional names to include as known answers.
         */
        associatedNames?: Iterable<DnssdName>;
    }

    /**
     * Configures repeated solicitation.
     */
    export interface Discovery extends Solicitation {
        /**
         * Terminates discovery.
         */
        abort: AbortSignal;
    }

    /**
     * Default retry schedule per RFC 6762 (initial delay of 20-120ms. handled separately).
     */
    export const DefaultRetries: RetrySchedule.Configuration = {
        initialInterval: Seconds(1),
        jitterFactor: 0.2,
        backoffFactor: 2,
        maximumInterval: Hours(1),
    };
}

/**
 * Concrete implementation of {@link DnssdSolicitor} that sends DNS-SD queries via multicast.
 */
export class QueryMulticaster implements DnssdSolicitor {
    #names: DnssdNames;
    #schedule: RetrySchedule;
    #abort = new Abort();
    #toSolicit = new Map<DnssdName, DnssdSolicitor.Solicitation>();
    #discovering = new Map<DnssdName, { abort: Abort; finished: Promise<void>; waiting: Set<{}> }>();
    #namesReady = new ObservableValue();
    #workers = new BasicMultiplex();

    constructor(names: DnssdNames, retries?: RetrySchedule.Configuration) {
        this.#names = names;
        this.#schedule = new RetrySchedule(
            names.entropy,
            RetrySchedule.Configuration(DnssdSolicitor.DefaultRetries, retries),
        );
        this.#workers.add(this.#emitSolicitations());
    }

    solicit(solicitation: DnssdSolicitor.Solicitation) {
        if (this.#abort.aborted) {
            return;
        }
        const entry = this.#toSolicit.get(solicitation.name);
        if (entry === undefined) {
            this.#toSolicit.set(solicitation.name, { ...solicitation });
        } else {
            entry.recordTypes = [...new Set([...entry.recordTypes, ...solicitation.recordTypes])];
            if (solicitation.associatedNames) {
                if (!entry.associatedNames) {
                    entry.associatedNames = solicitation.associatedNames;
                } else {
                    entry.associatedNames = [...new Set([...entry.associatedNames, ...solicitation.associatedNames])];
                }
            }
        }
        this.#namesReady.emit(true);
    }

    async discover(discovery: DnssdSolicitor.Discovery) {
        let active = this.#discovering.get(discovery.name);
        if (active) {
            active.waiting.add(discovery);
        } else {
            // This abort is different from the input abort because we only abort when the input aborts if nobody else
            // is waiting on discovery of the same name
            const abort = new Abort({ abort: this.#abort });
            active = {
                abort,
                finished: this.#discover(discovery, abort),
                waiting: new Set([discovery]),
            };
            this.#discovering.set(discovery.name, active);
        }

        try {
            await Abort.race(discovery.abort, active.finished);
        } finally {
            active.waiting.delete(discovery);
            if (active.waiting.size === 0) {
                active.abort();
                this.#discovering.delete(discovery.name);
            }
        }
    }

    async #discover(solicitation: DnssdSolicitor.Solicitation, abort: Abort) {
        // Wait initially 20 - 120 ms per RFC 6762
        let timeout = Millis.floor(Millis(20 + 100 * (this.#names.entropy.randomUint32 / Math.pow(2, 32))));

        for (const nextTimeout of this.#schedule) {
            using delay = new Abort({ abort, timeout });

            await delay;
            if (abort.aborted) {
                break;
            }

            timeout = nextTimeout;

            this.solicit(solicitation);
        }
    }

    async close() {
        this.#abort();
        await this.#workers;
    }

    async #emitSolicitations() {
        while (true) {
            // Wait for names to solicit
            await this.#abort.race(this.#namesReady);
            if (this.#abort.aborted) {
                return;
            }

            // Delay using a macrotask so we coalesce names
            await this.#abort.race(Time.sleep("discovery solicitor delay", 0));
            if (this.#abort.aborted) {
                return;
            }

            // Gather names we will solicit in this iteration
            const entries = [...this.#toSolicit.values()];
            this.#namesReady.value = false;
            this.#toSolicit.clear();

            // Create sets for queries and known answers
            const queries = Array<DnsQuery>();
            const answers = Array<DnsRecord>();

            for (const {
                name: { qname: name, records },
                recordTypes,
            } of entries) {
                for (const recordType of recordTypes) {
                    queries.push({ name, recordClass: DnsRecordClass.IN, recordType });
                }

                answers.push(...records);
            }

            // Send the message
            try {
                await this.#abort.race(
                    this.#names.socket.send({
                        messageType: DnsMessageType.Query,
                        queries,
                        answers,
                    }),
                );
            } catch (e) {
                logger.error("Unhandled error soliciting DNS-SD names:", e);
            }
        }
    }
}
