/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ChannelType,
    Diagnostic,
    DnsRecord,
    DnsRecordType,
    DnssdName,
    DnssdNames,
    IpService,
    ObserverGroup,
    Seconds,
    ServerAddressUdp,
} from "@matter/general";
import { VendorId } from "@matter/types";
import {
    CommissionableDevice,
    CommissionableDeviceIdentifiers,
    DiscoveryData,
    Scanner,
} from "../common/Scanner.js";
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
}

interface Waiter {
    notify(device: CommissionableDevice): void;
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
            return (
                lower === base1 ||
                lower.endsWith(suffix1) ||
                lower === base2 ||
                lower.endsWith(suffix2)
            );
        };

        names.addFilter(this.#filter);
        this.#observers.on(names.discovered, this.#onDiscovered.bind(this));
    }

    async close() {
        this.#names.removeFilter(this.#filter);
        this.#observers.close();
        for (const { ipService } of this.#cache.values()) {
            await ipService.close();
        }
        this.#cache.clear();
    }

    async findCommissionableDevices(
        identifier: CommissionableDeviceIdentifiers,
        timeout = Seconds(5),
        ignoreExistingRecords = false,
    ): Promise<CommissionableDevice[]> {
        if (!ignoreExistingRecords) {
            const existing = this.getDiscoveredCommissionableDevices(identifier);
            if (existing.length > 0) {
                return existing;
            }
        }

        const found: CommissionableDevice[] = [];
        const cancelSignal = new Promise<void>(resolve => setTimeout(() => resolve(), timeout));
        await this.findCommissionableDevicesContinuously(identifier, device => {
            found.push(device);
        }, timeout, cancelSignal);
        return found;
    }

    async findCommissionableDevicesContinuously(
        identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        timeout?: number,
        cancelSignal?: Promise<void>,
    ): Promise<CommissionableDevice[]> {
        this.#solicitQueries(identifier);

        const seen = new Set<string>();
        const result: CommissionableDevice[] = [];

        // Deliver cached matches immediately
        for (const { device } of this.#cache.values()) {
            if (matchesIdentifier(device, identifier)) {
                seen.add(device.deviceIdentifier);
                result.push(device);
                callback(device);
            }
        }

        // Register waiter for new discoveries
        const waiter: Waiter = {
            notify: device => {
                if (matchesIdentifier(device, identifier) && !seen.has(device.deviceIdentifier)) {
                    seen.add(device.deviceIdentifier);
                    result.push(device);
                    callback(device);
                }
            },
        };
        this.#waiters.add(waiter);

        try {
            await new Promise<void>(resolve => {
                let timer: ReturnType<typeof setTimeout> | undefined;
                if (timeout !== undefined) {
                    timer = setTimeout(() => resolve(), timeout);
                }
                if (cancelSignal) {
                    cancelSignal.then(() => {
                        if (timer !== undefined) clearTimeout(timer);
                        resolve();
                    });
                }
                if (timeout === undefined && !cancelSignal) {
                    resolve();
                }
            });
        } finally {
            this.#waiters.delete(waiter);
        }

        return result;
    }

    getDiscoveredCommissionableDevices(identifier: CommissionableDeviceIdentifiers): CommissionableDevice[] {
        return [...this.#cache.values()]
            .map(({ device }) => device)
            .filter(device => matchesIdentifier(device, identifier));
    }

    cancelCommissionableDeviceDiscovery(_identifier: CommissionableDeviceIdentifiers, _resolvePromise?: boolean) {
        // Cancellation is handled via cancelSignal in findCommissionableDevicesContinuously.
    }

    #onDiscovered(name: DnssdName) {
        const lower = name.qname.toLowerCase();
        if (!lower.endsWith("._matterc._udp.local") && !lower.endsWith("._matterd._udp.local")) {
            return;
        }
        if (this.#cache.has(lower)) {
            return;
        }

        const ipService = new IpService(name.qname, Diagnostic.via("commissionable-scanner"), this.#names);
        const device = buildCommissionableDevice(name, ipService);
        if (device === undefined) {
            void ipService.close();
            return;
        }

        this.#cache.set(lower, { device, ipService });

        for (const waiter of this.#waiters) {
            waiter.notify(device);
        }
    }

    #solicitQueries(identifier: CommissionableDeviceIdentifiers) {
        const solicitor = this.#names.solicitor;
        const qnames = getQueryQnames(identifier);
        for (const qname of qnames) {
            solicitor.solicit({
                name: this.#names.get(qname),
                recordTypes: [DnsRecordType.PTR],
            });
        }
    }
}

function buildCommissionableDevice(name: DnssdName, ipService: IpService): CommissionableDevice | undefined {
    const params = name.parameters;
    const D = Number(params.get("D"));
    const CM = Number(params.get("CM"));

    if (!isFinite(D) || !isFinite(CM)) {
        return undefined;
    }

    // Instance ID is the first label of the qname
    const instanceId = name.qname.split(".")[0];

    const dd = DiscoveryData(params);

    return {
        ...dd,
        deviceIdentifier: instanceId,
        D,
        CM,
        addresses: [...ipService.addresses] as ServerAddressUdp[],
    };
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
