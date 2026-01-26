/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsRecordType } from "#codec/DnsCodec.js";
import { ServerAddressSet } from "#net/ServerAddressSet.js";
import { Abort } from "#util/Abort.js";
import { isIPv4, isIPv6 } from "#util/Ip.js";
import { BasicMultiplex } from "#util/Multiplex.js";
import { ObserverGroup } from "#util/Observable.js";
import { BasicSet } from "#util/Set.js";
import { DnssdName } from "./DnssdName.js";
import type { DnssdSolicitor } from "./DnssdSolicitor.js";
import { IpService } from "./IpService.js";

/**
 * Discovers new IP addresses for an {@link IpService}.
 *
 * This primarily involves sending queries for SRV records using {@link DnssdSolicitor#discover}.  We also query for
 * A and AAAA records for any SRV target hostnames for which we do not know IP addresses.
 *
 * Runs until aborted or we discover a new IP address (we ignore existing addresses).
 */
export async function IpServiceResolution(service: IpService, abort: AbortSignal, ipv4 = true) {
    using localAbort = new Abort({ abort });
    await using workers = new BasicMultiplex();
    using observers = new ObserverGroup();

    // Target names for SRV records.  We report this to the solicitor as associated records and initiate discovery on
    // any name that has no IP records
    const hosts = new BasicSet<DnssdName>();

    // We record an abort function for any hostname (SRV target) we are discovering because it has no known IPs
    let hostResolvers: undefined | Map<DnssdName, Abort>;

    // Resolve hosts with no IPs
    observers.on(hosts.added, name => {
        // Skip if host has IP records
        if (
            [...name.records].find(
                record => record.recordType === DnsRecordType.AAAA || record.recordType === DnsRecordType.A,
            )
        ) {
            return;
        }

        // Begin resolving
        if (!hostResolvers) {
            hostResolvers = new Map();
        }
        const hostAbort = new Abort({ abort: localAbort });
        hostResolvers.set(name, hostAbort);
        workers.add(
            service.names.solicitor
                .discover({
                    name,
                    recordTypes: ipv4 ? [DnsRecordType.A, DnsRecordType.AAAA] : [DnsRecordType.AAAA],
                    abort: hostAbort,
                })
                .finally(hostAbort.close.bind(hostAbort)),
        );
    });

    // Stop resolving hosts when deleted
    observers.on(hosts.deleted, name => {
        const abortHost = hostResolvers?.get(name);
        if (!abortHost) {
            return;
        }

        hostResolvers?.delete(name);
        abortHost();
    });

    // Resolve any initial hosts without records
    for (const record of service.name.records) {
        if (record.recordType !== DnsRecordType.SRV) {
            continue;
        }

        hosts.add(service.names.get(record.name));
    }

    // Wire the service to a.) stop discovery when we discover a new address, and b.) update known hosts
    const existingAddresses = ServerAddressSet(service.addresses);
    observers.on(service.changed, () => {
        // Detect new address which means discovery is complete
        for (const address of service.addresses) {
            if (!ipv4 && isIPv4(address.ip)) {
                // Ignore ipv4 if ipv4 is unused
                continue;
            }

            if (!existingAddresses.has(address) && (ipv4 || isIPv6(address.ip))) {
                // Address discovered; we're done
                localAbort();
            }
        }

        // Add/remove hosts as necessary
        const srvs = [...service.name.records].filter(record => record.recordType === DnsRecordType.SRV);
        const newHostnames = new Set(srvs.map(record => record.value.target));
        for (const hostname of newHostnames) {
            // Host is newly added; add to associated names
            hosts.add(service.names.get(hostname));
        }
        for (const name of hosts) {
            if (newHostnames.has(name.qname)) {
                continue;
            }

            // Host is no longer targeted; remove from associated names
            hosts.delete(name);
        }
    });

    // Begin discovering SVC records
    workers.add(
        service.names.solicitor.discover({
            abort: localAbort,
            name: service.name,
            recordTypes: [DnsRecordType.SRV],

            get associatedNames() {
                return hosts;
            },
        }),
    );

    // Run until aborted, either because we discovered a new IP or input abort was signaled
    await localAbort;
}
