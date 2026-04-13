/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Abort,
    ChannelType,
    Diagnostic,
    DnsRecord,
    DnsRecordType,
    DnssdName,
    DnssdNames,
    Duration,
    IpService,
    MatterAggregateError,
    ObserverGroup,
    Seconds,
    ServerAddressUdp,
    Time,
} from "@matter/general";
import { VendorId } from "@matter/types";
import { CommissionableDevice, CommissionableDeviceIdentifiers, DiscoveryData, Scanner } from "../common/Scanner.js";
import {
    MATTER_COMMISSION_SERVICE_QNAME,
    getCommissionableDeviceQname,
    getCommissioningModeQname,
    getDeviceTypeQname,
    getLongDiscriminatorQname,
    getShortDiscriminatorQname,
    getVendorQname,
} from "./MdnsConsts.js";

interface CachedDevice {
    device: CommissionableDevice;
    ipService: IpService;
    name: DnssdName;
    observer: (changes: DnssdName.Changes) => void;
    onAddresses?: () => void;
}

interface Waiter {
    notify(device: CommissionableDevice): void;
    cancel(): void;
    identifier: CommissionableDeviceIdentifiers;
}

/**
 * Discovers commissionable and commissioner Matter devices via DNS-SD using the DnssdNames infrastructure.
 *
 * Replaces the legacy MdnsClient for commissionable device scanning.
 */
export class CommissionableMdnsScanner implements Scanner {
    readonly type = ChannelType.UDP;
    readonly #names: DnssdNames;
    readonly #filter: (record: DnsRecord) => boolean;
    readonly #observers = new ObserverGroup();
    readonly #cache = new Map<string, CachedDevice>();
    readonly #waiters = new Set<Waiter>();

    constructor(names: DnssdNames) {
        this.#names = names;

        const suffix1 = `._matterc._udp.local`;
        const base1 = `_matterc._udp.local`;
        const suffix2 = `._matterd._udp.local`;
        const base2 = `_matterd._udp.local`;

        this.#filter = (record: DnsRecord) => {
            const lower = record.name.toLowerCase();
            return lower === base1 || lower.endsWith(suffix1) || lower === base2 || lower.endsWith(suffix2);
        };

        names.filters.add(this.#filter);
        this.#observers.on(names.discovered, this.#onDiscovered.bind(this));
    }

