/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Advertiser } from "#advertisement/Advertiser.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import {
    Bytes,
    Crypto,
    Duration,
    ImplementationError,
    Instant,
    InternalError,
    Lifetime,
    RetrySchedule,
    Seconds,
    STANDARD_MATTER_PORT,
} from "#general";
import type { MdnsServer } from "#mdns/MdnsServer.js";
import { DatatypeModel, FieldElement } from "#model";
import { MAXIMUM_COMMISSIONING_TIMEOUT } from "#types";
import { CommissionableMdnsAdvertisement } from "./CommissionableMdnsAdvertisement.js";
import { CommissionerMdnsAdvertisement } from "./CommissionerMdnsAdvertisement.js";
import type { MdnsAdvertisement } from "./MdnsAdvertisement.js";
import { OperationalMdnsAdvertisement } from "./OperationalMdnsAdvertisement.js";

/**
 * An {@link Advertiser} that advertises using an in-process MDNS implementation.
 */
export class MdnsAdvertiser extends Advertiser {
    readonly port: number;
    readonly omitPrivateDetails: boolean;

    #schedules = new Array<{ config: MdnsAdvertiser.BroadcastSchedule; schedule?: RetrySchedule }>();

    constructor(
        readonly crypto: Crypto,
        readonly server: MdnsServer,
        options?: MdnsAdvertiser.Options,
    ) {
        super(options?.lifetime);

        this.port = options?.port ?? STANDARD_MATTER_PORT;
        this.omitPrivateDetails = options?.omitPrivateDetails ?? false;

        let hasDefaultSchedule = false;
        let hasRetransmitSchedule = false;
        if (options?.schedules) {
            for (const schedule of options.schedules) {
                if (schedule.serviceKind === undefined) {
                    if (schedule.event === undefined) {
                        hasDefaultSchedule = true;
                    }

                    if (schedule.event === "retransmit") {
                        hasRetransmitSchedule = true;
                    }
                }

                this.#schedules.push({ config: schedule });
            }
        }

        if (!hasRetransmitSchedule) {
            this.#schedules.push({ config: MdnsAdvertiser.RetransmissionBroadcastSchedule });
        }

        if (!hasDefaultSchedule) {
            this.#schedules.push({ config: MdnsAdvertiser.DefaultBroadcastSchedule });
        }
    }

    /**
     * Create an advertisement for the specific service.
     */
    override getAdvertisement(description: ServiceDescription): MdnsAdvertisement | undefined {
        switch (description.kind) {
            case "operational":
                return (
                    (this.advertisementForFabric(description.fabric) as MdnsAdvertisement | undefined) ??
                    new OperationalMdnsAdvertisement(this, description)
                );

            case "commissionable":
                return new CommissionableMdnsAdvertisement(this, description);

            case "commissioner":
                return new CommissionerMdnsAdvertisement(this, description);

            default:
                throw new ImplementationError(
                    `Unsupported service description kind "${(description as ServiceDescription).kind}`,
                );
        }
    }

    /**
     * Generate a random 8-byte Matter instance identifier.
     */
    createInstanceId() {
        return Bytes.toHex(this.crypto.randomBytes(8)).toUpperCase();
    }

    /**
     * Retrieve the broadcast schedule for a specific advertisement.
     */
    broadcastScheduleFor(advertisement: MdnsAdvertisement, event?: Advertiser.BroadcastEvent) {
        const entry = this.#scheduleFor(advertisement, event);

        if (entry.schedule === undefined) {
            entry.schedule = new RetrySchedule(
                this.crypto,
                RetrySchedule.Configuration(MdnsAdvertiser.DefaultBroadcastSchedule, entry.config),
            );
        }

        return entry.schedule;
    }

    /**
     * Retrieve broadcast configuration for a specific advertisement.
     */
    broadcastConfigFor(advertisement: MdnsAdvertisement, event?: Advertiser.BroadcastEvent) {
        return this.#scheduleFor(advertisement, event).config;
    }

