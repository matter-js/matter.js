/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BasicSet,
    Bytes,
    ChannelType,
    Diagnostic,
    DnsCodec,
    DnsMessagePartiallyPreEncoded,
    DnsMessageType,
    DnsQuery,
    DnsRecord,
    DnsRecordClass,
    DnsRecordType,
    ImplementationError,
    InternalError,
    Lifespan,
    Logger,
    MAX_MDNS_MESSAGE_SIZE,
    Network,
    ObserverGroup,
    ServerAddressIp,
    SrvRecordValue,
    Time,
    Timer,
    UdpMulticastServer,
    createPromise,
    isIPv6,
} from "#general";
import { NodeId, VendorId } from "#types";
import {
    CommissionableDevice,
    CommissionableDeviceIdentifiers,
    DiscoveryData,
    OperationalDevice,
    Scanner,
} from "../common/Scanner.js";
import { Fabric } from "../fabric/Fabric.js";
import {
    MATTER_COMMISSION_SERVICE_QNAME,
    MATTER_SERVICE_QNAME,
    getCommissioningModeQname,
    getDeviceInstanceQname,
    getDeviceMatterQname,
    getDeviceTypeQname,
    getLongDiscriminatorQname,
    getShortDiscriminatorQname,
    getVendorQname,
} from "./MdnsConsts.js";
import { MDNS_BROADCAST_IPV4, MDNS_BROADCAST_IPV6, MDNS_BROADCAST_PORT } from "./MdnsServer.js";

const logger = Logger.get("MdnsScanner");

const MDNS_EXPIRY_GRACE_PERIOD_FACTOR = 1.05;

type MatterServerRecordWithExpire = ServerAddressIp & Lifespan;

/** Type for commissionable Device records including Lifespan details. */
type CommissionableDeviceRecordWithExpire = Omit<CommissionableDevice, "addresses"> &
    Lifespan & {
        addresses: Map<string, MatterServerRecordWithExpire>; // Override addresses type to include expiration
        instanceId: string; // instance ID
        SD: number; // Additional Field for Short discriminator
        V?: number; // Additional Field for Vendor ID
        P?: number; // Additional Field for Product ID
    };

/** Type for operational Device records including Lifespan details. */
type OperationalDeviceRecordWithExpire = Omit<OperationalDevice, "addresses"> &
    Lifespan & {
        addresses: Map<string, MatterServerRecordWithExpire>; // Override addresses type to include expiration
    };

/** Type for any DNS record with Lifespan (discoveredAt and ttl) details. */
type AnyDnsRecordWithExpiry = DnsRecord<any> & Lifespan;

/** Type for DNS answers with Address details structured for better direct access performance. */
type StructuredDnsAddressAnswers = {
    addressesV4?: Record<string, Map<string, AnyDnsRecordWithExpiry>>; // IPv4 Address record by name and value (IP)
    addressesV6?: Record<string, Map<string, AnyDnsRecordWithExpiry>>; // IPv6 Address record by name and value (IP)
};

/** Type for DNS answers with Lifespan details  structured for better direct access performance. */
type StructuredDnsAnswers = {
    operational?: Record<number, AnyDnsRecordWithExpiry[]>; // Operational Matter device records by recordType
    commissionable?: Record<number, AnyDnsRecordWithExpiry[]>; // Commissionable Matter device records by recordType
} & StructuredDnsAddressAnswers;

/** The initial number of seconds between two announcements. MDNS specs require 1-2 seconds, so lets use the middle. */
const START_ANNOUNCE_INTERVAL_SECONDS = 1.5;

/**
 * Interface to add criteria for MDNS discovery a node is interested in
 *
 * This interface is used to define criteria for mDNS scanner targets. It includes the information if commissionable
 * devices are relevant for the target and a list of operational targets. Operational targets can consist of operational
 * IDs and optional node IDs.
 *
 * When no commissionable devices are relevant and no operational targets are defined, it is not required to add a
 * criteria to the scanner.
 */
export interface MdnsScannerTargetCriteria {
    /** Are commissionable MDNS records relevant? */
    commissionable: boolean;

    /** List of operational targets. */
    operationalTargets: {
        operationalId: Uint8Array;
        nodeId?: NodeId;
    }[];
}

/**
 * This class implements the Scanner interface for a MDNS scanner via UDP messages in a IP based network. It sends out
 * queries to discover various types of Matter device types and listens for announcements.
 */
export class MdnsScanner implements Scanner {
    readonly type = ChannelType.UDP;

    static async create(network: Network, options?: { enableIpv4?: boolean; netInterface?: string }) {
        const { enableIpv4, netInterface } = options ?? {};
        return new MdnsScanner(
            await UdpMulticastServer.create({
                network,
                netInterface: netInterface,
                broadcastAddressIpv4: enableIpv4 ? MDNS_BROADCAST_IPV4 : undefined,
                broadcastAddressIpv6: MDNS_BROADCAST_IPV6,
                listeningPort: MDNS_BROADCAST_PORT,
            }),
            enableIpv4,
        );
    }

    /** Active announces by queryId with queries and known answers */
    readonly #activeAnnounceQueries = new Map<string, { queries: DnsQuery[]; answers: StructuredDnsAnswers }>();

    /** Known IP addresses by network interface */
    readonly #discoveredIpRecords = new Map<string, StructuredDnsAddressAnswers>();

    /** Known operational device records by Matter Qname */
    readonly #operationalDeviceRecords = new Map<string, OperationalDeviceRecordWithExpire>();

    /** Known commissionable device records by queryId */
    readonly #commissionableDeviceRecords = new Map<string, CommissionableDeviceRecordWithExpire>();

    /** Waiters for specific queryIds to resolve a promise when a record is discovered */
    readonly #recordWaiters = new Map<
        string,
        {
            resolver: () => void;
            timer?: Timer;
            resolveOnUpdatedRecords: boolean;
            cancelResolver?: (value: void) => void;
            commissionable: boolean;
        }
    >();

    #queryTimer?: Timer;
    #nextAnnounceIntervalSeconds = START_ANNOUNCE_INTERVAL_SECONDS;
    readonly #periodicTimer: Timer;
    #closing = false;
    readonly #multicastServer: UdpMulticastServer;
    readonly #enableIpv4?: boolean;

    readonly #targetCriteriaProviders = new BasicSet<MdnsScannerTargetCriteria>();
    #scanForCommissionableDevices = false;
    #hasCommissionableWaiters = false;
    readonly #operationalScanTargets = new Set<string>();
    readonly #observers = new ObserverGroup();

    /** True, if any node is interested in MDNS traffic, else we ignore all traffic */
    #listening = false;

    constructor(multicastServer: UdpMulticastServer, enableIpv4?: boolean) {
        multicastServer.onMessage((message, remoteIp, netInterface) =>
            this.#handleDnsMessage(message, remoteIp, netInterface),
        );
        this.#multicastServer = multicastServer;
        this.#enableIpv4 = enableIpv4;
        this.#periodicTimer = Time.getPeriodicTimer("Discovered node expiration", 60 * 1000 /* 1 mn */, () =>
            this.#expire(),
        ).start();