    async close() {
        // Cancel all active discoveries so their promises resolve
        for (const waiter of this.#waiters) {
            waiter.cancel();
        }

        this.#names.filters.delete(this.#filter);
        this.#observers.close();
        await MatterAggregateError.allSettled(
            [...this.#cache.values()].map(({ ipService }) => ipService.close()),
            "Error closing cached IpServices",
        );
        this.#cache.clear();
    }

    async findCommissionableDevicesContinuously(
        identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        timeout?: Duration,
        cancelSignal?: Promise<void>,
    ): Promise<CommissionableDevice[]> {
        // Pick up names already discovered before we subscribed (e.g. device broadcasts that arrived
        // before the scanner was created)
        for (const name of this.#names.discoveredNames) {
            this.#onDiscovered(name);
        }

        const seen = new Set<string>();
        const result: CommissionableDevice[] = [];

        // Deliver cached matches that have resolved addresses
        for (const cached of this.#cache.values()) {
            const device = refreshAddresses(cached);
            if (matchesIdentifier(device, identifier) && device.addresses.length > 0) {
                seen.add(device.deviceIdentifier);
                result.push(device);
                callback(device);
            }
        }

        // Create an internal cancel promise that cancelCommissionableDeviceDiscovery can trigger
        let cancelResolve!: () => void;
        const internalCancel = new Promise<void>(resolve => (cancelResolve = resolve));

        // Register waiter for new discoveries
        const waiter: Waiter = {
            identifier,
            cancel: cancelResolve,
            notify: device => {
                if (matchesIdentifier(device, identifier) && !seen.has(device.deviceIdentifier)) {
                    seen.add(device.deviceIdentifier);
                    result.push(device);
                    callback(device);
                }
            },
        };
        this.#waiters.add(waiter);

        const sleepTimer = timeout !== undefined ? Time.sleep("commissionable scanner timeout", timeout) : undefined;
        const signals: Promise<unknown>[] = [internalCancel];
        if (sleepTimer) signals.push(sleepTimer);
        if (cancelSignal) signals.push(cancelSignal);

        // Start continuous query retransmission (RFC 6762 schedule)
        const queryAbort = new Abort();
        const discoveries = this.#startDiscovery(identifier, queryAbort);

        try {
            await Promise.race(signals);
            sleepTimer?.cancel();
        } finally {
            queryAbort();
            await discoveries;
            this.#waiters.delete(waiter);
        }

        return result;
    }

    getDiscoveredCommissionableDevices(identifier: CommissionableDeviceIdentifiers): CommissionableDevice[] {
        return [...this.#cache.values()]
            .map(cached => refreshAddresses(cached))
            .filter(device => matchesIdentifier(device, identifier) && device.addresses.length > 0);
    }

    cancelCommissionableDeviceDiscovery(identifier: CommissionableDeviceIdentifiers) {
        for (const waiter of this.#waiters) {
            if (matchesWaiterIdentifier(waiter.identifier, identifier)) {
                waiter.cancel();
            }
        }
    }

    #onDiscovered(name: DnssdName) {
        const lower = name.qname.toLowerCase();
        const matterc = lower === "_matterc._udp.local" || lower.endsWith("._matterc._udp.local");
        const matterd = lower === "_matterd._udp.local" || lower.endsWith("._matterd._udp.local");
        if (!matterc && !matterd) {
            return;
        }

        // Service-type qnames (base + subtype) hold PTR records pointing at instance qnames.  Follow the targets
        // and solicit only the record types the target is actually missing — responders usually include SRV+TXT
        // as additional records with the PTR, in which case no follow-up query is needed.
        // DNS-SD service-type labels start with "_"; Matter instance names are hex strings without leading "_".
        if (lower.startsWith("_")) {
            for (const record of name.records) {
                if (record.recordType !== DnsRecordType.PTR) {
                    continue;
                }
                const target = this.#names.get(record.value);
                let hasSrv = false;
                let hasTxt = false;
                for (const r of target.records) {
                    if (r.recordType === DnsRecordType.SRV) {
                        hasSrv = true;
                    } else if (r.recordType === DnsRecordType.TXT) {
                        hasTxt = true;
                    }
                    if (hasSrv && hasTxt) {
                        break;
                    }
                }
                const recordTypes = new Array<DnsRecordType>();
                if (!hasSrv) {
                    recordTypes.push(DnsRecordType.SRV);
                }
                if (!hasTxt) {
                    recordTypes.push(DnsRecordType.TXT);
                }
                if (recordTypes.length) {
                    this.#names.solicitor.solicit({ name: target, recordTypes });
                }
            }
            return;
        }

        if (this.#cache.has(lower)) {
            return;
        }

        const ipService = new IpService(name.qname, Diagnostic.via("commissionable-scanner"), this.#names);

        // Try to build the device immediately.  If required TXT fields (D, CM) are not yet available (e.g. TXT
        // arrives after the initial SRV/PTR), observe the name and retry on subsequent updates.
        const device = buildCommissionableDevice(name);
        if (device !== undefined) {
            this.#cacheDevice(lower, device, ipService, name);
            return;
        }

        // Solicit missing records now so we don't wait for the next PTR retry cycle
        const hasSrv = [...name.records].some(r => r.recordType === DnsRecordType.SRV);
        const recordTypes = hasSrv ? [DnsRecordType.TXT] : [DnsRecordType.SRV, DnsRecordType.TXT];
        this.#names.solicitor.solicit({ name, recordTypes });

        // TXT not yet available — observe for updates until we can build the device or it disappears
        const pendingObserver = ({ name: changedName }: DnssdName.Changes) => {
            if (!changedName.isDiscovered) {
                this.#observers.off(name, pendingObserver);
                void ipService.close();
                return;
            }
            const built = buildCommissionableDevice(changedName);
            if (built !== undefined) {
                this.#observers.off(name, pendingObserver);
                this.#cacheDevice(lower, built, ipService, name);
            }
        };
        this.#observers.on(name, pendingObserver);
    }

    #cacheDevice(lower: string, device: CommissionableDevice, ipService: IpService, name: DnssdName) {
        const observer = ({ name: changedName }: DnssdName.Changes) => {
            if (!changedName.isDiscovered) {
                const cached = this.#cache.get(lower);
                if (cached) {
                    this.#cache.delete(lower);
                    this.#observers.off(name, cached.observer);
                    if (cached.onAddresses) {
                        this.#observers.off(ipService.changed, cached.onAddresses);
                        cached.onAddresses = undefined;
                    }
                    void cached.ipService.close();
                }
            }
        };

        const cached: CachedDevice = { device, ipService, name, observer };
        this.#cache.set(lower, cached);
        this.#observers.on(name, observer);

        // Only notify waiters once the device has resolved IP addresses.
        // A/AAAA records may arrive after the initial SRV/TXT discovery;
        // defer notification until addresses become available.
        if (!this.#deliverDeviceIfResolved(cached)) {
            const onAddresses = () => {
                if (this.#deliverDeviceIfResolved(cached)) {
                    this.#observers.off(ipService.changed, onAddresses);
                    cached.onAddresses = undefined;
                }
            };
            cached.onAddresses = onAddresses;
            this.#observers.on(ipService.changed, onAddresses);
        }
    }

    #deliverDeviceIfResolved(cached: CachedDevice): boolean {
        const device = refreshAddresses(cached);
        if (device.addresses.length === 0) {
            return false;
        }
        for (const waiter of this.#waiters) {
            waiter.notify(device);
        }
        return true;
    }

