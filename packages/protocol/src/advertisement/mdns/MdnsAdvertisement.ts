/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Advertisement } from "#advertisement/Advertisement.js";
import type { Advertiser } from "#advertisement/Advertiser.js";
import type { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { SupportedTransportsSchema } from "#common/SupportedTransportsBitmap.js";
import type { MdnsServer } from "#mdns/MdnsServer.js";
import { SessionIntervals } from "#session/SessionIntervals.js";
import {
    AAAARecord,
    ARecord,
    DnsRecord,
    Duration,
    Logger,
    NetworkInterfaceDetails,
    ServerAddress,
    SrvRecord,
    Time,
    Timestamp,
    TxtRecord,
} from "@matter/general";
import type { MdnsAdvertiser } from "./MdnsAdvertiser.js";

const logger = Logger.get("MdnsAdvertisement");

/**
 * Base class for MDNS advertisements.
 *
 * Individual classes specialize for each type of service.
 */
export abstract class MdnsAdvertisement<T extends ServiceDescription = ServiceDescription> extends Advertisement<T> {
    declare advertiser: MdnsAdvertiser;

    /**
     * The device qname.
     */
    qname: string;

    #isPrivacyMasked: boolean;
    #stopAt?: Timestamp;
    #broadcastPromise?: Promise<void>;

    constructor(advertiser: MdnsAdvertiser, qname: string, description: T) {
        description = {
            ...description,
            ...SessionIntervals.forAdvertisement(description),
        };
        super(advertiser, `mdns:${qname}`, description, { omitPrivateDetails: advertiser.omitPrivateDetails });
        this.qname = qname;
        this.#isPrivacyMasked = this.isPrivacyMasked;
    }

    protected abstract ptrRecords: DnsRecord[];

    protected get txtValues(): Record<string, unknown> {
        return {};
    }

    override async run(context: Advertisement.ActivityContext, event: Advertiser.BroadcastEvent = "startup") {
        this.#stopAt = undefined;
        let number = 0;
        for (const retryInterval of this.advertiser.broadcastScheduleFor(this, event)) {
            if (this.#stopAt !== undefined && this.#stopAt <= Time.nowMs) {
                break;
            }

            number++;
            logger.debug("Broadcast", this.dict({ number, next: Duration.format(retryInterval) }));
            await this.broadcast();
            await context.sleep("MDNS repeat", retryInterval);
            if (context.cancelled) {
                break;
            }
        }
    }

    /**
     * Broadcast a single announcement immediately.
     */
    async broadcast() {
        if (this.#broadcastPromise !== undefined) {
            return this.#broadcastPromise;
        }

        this.#broadcastPromise = this.#broadcast().then(() => {
            this.#broadcastPromise = undefined;
        });

        return this.#broadcastPromise;
    }

    async #broadcast() {
        if (!this.#isPrivacyMasked && this.isPrivacyMasked) {
            this.#isPrivacyMasked = true;
            await this.advertiser.server.setRecordsGenerator(this.service, this.#recordsGenerator);
        }

        await this.advertiser.server.broadcast(this.service);
    }

    /**
     * Broadcast expiration announcement immediately.
     */
    async expire() {
        if (this.#broadcastPromise !== undefined) {
            await this.#broadcastPromise;
        }
        logger.info("Unpublishing", this.dict({ time: Duration.format(this.duration) }));
        await this.advertiser.server.expireAnnouncements(this.service);
    }

    override serviceConnected() {
        const { broadcastAfterConnection } = this.advertiser.broadcastConfigFor(this);

        if (broadcastAfterConnection === undefined) {
            return;
        }

        if (broadcastAfterConnection <= 0) {
            this.stop();
            return;
        }

        this.#stopAt = Timestamp(Time.nowMs + broadcastAfterConnection);
    }

    override serviceDisconnected() {
        this.start("reconnect");
    }

    protected override async onCreate() {
        // Use Promise.resolve() to initialize on next microtick so the constructor completes before invocation
        await Promise.resolve().then(() => {
            // Install the records generator.  This will be used for broadcast and to respond to queries
            logger.info("Publishing", this.dict());
            return this.advertiser.server.setRecordsGenerator(this.service, this.#recordsGenerator);
        });
    }

    protected override async onClose() {
        // The MDNS server doesn't currently track which answers have been sent so just expire unconditionally
        await this.expire();
    }

    get #recordsGenerator(): MdnsServer.RecordGenerator {
        return (_intf, addrs) => this.#recordsFor(addrs);
    }

    #recordsFor(addrs: NetworkInterfaceDetails) {
        const hostname = addrs.mac.replace(/:/g, "").toUpperCase() + "0000.local";

        const records: DnsRecord[] = [
            ...this.ptrRecords,
            SrvRecord(this.qname, { priority: 0, weight: 0, port: this.advertiser.port, target: hostname }),
            TxtRecord(
                this.qname,
                Object.entries(this.#txtValues)
                    .filter(([, v]) => v !== undefined)
                    .map(([k, v]) => `${k}=${v}`),
            ),
        ];

        const ips = [...addrs.ipV6];
        if (this.advertiser.server.supportsIpv4) {
            ips.push(...addrs.ipV4);
        }

        // Emit address records in SelectionPreference order so peers that truncate or pick naively favor the most
        // reachable addresses
        ips.sort((a, b) => ServerAddress.selectionPreferenceOfIp(a) - ServerAddress.selectionPreferenceOfIp(b));

        for (const ip of ips) {
            records.push(ip.includes(":") ? AAAARecord(hostname, ip) : ARecord(hostname, ip));
        }

        return records;
    }

    get #txtValues() {
        const { idleInterval, activeInterval, activeThreshold } = this.description;

        const values: Record<string, unknown> = {};

        // Spec §4.3.4: SII/SAI/SAT are optional overrides of the MRP defaults, so omit them when at default
        if (idleInterval !== SessionIntervals.defaults.idleInterval) {
            values.SII = idleInterval; /* Session Idle Interval */
        }
        if (activeInterval !== SessionIntervals.defaults.activeInterval) {
            values.SAI = activeInterval; /* Session Active Interval */
        }
        if (activeThreshold !== SessionIntervals.defaults.activeThreshold) {
            values.SAT = activeThreshold; /* Session Active Threshold */
        }

        Object.assign(values, this.txtValues);

        // The T (transport modes) key is only used during operational discovery, not by commissionable/commissioner nodes
        if (this.description.tcp !== undefined && this.isOperational()) {
            values.T = SupportedTransportsSchema.encode(this.description.tcp); /* TCP support */
        }

        if (this.description.icd !== undefined) {
            values.ICD = this.description.icd; /* ICD support */
        }

        return values;
    }
}