        this.#observers.on(this.#targetCriteriaProviders.added, () => this.#handleChangedScanTargets());
        this.#observers.on(this.#targetCriteriaProviders.deleted, () => this.#handleChangedScanTargets());
    }

    /** Set to add or delete criteria for MDNS discovery */
    get targetCriteriaProviders() {
        return this.#targetCriteriaProviders;
    }

    #handleChangedScanTargets() {
        this.#updateScanTargets();
        logger.info(
            "MDNS Scan targets updated :",
            `commissionable = ${this.#scanForCommissionableDevices}`,
            "Targets:",
            this.#operationalScanTargets,
        );
    }

    /** Update the MDNS scan criteria state and collect the desired operational targets */
    #updateScanTargets() {
        if (this.#closing) {
            return;
        }

        // Add all operational targets from the criteria providers
        this.#operationalScanTargets.clear();
        let cacheCommissionableDevices = false;
        for (const criteria of this.#targetCriteriaProviders) {
            const { operationalTargets, commissionable } = criteria;
            cacheCommissionableDevices = cacheCommissionableDevices || commissionable;
            for (const { operationalId, nodeId } of operationalTargets) {
                const operationalIdString = Bytes.toHex(operationalId).toUpperCase();
                if (nodeId === undefined) {
                    this.#operationalScanTargets.add(operationalIdString);
                } else {
                    this.#operationalScanTargets.add(`${operationalIdString}-${NodeId.toHexString(nodeId)}`);
                }
            }
        }
        this.#scanForCommissionableDevices = cacheCommissionableDevices;

        // Register all operational targets for running queries
        for (const queryId of this.#recordWaiters.keys()) {
            this.#registerOperationalQuery(queryId);
        }
        this.#updateListeningStatus();
    }

    /** Update the status of we care about MDNS messages or not */
    #updateListeningStatus() {
        const formerListenStatus = this.#listening;
        // Are we interested in MDNS traffic or not?
        this.#listening =
            this.#scanForCommissionableDevices ||
            this.#operationalScanTargets.size > 0 ||
            this.#recordWaiters.size > 0 ||
            this.#activeAnnounceQueries.size > 0;
        if (!this.#listening) {
            this.#discoveredIpRecords.clear();
            this.#operationalDeviceRecords.clear();
            this.#commissionableDeviceRecords.clear();
        }
        if (this.#listening !== formerListenStatus) {
            logger.debug(`MDNS Scanner ${this.#listening ? "started" : "stopped"} listening for MDNS messages`);
        }
    }

    #effectiveTTL(ttl: number) {
        return Math.ceil(ttl * MDNS_EXPIRY_GRACE_PERIOD_FACTOR);
    }

    /**
     * Sends out one DNS-SD query for all collected announce records and start a timer for the next query with doubled
     * interval, maximum 60min, as per MDNS specs. The already known answers are tried to be sent in the query as long
     * as they fit into a maximum 1500 byte long packet (as defined in MDNS specs), else they are split into more
     * packets and the query is sent as Truncated query.
     */
    async #sendQueries() {
        this.#queryTimer?.stop();
        const allQueries = Array.from(this.#activeAnnounceQueries.values());
        const queries = allQueries.flatMap(({ queries }) => queries);
        const answers = allQueries.flatMap(({ answers }) =>
            Object.values(answers).flatMap(answer =>
                Object.values(answer).flatMap(records => (Array.isArray(records) ? records : records.values())),
            ),
        );

        this.#queryTimer = Time.getTimer("MDNS discovery", this.#nextAnnounceIntervalSeconds * 1000, () =>
            this.#sendQueries(),
        ).start();

        logger.debug(
            `Sending ${queries.length} query records for ${this.#activeAnnounceQueries.size} queries with ${answers.length} known answers. Re-Announce in ${this.#nextAnnounceIntervalSeconds} seconds`,
        );

        const nextAnnounceInterval = this.#nextAnnounceIntervalSeconds * 2;
        this.#nextAnnounceIntervalSeconds = Math.min(nextAnnounceInterval, 60 * 60 /* 1 hour */);

        const answersToSend = [...answers];

        const dnsMessageDataToSend = {
            messageType: DnsMessageType.TruncatedQuery,
            transactionId: 0,
            queries,
            authorities: [],
            answers: [],
            additionalRecords: [],
        } as DnsMessagePartiallyPreEncoded;

        const emptyDnsMessage = DnsCodec.encode(dnsMessageDataToSend);
        let dnsMessageSize = emptyDnsMessage.length;

        while (true) {
            if (answersToSend.length > 0) {
                const nextAnswer = answersToSend.shift();
                if (nextAnswer === undefined) {
                    break;
                }

                const nextAnswerEncoded = DnsCodec.encodeRecord(nextAnswer);
                dnsMessageSize += nextAnswerEncoded.length; // Add additional record as long as size is ok

                if (dnsMessageSize > MAX_MDNS_MESSAGE_SIZE) {
                    if (dnsMessageDataToSend.answers.length === 0) {
                        // The first answer is already too big, log at least a warning
                        logger.warn(
                            `MDNS Query with ${Diagnostic.json(
                                queries,
                            )} is too big to fit into a single MDNS message. Send anyway, but please report!`,
                        );
                    }
                    // New answer do not fit anymore, send out the message
                    await this.#multicastServer.send(DnsCodec.encode(dnsMessageDataToSend));

                    // Reset the message, length counter and included answers to count for next message
                    dnsMessageDataToSend.queries.length = 0;
                    dnsMessageDataToSend.answers.length = 0;
                    dnsMessageSize = emptyDnsMessage.length + nextAnswerEncoded.length;
                }
                dnsMessageDataToSend.answers.push(nextAnswerEncoded);
            } else {
                break;
            }
        }

        await this.#multicastServer.send(
            DnsCodec.encode({ ...dnsMessageDataToSend, messageType: DnsMessageType.Query }),
        );
    }

    /**
     * Set new DnsQuery records to the list of active queries to discover devices in the network and start sending them
     * out. When entry already exists the query is overwritten and answers are always added.
     */
    #setQueryRecords(queryId: string, queries: DnsQuery[], answers: StructuredDnsAnswers = {}) {
        const activeExistingQuery = this.#activeAnnounceQueries.get(queryId);
        if (activeExistingQuery) {
            const { queries: existingQueries } = activeExistingQuery;
            const newQueries = queries.filter(
                query =>
                    !existingQueries.some(
                        existingQuery =>
                            existingQuery.name === query.name &&
                            existingQuery.recordType === query.recordType &&
                            existingQuery.recordClass === query.recordClass,
                    ),
            );
            if (newQueries.length === 0) {
                // All queries already sent out
                logger.debug(
                    `No new query records for query ${queryId}, keeping existing queries and do not re-announce.`,
                );
                return;
            }
            queries = [...newQueries, ...existingQueries];
            answers = this.#combineStructuredAnswers(activeExistingQuery.answers, answers);
        }
        this.#activeAnnounceQueries.set(queryId, { queries, answers });
        logger.debug(`Set ${queries.length} query records for query ${queryId}: ${Diagnostic.json(queries)}`);
        this.#queryTimer?.stop();
        this.#nextAnnounceIntervalSeconds = START_ANNOUNCE_INTERVAL_SECONDS; // Reset query interval
        this.#queryTimer = Time.getTimer("MDNS discovery", 0, () => this.#sendQueries()).start();
    }

    /**
     * Combines the known answers from all active queries and the known IP addresses from the network
     * interface into one data package
     */
    #getActiveQueryEarlierAnswers(netInterface: string) {
        return this.#combineStructuredAnswers(
            ...[...this.#activeAnnounceQueries.values()].map(({ answers }) => answers),
            this.#discoveredIpRecords.get(netInterface) ?? {},
        );
    }

    /**
     * Remove a query from the list of active queries because discovery has finished or timed out and stop sending it
     * out. If it was the last query announcing will stop completely.
     */
    #removeQuery(queryId: string) {
        this.#activeAnnounceQueries.delete(queryId);
        if (this.#activeAnnounceQueries.size === 0) {
            logger.debug(`Removing last query ${queryId} and stopping announce timer`);
            this.#queryTimer?.stop();
            this.#nextAnnounceIntervalSeconds = START_ANNOUNCE_INTERVAL_SECONDS;
        } else {
            logger.debug(`Removing query ${queryId}`);
        }
    }

    /**
     * Returns the list of all targets (IP/port) discovered for a queried operational device record.
     */
    #getOperationalDeviceRecords(deviceMatterQname: string): OperationalDevice | undefined {
        const device = this.#operationalDeviceRecords.get(deviceMatterQname);
        if (device === undefined) {
            return undefined;
        }
        const { addresses } = device;
        if (addresses.size === 0) {
            return undefined;
        }
        return {
            ...device,
            addresses: this.#sortServerEntries(Array.from(addresses.values())).map(({ ip, port }) => ({
                ip,
                port,
                type: "udp",
            })) as ServerAddressIp[],
        };
    }

    /**
     * Sort the list of found IP/ports and make sure link-local IPv6 addresses come first, IPv6 next and IPv4 last.
     *
     * @param entries
     */
    #sortServerEntries(entries: MatterServerRecordWithExpire[]) {
        return entries.sort((a, b) => {
            const aIsIPv6 = isIPv6(a.ip);
            const bIsIPv6 = isIPv6(b.ip);

            if (aIsIPv6 && !bIsIPv6) {
                return -1; // IPv6 comes first
            } else if (!aIsIPv6 && bIsIPv6) {
                return 1; // IPv4 comes after IPv6
            } else if (aIsIPv6 && bIsIPv6) {
                if (a.ip.startsWith("fd") && !b.ip.startsWith("fd")) {
                    return -1; // addresses starting with "fd" come before other IPv6 addresses
                } else if (!a.ip.startsWith("fd") && b.ip.startsWith("fd")) {
                    return 1; // addresses starting with "fd" come after other IPv6 addresses
                } else if (a.ip.startsWith("fe80:") && !b.ip.startsWith("fe80:")) {
                    return -1; // link-local IPv6 comes before other global IPv6 addresses
                } else if (!a.ip.startsWith("fe80:") && b.ip.startsWith("fe80:")) {
                    return 1; // link-local IPv6 comes after other global IPv6 addresses
                }
            }
            return 0; // no preference
        });
    }

    #registerOperationalQuery(queryId: string) {
        const separator = queryId.indexOf(".");
        if (separator !== -1) {
            this.#operationalScanTargets.add(queryId.substring(0, separator));
        } else {
            throw new InternalError(`Invalid queryId ${queryId} for operational device, no separator found`);
        }
    }

    /**
     * Registers a deferred promise for a specific queryId together with a timeout and return the promise.
     * The promise will be resolved when the timer runs out latest.
     */
    async #registerWaiterPromise(
        queryId: string,
        commissionable: boolean,
        timeoutSeconds?: number,
        resolveOnUpdatedRecords = true,
        cancelResolver?: (value: void) => void,
    ) {
        const { promise, resolver } = createPromise<void>();
        const timer =
            timeoutSeconds !== undefined
                ? Time.getTimer("MDNS timeout", timeoutSeconds * 1000, () => {
                      cancelResolver?.();
                      this.#finishWaiter(queryId, true);
                  }).start()
                : undefined;
        this.#listening = true;
        this.#recordWaiters.set(queryId, { resolver, timer, resolveOnUpdatedRecords, cancelResolver, commissionable });
        this.#hasCommissionableWaiters = this.#hasCommissionableWaiters || commissionable;
        if (!commissionable) {
            this.#registerOperationalQuery(queryId);
        }
        logger.debug(
            `Registered waiter for query ${queryId} with ${
                timeoutSeconds !== undefined ? `timeout ${timeoutSeconds} seconds` : "no timeout"
            }${resolveOnUpdatedRecords ? "" : " (not resolving on updated records)"}`,
        );
        await promise;
    }

    /**
     * Remove a waiter promise for a specific queryId and stop the connected timer. If required also resolve the
     * promise.
     */
    #finishWaiter(queryId: string, resolvePromise: boolean, isUpdatedRecord = false) {
        const waiter = this.#recordWaiters.get(queryId);
        if (waiter === undefined) return;
        const { timer, resolver, resolveOnUpdatedRecords, commissionable } = waiter;
        if (isUpdatedRecord && !resolveOnUpdatedRecords) return;
        logger.debug(`Finishing waiter for query ${queryId}, resolving: ${resolvePromise}`);
        timer?.stop();
        if (resolvePromise) {
            resolver();
        }
        this.#recordWaiters.delete(queryId);
        this.#removeQuery(queryId);

        if (!this.#closing) {
            // We removed a waiter, so update what we still have left
            this.#hasCommissionableWaiters = false;
            let hasOperationalWaiters = false;
            for (const { commissionable } of this.#recordWaiters.values()) {
                if (commissionable) {
                    this.#hasCommissionableWaiters = true;
                    if (hasOperationalWaiters) {
                        break; // No need to check further
                    }
                } else {
                    hasOperationalWaiters = true;
                    if (this.#hasCommissionableWaiters) {
                        break; // No need to check further
                    }
                }
            }

            if (!commissionable) {
                // We removed an operational device waiter, so we need to update the scan targets
                this.#updateScanTargets();
            } else {
                this.#updateListeningStatus();
            }
        }
    }

    /** Returns weather a waiter promise is registered for a specific queryId. */
    #hasWaiter(queryId: string) {
        return this.#recordWaiters.has(queryId);
    }

    #createOperationalMatterQName(operationalId: Uint8Array, nodeId: NodeId) {
        const operationalIdString = Bytes.toHex(operationalId).toUpperCase();
        return getDeviceMatterQname(operationalIdString, NodeId.toHexString(nodeId));
    }

    /**
     * Method to find an operational device (already commissioned) and return a promise with the list of discovered
     * IP/ports or an empty array if not found.
     */
    async findOperationalDevice(
        { operationalId }: Fabric,
        nodeId: NodeId,
        timeoutSeconds?: number,
        ignoreExistingRecords = false,
    ): Promise<OperationalDevice | undefined> {
        if (this.#closing) {
            throw new ImplementationError("Cannot discover operational device because scanner is closing.");
        }
        const deviceMatterQname = this.#createOperationalMatterQName(operationalId, nodeId);

        let storedDevice = ignoreExistingRecords ? undefined : this.#getOperationalDeviceRecords(deviceMatterQname);
        if (storedDevice === undefined) {
            const promise = this.#registerWaiterPromise(deviceMatterQname, false, timeoutSeconds);

            this.#setQueryRecords(deviceMatterQname, [
                {
                    name: deviceMatterQname,
                    recordClass: DnsRecordClass.IN,
                    recordType: DnsRecordType.SRV,
                },
            ]);

            await promise;
            storedDevice = this.#getOperationalDeviceRecords(deviceMatterQname);
        }
        return storedDevice;
    }

    cancelOperationalDeviceDiscovery(fabric: Fabric, nodeId: NodeId, resolvePromise = true) {
        const deviceMatterQname = this.#createOperationalMatterQName(fabric.operationalId, nodeId);
        this.#finishWaiter(deviceMatterQname, resolvePromise);
    }

    cancelCommissionableDeviceDiscovery(identifier: CommissionableDeviceIdentifiers, resolvePromise = true) {
        const queryId = this.#buildCommissionableQueryIdentifier(identifier);
        const { cancelResolver } = this.#recordWaiters.get(queryId) ?? {};
        // Mark as canceled to not loop further in discovery, if cancel-resolver is used
        cancelResolver?.();
        this.#finishWaiter(queryId, resolvePromise);
    }

    getDiscoveredOperationalDevice({ operationalId }: Fabric, nodeId: NodeId) {
        return this.#getOperationalDeviceRecords(this.#createOperationalMatterQName(operationalId, nodeId));
    }

    /**
     * Returns the metadata and list of all target addresses (IP/port) discovered for a queried commissionable device
     * record.
     */
    #getCommissionableDeviceRecords(identifier: CommissionableDeviceIdentifiers) {
        const storedRecords = Array.from(this.#commissionableDeviceRecords.values());

        const foundRecords = new Array<CommissionableDeviceRecordWithExpire>();
        if ("instanceId" in identifier) {
            foundRecords.push(...storedRecords.filter(({ instanceId }) => instanceId === identifier.instanceId));
        } else if ("longDiscriminator" in identifier) {
            foundRecords.push(...storedRecords.filter(({ D }) => D === identifier.longDiscriminator));
        } else if ("shortDiscriminator" in identifier) {
            foundRecords.push(...storedRecords.filter(({ SD }) => SD === identifier.shortDiscriminator));
        } else if ("vendorId" in identifier && "productId" in identifier) {
            foundRecords.push(
                ...storedRecords.filter(({ V, P }) => V === identifier.vendorId && P === identifier.productId),
            );
        } else if ("vendorId" in identifier) {
            foundRecords.push(...storedRecords.filter(({ V }) => V === identifier.vendorId));
        } else if ("deviceType" in identifier) {
            foundRecords.push(...storedRecords.filter(({ DT }) => DT === identifier.deviceType));
        } else if ("productId" in identifier) {
            foundRecords.push(...storedRecords.filter(({ P }) => P === identifier.productId));
        } else if (Object.keys(identifier).length === 0) {
            foundRecords.push(...storedRecords.filter(({ CM }) => CM === 1 || CM === 2));
        }

        return foundRecords
            .filter(({ addresses }) => addresses.size > 0)
            .map(record => {
                return {
                    ...record,
                    addresses: this.#sortServerEntries(Array.from(record.addresses.values())).map(({ ip, port }) => ({
                        ip,
                        port,
                        type: "udp",
                    })) as ServerAddressIp[],
                    discoveredAt: undefined,
                    ttl: undefined,
                };
            });
    }

    /**
     * Builds an identifier string for commissionable queries based on the given identifier object.
     * Some identifiers are identical to the official DNS-SD identifiers, others are custom.
     */
    #buildCommissionableQueryIdentifier(identifier: CommissionableDeviceIdentifiers) {
        if ("instanceId" in identifier) {
            return getDeviceInstanceQname(identifier.instanceId);
        }

        if ("longDiscriminator" in identifier) {
            return getLongDiscriminatorQname(identifier.longDiscriminator);
        }

        if ("shortDiscriminator" in identifier) {
            return getShortDiscriminatorQname(identifier.shortDiscriminator);
        }

        if ("vendorId" in identifier && "productId" in identifier) {
            // Custom identifier because normally productId is only included in TXT record
            return `_VP${identifier.vendorId}+${identifier.productId}`;
        }

        if ("vendorId" in identifier) {
            return getVendorQname(identifier.vendorId);
        }

        if ("deviceType" in identifier) {
            return getDeviceTypeQname(identifier.deviceType);
        }

        if ("productId" in identifier) {
            // Custom identifier because normally productId is only included in TXT record
            return `_P${identifier.productId}`;
        }

        return getCommissioningModeQname();
    }

    #extractInstanceId(instanceName: string) {
        const instanceNameSeparator = instanceName.indexOf(".");
        if (instanceNameSeparator !== -1) {
            return instanceName.substring(0, instanceNameSeparator);
        }
        return instanceName;
    }

    /**
     * Check all options for a query identifier and return the most relevant one with an active query
     */
    #findCommissionableQueryIdentifier(instanceName: string, record: CommissionableDeviceRecordWithExpire) {
        if (this.#closing) {
            throw new ImplementationError("Cannot discover commissionable device because scanner is closing.");
        }
        const instanceQueryId = this.#buildCommissionableQueryIdentifier({
            instanceId: this.#extractInstanceId(instanceName),
        });
        if (this.#activeAnnounceQueries.has(instanceQueryId)) {
            return instanceQueryId;
        }

        const longDiscriminatorQueryId = this.#buildCommissionableQueryIdentifier({ longDiscriminator: record.D });
        if (this.#activeAnnounceQueries.has(longDiscriminatorQueryId)) {
            return longDiscriminatorQueryId;
        }

        const shortDiscriminatorQueryId = this.#buildCommissionableQueryIdentifier({ shortDiscriminator: record.SD });
        if (this.#activeAnnounceQueries.has(shortDiscriminatorQueryId)) {
            return shortDiscriminatorQueryId;
        }

        if (record.V !== undefined && record.P !== undefined) {
            const vendorProductIdQueryId = this.#buildCommissionableQueryIdentifier({
                vendorId: VendorId(record.V),
                productId: record.P,
            });
            if (this.#activeAnnounceQueries.has(vendorProductIdQueryId)) {
                return vendorProductIdQueryId;
            }
        }

        if (record.V !== undefined) {
            const vendorIdQueryId = this.#buildCommissionableQueryIdentifier({ vendorId: VendorId(record.V) });
            if (this.#activeAnnounceQueries.has(vendorIdQueryId)) {
                return vendorIdQueryId;
            }
        }

        if (record.DT !== undefined) {
            const deviceTypeQueryId = this.#buildCommissionableQueryIdentifier({ deviceType: record.DT });
            if (this.#activeAnnounceQueries.has(deviceTypeQueryId)) {
                return deviceTypeQueryId;
            }
        }

        if (record.P !== undefined) {
            const productIdQueryId = this.#buildCommissionableQueryIdentifier({ productId: record.P });
            if (this.#activeAnnounceQueries.has(productIdQueryId)) {
                return productIdQueryId;
            }
        }

        const commissioningModeQueryId = this.#buildCommissionableQueryIdentifier({});
        if (this.#activeAnnounceQueries.has(commissioningModeQueryId)) {
            return commissioningModeQueryId;
        }

        return undefined;
    }

    #getCommissionableQueryRecords(identifier: CommissionableDeviceIdentifiers): DnsQuery[] {
        const names = new Array<string>();

        names.push(MATTER_COMMISSION_SERVICE_QNAME);

        if ("instanceId" in identifier) {
            names.push(getDeviceInstanceQname(identifier.instanceId));
        } else if ("longDiscriminator" in identifier) {
            names.push(getLongDiscriminatorQname(identifier.longDiscriminator));
        } else if ("shortDiscriminator" in identifier) {
            names.push(getShortDiscriminatorQname(identifier.shortDiscriminator));
        } else if ("vendorId" in identifier) {
            names.push(getVendorQname(identifier.vendorId));
        } else if ("deviceType" in identifier) {
            names.push(getDeviceTypeQname(identifier.deviceType));
        } else {
            // Other queries just scan for commissionable devices
            names.push(getCommissioningModeQname());
        }

        return names.map(name => ({ name, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.PTR }));
    }

    /**
     * Discovers commissionable devices based on a defined identifier for maximal given timeout, but returns the
     * first found entries. If already a discovered device matches in the cache the response is returned directly and
     * no query is triggered. If no record exists a query is sent out and the promise gets fulfilled as soon as at least
     * one device is found. If no device is discovered in the defined timeframe an empty array is returned. When the
     * promise got fulfilled no more queries are send out, but more device entries might be added when discovered later.
     * These can be requested by the getCommissionableDevices method.
     */
    async findCommissionableDevices(
        identifier: CommissionableDeviceIdentifiers,
        timeoutSeconds = 5,
        ignoreExistingRecords = false,
    ): Promise<CommissionableDevice[]> {
        let storedRecords = ignoreExistingRecords
            ? []
            : this.#getCommissionableDeviceRecords(identifier).filter(({ addresses }) => addresses.length > 0);
        if (storedRecords.length === 0) {
            const queryId = this.#buildCommissionableQueryIdentifier(identifier);
            const promise = this.#registerWaiterPromise(queryId, true, timeoutSeconds);

            this.#setQueryRecords(queryId, this.#getCommissionableQueryRecords(identifier));

            await promise;
            storedRecords = this.#getCommissionableDeviceRecords(identifier);
        }

        return storedRecords;
    }

    /**
     * Discovers commissionable devices based on a defined identifier and returns the first found entries.
     * If an own cancelSignal promise is used the discovery can only be cancelled via this signal!
     */
    async findCommissionableDevicesContinuously(
        identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        timeoutSeconds?: number,
        cancelSignal?: Promise<void>,
    ): Promise<CommissionableDevice[]> {
        const discoveredDevices = new Set<string>();

        const discoveryEndTime = timeoutSeconds ? Time.nowMs() + timeoutSeconds * 1000 : undefined;
        const queryId = this.#buildCommissionableQueryIdentifier(identifier);
        this.#setQueryRecords(queryId, this.#getCommissionableQueryRecords(identifier));

        let queryResolver: ((value: void) => void) | undefined;
        if (cancelSignal === undefined) {
            const { promise, resolver } = createPromise<void>();
            cancelSignal = promise;
            queryResolver = resolver;
        }

        let canceled = false;
        cancelSignal?.then(
            () => {
                canceled = true;
                if (queryResolver === undefined) {
                    // Always finish when cancelSignal parameter was used, else cancelling is done separately
                    this.#finishWaiter(queryId, true);
                }
            },
            cause => {
                logger.error("Unexpected error canceling commissioning", cause);
            },
        );

        while (!canceled) {
            this.#getCommissionableDeviceRecords(identifier).forEach(device => {
                const { deviceIdentifier } = device;
                if (!discoveredDevices.has(deviceIdentifier)) {
                    discoveredDevices.add(deviceIdentifier);
                    callback(device);
                }
            });

            let remainingTime;
            if (discoveryEndTime !== undefined) {
                remainingTime = Math.ceil((discoveryEndTime - Time.nowMs()) / 1000);
                if (remainingTime <= 0) {
                    break;
                }
            }
            await this.#registerWaiterPromise(queryId, true, remainingTime, false, queryResolver);
        }
        return this.#getCommissionableDeviceRecords(identifier);
    }

    getDiscoveredCommissionableDevices(identifier: CommissionableDeviceIdentifiers) {
        return this.#getCommissionableDeviceRecords(identifier);
    }

    /**
     * Close all connects, end all timers and resolve all pending promises.
     */
    async close() {
        this.#closing = true;
        this.#observers.close();
        this.#periodicTimer.stop();
        this.#queryTimer?.stop();
        await this.#multicastServer.close();
        // Resolve all pending promises where logic waits for the response (aka: has a timer)
        [...this.#recordWaiters.keys()].forEach(queryId =>
            this.#finishWaiter(queryId, !!this.#recordWaiters.get(queryId)?.timer),
        );
    }

    /** Converts the discovery data into a structured format for performant access. */
    #structureAnswers(...answersList: DnsRecord<any>[][]): StructuredDnsAnswers {
        const structuredAnswers: StructuredDnsAnswers = {};

        const discoveredAt = Time.nowMs();
        answersList.forEach(answers =>
            answers.forEach(answer => {
                const { name, recordType } = answer;
                if (name.endsWith(MATTER_SERVICE_QNAME)) {
                    structuredAnswers.operational = structuredAnswers.operational ?? {};
                    structuredAnswers.operational[recordType] = structuredAnswers.operational[recordType] ?? [];
                    structuredAnswers.operational[recordType].push({
                        discoveredAt,
                        ...answer,
                    });
                } else if (name.endsWith(MATTER_COMMISSION_SERVICE_QNAME)) {
                    structuredAnswers.commissionable = structuredAnswers.commissionable ?? {};
                    structuredAnswers.commissionable[recordType] = structuredAnswers.commissionable[recordType] ?? [];
                    structuredAnswers.commissionable[recordType].push({
                        discoveredAt,
                        ...answer,
                    });
                } else if (recordType === DnsRecordType.AAAA) {
                    structuredAnswers.addressesV6 = structuredAnswers.addressesV6 ?? {};
                    structuredAnswers.addressesV6[name] = structuredAnswers.addressesV6[name] ?? new Map();
                    structuredAnswers.addressesV6[name].set(answer.value, {
                        discoveredAt,
                        ...answer,
                    });
                } else if (this.#enableIpv4 && recordType === DnsRecordType.A) {
                    structuredAnswers.addressesV4 = structuredAnswers.addressesV4 ?? {};
                    structuredAnswers.addressesV4[name] = structuredAnswers.addressesV4[name] ?? new Map();
                    structuredAnswers.addressesV4[name].set(answer.value, {
                        discoveredAt,
                        ...answer,
                    });
                }
            }),
        );

        return structuredAnswers;
    }

    #combineStructuredAnswers(...answersList: StructuredDnsAnswers[]): StructuredDnsAnswers {
        // Special type for easier combination of answers
        const combinedAnswers: {
            operational?: Record<number, Map<string, AnyDnsRecordWithExpiry>>;
            commissionable?: Record<number, Map<string, AnyDnsRecordWithExpiry>>;
            addressesV4?: Record<string, Map<string, AnyDnsRecordWithExpiry>>;
            addressesV6?: Record<string, Map<string, AnyDnsRecordWithExpiry>>;
        } = {};

        for (const answers of answersList) {
            if (answers.operational) {
                combinedAnswers.operational = combinedAnswers.operational ?? {};
                for (const [recordType, records] of Object.entries(answers.operational) as unknown as [
                    number,
                    AnyDnsRecordWithExpiry[],
                ][]) {
                    combinedAnswers.operational[recordType] = combinedAnswers.operational[recordType] ?? new Map();
                    records.forEach(record => {
                        const existingRecord = combinedAnswers.operational![recordType].get(record.name);
                        if (existingRecord && existingRecord.discoveredAt < record.discoveredAt) {
                            if (record.ttl === 0) {
                                combinedAnswers.operational![recordType].delete(record.name);
                            } else {
                                combinedAnswers.operational![recordType].set(record.name, record);
                            }
                        }
                    });
                }
            }
            if (answers.commissionable) {
                combinedAnswers.commissionable = combinedAnswers.commissionable ?? {};
                for (const [recordType, records] of Object.entries(answers.commissionable) as unknown as [
                    number,
                    AnyDnsRecordWithExpiry[],
                ][]) {
                    combinedAnswers.commissionable[recordType] =
                        combinedAnswers.commissionable[recordType] ?? new Map();
                    records.forEach(record => {
                        const existingRecord = combinedAnswers.commissionable![recordType].get(record.name);
                        if (existingRecord && existingRecord.discoveredAt < record.discoveredAt) {
                            if (record.ttl === 0) {
                                combinedAnswers.commissionable![recordType].delete(record.name);
                            } else {
                                combinedAnswers.commissionable![recordType].set(record.name, record);
                            }
                        }
                    });
                }
            }
            if (answers.addressesV6) {
                combinedAnswers.addressesV6 = combinedAnswers.addressesV6 ?? {};
                for (const [name, records] of Object.entries(answers.addressesV6) as unknown as [
                    string,
                    Map<string, AnyDnsRecordWithExpiry>,
                ][]) {
                    combinedAnswers.addressesV6[name] = combinedAnswers.addressesV6[name] ?? new Map();
                    Object.values(records).forEach(record => {
                        const existingRecord = combinedAnswers.addressesV6![name].get(record.value);
                        if (existingRecord && existingRecord.discoveredAt < record.discoveredAt) {
                            if (record.ttl === 0) {
                                combinedAnswers.addressesV6![name].delete(name);
                            } else {
                                combinedAnswers.addressesV6![name].set(name, record);
                            }
                        }
                    });
                }
            }
            if (this.#enableIpv4 && answers.addressesV4) {
                combinedAnswers.addressesV4 = combinedAnswers.addressesV4 ?? {};
                for (const [name, records] of Object.entries(answers.addressesV4) as unknown as [
                    string,
                    Map<string, AnyDnsRecordWithExpiry>,
                ][]) {
                    combinedAnswers.addressesV4[name] = combinedAnswers.addressesV4[name] ?? new Map();
                    Object.values(records).forEach(record => {
                        const existingRecord = combinedAnswers.addressesV4![name].get(record.value);
                        if (existingRecord && existingRecord.discoveredAt < record.discoveredAt) {
                            if (record.ttl === 0) {
                                combinedAnswers.addressesV4![name].delete(name);
                            } else {
                                combinedAnswers.addressesV4![name].set(name, record);
                            }
                        }
                    });
                }
            }
        }

        const result: StructuredDnsAnswers = {};
        if (combinedAnswers.operational) {
            result.operational = Object.fromEntries(
                Object.entries(combinedAnswers.operational).map(([recordType, records]) => [
                    recordType,
                    Array.from(records.values()),
                ]),
            );
        }
        if (combinedAnswers.commissionable) {
            result.commissionable = Object.fromEntries(
                Object.entries(combinedAnswers.commissionable).map(([recordType, records]) => [
                    recordType,
                    Array.from(records.values()),
                ]),
            );
        }
        if (combinedAnswers.addressesV6) {
            result.addressesV6 = combinedAnswers.addressesV6;
        }
        if (this.#enableIpv4 && combinedAnswers.addressesV4) {
            result.addressesV4 = combinedAnswers.addressesV4;
        }

        return result;
    }

    /**
     * Main method to handle all incoming DNS messages.
     * It will parse the message and check if it contains relevant discovery records.
     */
    #handleDnsMessage(messageBytes: Uint8Array, _remoteIp: string, netInterface: string) {
        if (this.#closing) return;
        const message = DnsCodec.decode(messageBytes);
        if (message === undefined) return; // The message cannot be parsed
        if (!DnsMessageType.isResponse(message.messageType)) return;

        const answers = this.#structureAnswers([...message.answers, ...message.additionalRecords]);

        const formerAnswers = this.#getActiveQueryEarlierAnswers(netInterface);
        // Check if we got operational discovery records and handle them
        this.#handleOperationalRecords(answers, formerAnswers, netInterface);

        // Else check if we got commissionable discovery records and handle them
        this.#handleCommissionableRecords(answers, formerAnswers, netInterface);

        this.#updateIpRecords(answers, netInterface);
    }

    /**
     * Update the discovered matter relevant IP records with the new data from the DNS message.
     */
    #updateIpRecords(answers: StructuredDnsAnswers, netInterface: string) {
        const interfaceRecords = this.#discoveredIpRecords.get(netInterface);
        if (interfaceRecords === undefined) {
            return;
        }
        let updated = false;
        if (answers.addressesV6) {
            for (const [target, ipAddresses] of Object.entries(answers.addressesV6)) {
                if (interfaceRecords.addressesV6?.[target] !== undefined) {
                    for (const [ip, record] of Object.entries(ipAddresses)) {
                        if (record.ttl === 0) {
                            interfaceRecords.addressesV6[target].delete(ip);
                        } else {
                            interfaceRecords.addressesV6[target].set(ip, record);
                        }
                        updated = true;
                    }
                }
            }
        }
        if (this.#enableIpv4 && answers.addressesV4) {
            for (const [target, ipAddresses] of Object.entries(answers.addressesV4)) {
                if (interfaceRecords.addressesV4?.[target] !== undefined) {
                    for (const [ip, record] of Object.entries(ipAddresses)) {
                        if (record.ttl === 0) {
                            interfaceRecords.addressesV4[target].delete(ip);
                        } else {
                            interfaceRecords.addressesV4[target].set(ip, record);
                        }
                        updated = true;
                    }
                }
            }
        }
        if (updated) {
            this.#discoveredIpRecords.set(netInterface, interfaceRecords);
        }
    }

    /**
     * Register Matter relevant IP records for later usage.
     */
    #registerIpRecords(ipAddresses: AnyDnsRecordWithExpiry[], netInterface: string) {
        const interfaceRecords = this.#discoveredIpRecords.get(netInterface) ?? {};
        for (const record of ipAddresses) {
            const { recordType, name, value: ip, ttl } = record as DnsRecord<string>;
            if (ttl === 0) continue; // Skip records with ttl=0
            if (recordType === DnsRecordType.AAAA) {
                interfaceRecords.addressesV6 = interfaceRecords.addressesV6 ?? {};
                interfaceRecords.addressesV6[name] = interfaceRecords.addressesV6[name] ?? new Map();
                interfaceRecords.addressesV6[name].set(ip, record);
            } else if (this.#enableIpv4 && recordType === DnsRecordType.A) {
                interfaceRecords.addressesV4 = interfaceRecords.addressesV4 ?? {};
                interfaceRecords.addressesV4[name] = interfaceRecords.addressesV4[name] ?? new Map();
                interfaceRecords.addressesV4[name].set(ip, record);
            }
        }
        this.#discoveredIpRecords.set(netInterface, interfaceRecords);
    }

    #handleIpRecords(
        answers: StructuredDnsAnswers[],
        target: string,
        netInterface: string,
    ): { value: string; ttl: number }[] {
        const ipRecords = new Array<AnyDnsRecordWithExpiry>();
        answers.forEach(answer => {
            if (answer.addressesV6?.[target]) {
                ipRecords.push(...answer.addressesV6[target].values());
            }
            if (this.#enableIpv4 && answer.addressesV4?.[target]) {
                ipRecords.push(...answer.addressesV4[target].values());
            }
        });
        if (ipRecords.length === 0) {
            return [];
        }

        // Remember the IP records for later Matter usage
        this.#registerIpRecords(ipRecords, netInterface); // Register for potential later usage

        // If an IP is included multiple times we only keep the latest record
        const collectedIps = new Map<string, { value: string; ttl: number }>();
        ipRecords.forEach(record => {
            const { value, ttl } = record as DnsRecord<string>;
            if (value.startsWith("fe80::")) {
                collectedIps.set(value, { value: `${value}%${netInterface}`, ttl });
            } else {
                collectedIps.set(value, { value, ttl });
            }
        });
        return [...collectedIps.values()];
    }

    #handleOperationalRecords(
        answers: StructuredDnsAnswers,
        formerAnswers: StructuredDnsAnswers,
        netInterface: string,
    ) {
        // Does the message contain data for an operational service?
        if (!answers.operational) return;

        const operationalTxtRecords = answers.operational[DnsRecordType.TXT] ?? [];
        operationalTxtRecords.forEach(record => this.#handleOperationalTxtRecord(record, netInterface));

        let operationalSrvRecords = answers.operational[DnsRecordType.SRV] ?? [];
        if (!operationalSrvRecords.length && formerAnswers.operational) {
            operationalSrvRecords = formerAnswers.operational[DnsRecordType.SRV] ?? [];
        }

        if (operationalSrvRecords.length) {
            operationalSrvRecords.forEach(record =>
                this.#handleOperationalSrvRecord(record, answers, formerAnswers, netInterface),
            );
        }
    }

    #matchesOperationalCriteria(matterName: string) {
        const nameParts = matterName.match(/^([\dA-F]{16})-([\dA-F]{16})\._matter\._tcp\.local$/i);
        if (!nameParts) {
            return false;
        }
        const operationalId = nameParts[1];
        const nodeId = nameParts[2];
        return (
            this.#operationalScanTargets.has(operationalId) ||
            this.#operationalScanTargets.has(`${operationalId}-${nodeId}`)
        );
    }

    #handleOperationalTxtRecord(record: DnsRecord<any>, netInterface: string) {
        const { name: matterName, value, ttl } = record as DnsRecord<string[]>;
        const discoveredAt = Time.nowMs();

        // we got an expiry info, so we can remove the record if we know it already and are done
        if (ttl === 0) {
            if (this.#operationalDeviceRecords.has(matterName)) {
                logger.debug(
                    `Removing operational device ${matterName} from cache (interface ${netInterface}) because of ttl=0`,
                );
                this.#operationalDeviceRecords.delete(matterName);
            }
            return;
        }
        if (!Array.isArray(value)) return;

        // Existing records are always updated if relevant, but no new are added if they are not matching the criteria
        if (!this.#operationalDeviceRecords.has(matterName) && !this.#matchesOperationalCriteria(matterName)) {
            //logger.debug(`Operational device ${matterName} is not in the list of operational scan targets, ignoring.`);
            return;
        }

        const txtData = this.#parseTxtRecord(record);
        if (txtData === undefined) return;

        let device = this.#operationalDeviceRecords.get(matterName);
        if (device !== undefined) {
            device = {
                ...device,
                discoveredAt,
                ttl: ttl * 1000,
                ...txtData,
            };
        } else {
            logger.debug(
                `Adding operational device ${matterName} in cache (interface ${netInterface}, ttl=${ttl}) with TXT data:`,
                MdnsScanner.discoveryDataDiagnostics(txtData),
            );
            device = {
                deviceIdentifier: matterName,
                addresses: new Map<string, MatterServerRecordWithExpire>(),
                discoveredAt,
                ttl: ttl * 1000,
                ...txtData,
            };
        }

        this.#operationalDeviceRecords.set(matterName, device);
    }

    #handleOperationalSrvRecord(
        record: DnsRecord<any>,
        answers: StructuredDnsAnswers,
        formerAnswers: StructuredDnsAnswers,
        netInterface: string,
    ) {
        const {
            name: matterName,
            ttl,
            value: { target, port },
        } = record;

        // We got device expiry info, so we can remove the record if we know it already and are done
        if (ttl === 0) {
            if (this.#operationalDeviceRecords.has(matterName)) {
                logger.debug(
                    `Removing operational device ${matterName} from cache (interface ${netInterface}) because of ttl=0`,
                );
                this.#operationalDeviceRecords.delete(matterName);
            }
            return;
        }

        const ips = this.#handleIpRecords([formerAnswers, answers], target, netInterface);
        const deviceExisted = this.#operationalDeviceRecords.has(matterName);

        // Existing records are always updated if relevant, but no new are added if they are not matching the criteria
        if (!deviceExisted && !this.#matchesOperationalCriteria(matterName)) {
            //logger.debug(`Operational device ${matterName} is not in the list of operational scan targets, ignoring.`);
            return;
        }

        const discoveredAt = Time.nowMs();
        const device = this.#operationalDeviceRecords.get(matterName) ?? {
            deviceIdentifier: matterName,
            addresses: new Map<string, MatterServerRecordWithExpire>(),
            discoveredAt,
            ttl: ttl * 1000,
        };
        const ipsInitiallyEmpty = device.addresses.size === 0;
        const { addresses } = device;
        if (ips.length > 0) {
            for (const { value: ip, ttl } of ips) {
                if (ttl === 0) {
                    logger.debug(
                        `Removing IP ${ip} for operational device ${matterName} from cache (interface ${netInterface}) because of ttl=0`,
                    );
                    addresses.delete(ip);
                    continue;
                }
                const address = addresses.get(ip) ?? ({ ip, port, type: "udp" } as MatterServerRecordWithExpire);
                address.discoveredAt = discoveredAt;
                address.ttl = ttl * 1000;

                addresses.set(address.ip, address);
            }
            device.addresses = addresses;
            if (ipsInitiallyEmpty) {
                logger.debug(
                    `Added ${addresses.size} IPs for operational device ${matterName} to cache (interface ${netInterface}):`,
                    ...MdnsScanner.deviceAddressDiagnostics(addresses),
                );
            }
            this.#operationalDeviceRecords.set(matterName, device);
        }

        if (addresses.size === 0 && this.#hasWaiter(matterName)) {
            // We have no or no more (because expired) IPs, and we are interested in this particular service name, request them
            const queries = [{ name: target, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.AAAA }];
            if (this.#enableIpv4) {
                queries.push({ name: target, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.A });
            }
            logger.debug(`Requesting IP addresses for operational device ${matterName} (interface ${netInterface}).`);
            this.#setQueryRecords(matterName, queries, answers);
        } else if (addresses.size > 0) {
            this.#finishWaiter(matterName, true, deviceExisted);
        }
        return;
    }

    #handleCommissionableRecords(
        answers: StructuredDnsAnswers,
        formerAnswers: StructuredDnsAnswers,
        netInterface: string,
    ) {
        if (!this.#scanForCommissionableDevices && !this.#hasCommissionableWaiters) {
            // We are not interested in commissionable devices, so we can skip this
            return;
        }

        // Does the message contain a SRV record for an operational service we are interested in?
        let commissionableRecords = answers.commissionable ?? {};
        if (!commissionableRecords[DnsRecordType.SRV]?.length && !commissionableRecords[DnsRecordType.TXT]?.length) {
            commissionableRecords = formerAnswers.commissionable ?? {};
            if (!commissionableRecords[DnsRecordType.SRV]?.length && !commissionableRecords[DnsRecordType.TXT]?.length)
                return;
        }

        const queryMissingDataForInstances = new Set<string>();

        // First process the TXT records
        const txtRecords = commissionableRecords[DnsRecordType.TXT] ?? [];
        for (const record of txtRecords) {
            const { name, ttl } = record;
            if (ttl === 0) {
                if (this.#commissionableDeviceRecords.has(name)) {
                    logger.debug(
                        `Removing commissionable device ${name} from cache (interface ${netInterface}) because of ttl=0`,
                    );
                    this.#commissionableDeviceRecords.delete(name);
                }
                continue;
            }
            const txtRecord = this.#parseCommissionableTxtRecord(record);
            if (txtRecord === undefined) continue;
            const instanceId = this.#extractInstanceId(name);
            const parsedRecord = {
                ...txtRecord,
                instanceId,
                deviceIdentifier: instanceId,
            } as CommissionableDeviceRecordWithExpire;
            if (parsedRecord.D !== undefined && parsedRecord.SD === undefined) {
                parsedRecord.SD = (parsedRecord.D >> 8) & 0x0f;
            }
            if (parsedRecord.VP !== undefined) {
                const VpValueArr = parsedRecord.VP.split("+");
                parsedRecord.V = VpValueArr[0] !== undefined ? parseInt(VpValueArr[0]) : undefined;
                parsedRecord.P = VpValueArr[1] !== undefined ? parseInt(VpValueArr[1]) : undefined;
            }

            const storedRecord = this.#commissionableDeviceRecords.get(name);
            if (storedRecord === undefined) {
                queryMissingDataForInstances.add(name);

                logger.debug(
                    `Found commissionable device ${name} with data:`,
                    MdnsScanner.discoveryDataDiagnostics(parsedRecord),
                );
            } else {
                parsedRecord.addresses = storedRecord.addresses;
            }
            this.#commissionableDeviceRecords.set(name, parsedRecord);
        }

        // We got SRV records for the instance ID, so we know the host name now and can collect the IP addresses
        const srvRecords = commissionableRecords[DnsRecordType.SRV] ?? [];
        for (const record of srvRecords) {
            const storedRecord = this.#commissionableDeviceRecords.get(record.name);
            if (storedRecord === undefined) continue;
            const {
                value: { target, port },
                ttl,
            } = record as DnsRecord<SrvRecordValue>;
            if (ttl === 0) {
                logger.debug(
                    `Removing commissionable device ${record.name} from cache (interface ${netInterface}) because of ttl=0`,
                );
                this.#commissionableDeviceRecords.delete(record.name);
                continue;
            }

            const recordAddressesKnown = storedRecord.addresses.size > 0;

            const ips = this.#handleIpRecords([formerAnswers, answers], target, netInterface);
            if (ips.length > 0) {
                for (const { value: ip, ttl } of ips) {
                    if (ttl === 0) {
                        logger.debug(
                            `Removing IP ${ip} for commissionable device ${record.name} from cache (interface ${netInterface}) because of ttl=0`,
                        );
                        storedRecord.addresses.delete(ip);
                        continue;
                    }
                    const matterServer =
                        storedRecord.addresses.get(ip) ?? ({ ip, port, type: "udp" } as MatterServerRecordWithExpire);
                    matterServer.discoveredAt = Time.nowMs();
                    matterServer.ttl = ttl * 1000;

                    storedRecord.addresses.set(ip, matterServer);
                }
            }
            this.#commissionableDeviceRecords.set(record.name, storedRecord);
            if (storedRecord.addresses.size === 0) {
                const queryId = this.#findCommissionableQueryIdentifier("", storedRecord);
                if (queryId === undefined) continue;
                // We have no or no more (because expired) IPs and we are interested in such a service name, request them
                const queries = [{ name: target, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.AAAA }];
                if (this.#enableIpv4) {
                    queries.push({ name: target, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.A });
                }
                logger.debug(
                    `Requesting IP addresses for commissionable device ${record.name} (interface ${netInterface}).`,
                );
                this.#setQueryRecords(queryId, queries, answers);
            } else if (!recordAddressesKnown) {
                logger.debug(
                    `Added ${storedRecord.addresses.size} IPs for commissionable device ${record.name} to cache (interface ${netInterface}):`,
                    ...MdnsScanner.deviceAddressDiagnostics(storedRecord.addresses),
                );
            }
            if (storedRecord.addresses.size === 0) continue;

            const queryId = this.#findCommissionableQueryIdentifier(record.name, storedRecord);
            if (queryId === undefined) continue;

            queryMissingDataForInstances.delete(record.name); // No need to query anymore, we have anything we need
            this.#finishWaiter(queryId, true, recordAddressesKnown);
        }

        // We have to query for the SRV records for the missing commissionable devices where we only had TXT records
        if (queryMissingDataForInstances.size !== 0) {
            for (const name of Array.from(queryMissingDataForInstances.values())) {
                const storedRecord = this.#commissionableDeviceRecords.get(name);
                if (storedRecord === undefined) continue;
                const queryId = this.#findCommissionableQueryIdentifier("", storedRecord);
                if (queryId === undefined) continue;
                logger.debug(`Requesting more records for commissionable device ${name} (interface ${netInterface}).`);
                this.#setQueryRecords(
                    queryId,
                    [{ name, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
                    answers,
                );
            }
        }
    }

    #parseTxtRecord(record: DnsRecord<any>): (DiscoveryData & { D?: number; CM?: number }) | undefined {
        const { value } = record as DnsRecord<string[]>;
        const result = {} as any;
        if (Array.isArray(value)) {
            for (const item of value) {
                const [key, value] = item.split("=");
                if (key === undefined || value === undefined) continue;
                if (["SII", "SAI", "SAT", "T", "D", "CM", "DT", "PH", "ICD"].includes(key)) {
                    const intValue = parseInt(value);
                    if (isNaN(intValue)) continue;
                    result[key] = intValue;
                } else if (["VP", "DN", "RI", "PI"].includes(key)) {
                    result[key] = value;
                }
            }
        }

        // Fill in some defaults for convenience
        if (result.T === undefined) {
            result.T = 0; // TCP not supported
        } else if (!(result.T & ~1 & 6)) {
            // Value 1 is reserved and should be handled as 0 according to Matter spec,
            // else check if tcpClient (Bit 1) or tcpServer (Bit 2) or both are supported, all other values are invalid
            result.T = 0; // TCP not supported
        }
        if (result.ICD === undefined) {
            result.ICD = 0; // Device is not operating as Long Idle Time ICD
        }

        return result;
    }

    #parseCommissionableTxtRecord(record: DnsRecord<any>): Partial<CommissionableDeviceRecordWithExpire> | undefined {
        const { value, ttl } = record as DnsRecord<string[]>;
        if (!Array.isArray(value)) return undefined;
        const txtRecord = this.#parseTxtRecord(record);
        if (txtRecord === undefined || txtRecord.D === undefined || txtRecord.CM === undefined) {
            // Required data fields need to be existing
            return undefined;
        }
        return {
            addresses: new Map<string, MatterServerRecordWithExpire>(),
            discoveredAt: Time.nowMs(),
            ttl: ttl * 1000,
            ...txtRecord,
        };
    }

    #expire() {
        const now = Time.nowMs();
        [...this.#operationalDeviceRecords.entries()].forEach(([recordKey, { addresses, discoveredAt, ttl }]) => {
            const expires = discoveredAt + this.#effectiveTTL(ttl);
            if (now <= expires) {
                // Only check expired IPs if not device itself has expired
                [...addresses.entries()].forEach(([key, { discoveredAt, ttl }]) => {
                    if (now < discoveredAt + this.#effectiveTTL(ttl)) return; // not expired yet
                    addresses.delete(key);
                });
            }
            if (now > expires && !addresses.size) {
                // device expired and also has no adresses anymore
                this.#operationalDeviceRecords.delete(recordKey);
            }
        });
        [...this.#commissionableDeviceRecords.entries()].forEach(([recordKey, { addresses, discoveredAt, ttl }]) => {
            const expires = discoveredAt + this.#effectiveTTL(ttl);
            if (now <= expires) {
                // Only check expired IPs if not device itself has expired
                [...addresses.entries()].forEach(([key, { discoveredAt, ttl }]) => {
                    if (now < discoveredAt + this.#effectiveTTL(ttl)) return; // not expired yet
                    addresses.delete(key);
                });
            }
            if (now > expires && !addresses.size) {
                // device expired and also has no addresses anymore
                this.#commissionableDeviceRecords.delete(recordKey);
            }
        });

        [...this.#activeAnnounceQueries.values()].forEach(({ answers }) => this.#expireStructuredAnswers(answers, now));

        this.#discoveredIpRecords.forEach(answers => this.#expireStructuredAnswers(answers, now));
    }

    #expireStructuredAnswers(data: StructuredDnsAnswers, now: number) {
        if (data.operational) {
            Object.keys(data.operational).forEach(recordType => {
                const type = parseInt(recordType);
                data.operational![type] = data.operational![type].filter(
                    ({ discoveredAt, ttl }) => now < discoveredAt + this.#effectiveTTL(ttl * 1000),
                );
                if (data.operational![type].length === 0) {
                    delete data.operational![type];
                }
            });
        }
        if (data.commissionable) {
            Object.keys(data.commissionable).forEach(recordType => {
                const type = parseInt(recordType);
                data.commissionable![type] = data.commissionable![type].filter(
                    ({ discoveredAt, ttl }) => now < discoveredAt + this.#effectiveTTL(ttl * 1000),
                );
                if (data.commissionable![type].length === 0) {
                    delete data.commissionable![type];
                }
            });
        }
        if (data.addressesV6) {
            Object.keys(data.addressesV6).forEach(name => {
                for (const [ip, { discoveredAt, ttl }] of data.addressesV6![name].entries()) {
                    if (now < discoveredAt + this.#effectiveTTL(ttl * 1000)) continue; // not expired yet
                    data.addressesV6![name].delete(ip);
                }
                if (data.addressesV6![name].size === 0) {
                    delete data.addressesV6![name];
                }
            });
        }
        if (data.addressesV4) {
            Object.keys(data.addressesV4).forEach(name => {
                for (const [ip, { discoveredAt, ttl }] of data.addressesV4![name].entries()) {
                    if (now < discoveredAt + this.#effectiveTTL(ttl * 1000)) continue; // not expired yet
                    data.addressesV4![name].delete(ip);
                }
                if (data.addressesV4![name].size === 0) {
                    delete data.addressesV4![name];
                }
            });
        }
    }

    static discoveryDataDiagnostics(data: DiscoveryData) {
        return Diagnostic.dict(
            {
                SII: data.SII,
                SAI: data.SAI,
                SAT: data.SAT,
                T: data.T,
                DT: data.DT,
                PH: data.PH,
                ICD: data.ICD,
                VP: data.VP,
                DN: data.DN,
                RI: data.RI,
                PI: data.PI,
            },
            true,
        );
    }

    static deviceAddressDiagnostics(addresses: Map<string, MatterServerRecordWithExpire>) {
        return Array.from(addresses.values()).map(address =>
            Diagnostic.dict({
                type: address.type,
                ip: address.ip,
                port: address.port,
            }),
        );
    }
}