    async #startDiscovery(identifier: CommissionableDeviceIdentifiers, abort: Abort) {
        const solicitor = this.#names.solicitor;
        const qnames = getQueryQnames(identifier);
        const discoveries = qnames.map(qname =>
            solicitor.discover({
                name: this.#names.get(qname),
                recordTypes: [DnsRecordType.PTR],
                abort,
                // Cap backoff for commissioning: short-lived discovery shouldn't drift toward the 1h default
                retries: { maximumInterval: Seconds(30) },
            }),
        );
        await MatterAggregateError.allSettled(discoveries);
    }
}

function buildCommissionableDevice(name: DnssdName): CommissionableDevice | undefined {
    const params = name.parameters;
    const D = Number(params.get("D"));
    const CM = Number(params.get("CM"));

    if (!isFinite(D) || !isFinite(CM)) {
        return undefined;
    }

    // Instance ID is the first label of the qname
    const instanceId = name.qname.split(".")[0];

    const dd = DiscoveryData(params);

    // Default T and ICD to 0 when absent, matching legacy MdnsClient behavior
    dd.T ??= 0;
    dd.ICD ??= 0;

    return {
        ...dd,
        deviceIdentifier: instanceId,
        D,
        CM,
        addresses: [] as ServerAddressUdp[],
    };
}

function refreshAddresses(cached: CachedDevice): CommissionableDevice {
    cached.device.addresses = [...cached.ipService.addresses] as ServerAddressUdp[];
    return cached.device;
}

function matchesIdentifier(device: CommissionableDevice, identifier: CommissionableDeviceIdentifiers): boolean {
    if ("instanceId" in identifier) {
        return device.deviceIdentifier === identifier.instanceId;
    }
    if ("longDiscriminator" in identifier) {
        return device.D === identifier.longDiscriminator;
    }
    if ("shortDiscriminator" in identifier) {
        return ((device.D >> 8) & 0x0f) === identifier.shortDiscriminator;
    }
    if ("vendorId" in identifier) {
        const vp = device.VP?.split("+");
        if (!vp) return false;
        const vendorMatch = VendorId(Number(vp[0])) === identifier.vendorId;
        if ("productId" in identifier && identifier.productId !== undefined) {
            return vendorMatch && Number(vp[1]) === identifier.productId;
        }
        return vendorMatch;
    }
    if ("deviceType" in identifier) {
        return device.DT === identifier.deviceType;
    }
    if ("productId" in identifier) {
        const vp = device.VP?.split("+");
        return vp ? Number(vp[1]) === (identifier as { productId: number }).productId : false;
    }
    // Empty identifier — match any commissioning mode
    return device.CM === 1 || device.CM === 2;
}

function matchesWaiterIdentifier(a: CommissionableDeviceIdentifiers, b: CommissionableDeviceIdentifiers): boolean {
    // Both are small flat objects — structural equality suffices
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false;
    }
    return true;
}

function getQueryQnames(identifier: CommissionableDeviceIdentifiers): string[] {
    const base = [MATTER_COMMISSION_SERVICE_QNAME];

    if ("instanceId" in identifier) {
        return [...base, getCommissionableDeviceQname(identifier.instanceId)];
    }
    if ("longDiscriminator" in identifier) {
        return [...base, getLongDiscriminatorQname(identifier.longDiscriminator)];
    }
    if ("shortDiscriminator" in identifier) {
        return [...base, getShortDiscriminatorQname(identifier.shortDiscriminator)];
    }
    if ("vendorId" in identifier) {
        return [...base, getVendorQname(identifier.vendorId)];
    }
    if ("deviceType" in identifier) {
        return [...base, getDeviceTypeQname(identifier.deviceType)];
    }
    return [...base, getCommissioningModeQname()];
}