    #scheduleFor(advertisement: MdnsAdvertisement, event?: Advertiser.BroadcastEvent) {
        if (!event) {
            event = "startup";
        }

        for (const entry of this.#schedules) {
            const { serviceKind, event: event2 } = entry.config;

            if (serviceKind !== undefined && serviceKind !== advertisement.description.kind) {
                continue;
            }

            if (event2 !== undefined && event2 !== event) {
                continue;
            }

            return entry;
        }

        throw new InternalError("Default retry schedule not present");
    }
}

export namespace MdnsAdvertiser {
    /**
     * MDNS advertisement configuration options.
     */
    export interface Options {
        /**
         * Lifetime of advertiser owner.
         */
        readonly lifetime?: Lifetime.Owner;

        /**
         * The port of the Matter service to advertise.
         *
         * Defaults to 5540.
         */
        readonly port?: number;

        /**
         * Omit the vendor and product ID from announcements for privacy reasons.
         */
        readonly omitPrivateDetails?: boolean;

        /**
         * Broadcast schedule.
         *
         * These control the intervals at which the server broadcasts the advertisement.  Note that order is important;
         * more specific schedules should appear first.
         *
         * By default all broadcasts are configured using {@link DefaultBroadcastSchedule}.
         */
        readonly schedules?: readonly BroadcastSchedule[];
    }

    /**
     * Schedule for automatic broadcasts.
     *
     * Schedules apply conditionally with {@link DefaultBroadcastSchedule} as the fallback.
     */
    export interface BroadcastSchedule extends RetrySchedule.Configuration {
        /**
         * Limit this schedule to a particular service kind.
         */
        readonly serviceKind?: ServiceDescription["kind"];

        /**
         * Limit this schedule to initial broadcast or broadcast when reconnecting.
         */
        readonly event?: Advertiser.BroadcastEvent;

        /**
         * Extra time to broadcast after establishing an operational connection.
         *
         * Set to zero to terminate broadcast immediately after connection.  If undefined broadcasts will continue until
         * terminated by {@link timeout} or {@link maximumCount}.
         */
        readonly broadcastAfterConnection?: Duration;
    }

    /**
     * Default schedule for automatic broadcast.
     */
    export const DefaultBroadcastSchedule: BroadcastSchedule = {
        // Mandated by MDNS specification
        initialInterval: Seconds.one,

        // Maximum commissioning timeout per Matter specification 5.4.2.3.1, although
        timeout: MAXIMUM_COMMISSIONING_TIMEOUT,

        // Minimum per MDNS specification
        backoffFactor: 2,

        // Technically this may result in us emitting more than 8 packets which is the maximum per the MDNS
        // specification but extra packets will only come every 90 seconds
        maximumInterval: Seconds(90),

        // Not in any specification AFAIK but common sense to reduce thundering herd
        jitterFactor: 0.25,

        // Generally operational broadcast is unnecessary once an operational connection is established
        broadcastAfterConnection: Instant,
    };

    /**
     * Default schedule for retransmission broadcast.
     */
    export const RetransmissionBroadcastSchedule: BroadcastSchedule = {
        event: "retransmit",

        // Retransmission events occur for every packet retry so limit count to 1
        maximumCount: 1,
    };

    /**
     * Data model for MDNS advertiser configuration.
     */
    export const OptionsSchema = new DatatypeModel(
        { name: "MdnsAdvertiserOptions", type: "struct" },
        FieldElement({ name: "omitPrivateDetails", type: "bool" }),
        FieldElement(
            { name: "schedules", type: "list" },
            FieldElement(
                { name: "entry", type: "struct" },
                FieldElement({ name: "initialInterval", type: "uint32" }),
                FieldElement({ name: "timeout", type: "uint32" }),
                FieldElement({ name: "backoffFactor", type: "uint8" }),
                FieldElement({ name: "maximumInterval", type: "uint32" }),
                FieldElement({ name: "jitterFactor", type: "single" }),
                FieldElement({ name: "serviceKind", type: "string" }),
                FieldElement({ name: "event", type: "string" }),
            ),
        ),
    );
}
