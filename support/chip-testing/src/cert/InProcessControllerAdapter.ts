/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Boot,
    ClientNode,
    ControllerBehavior,
    Diagnostic,
    Duration,
    Environment,
    ImplementationError,
    InternalError,
    LogDestination,
    LogFormat,
    Logger,
    MatterError,
    Millis,
    MockStorageService,
    ObserverGroup,
    Seconds,
    ServerNode,
    Time,
    UnexpectedDataError,
} from "@matter/main";
import { OperationalCredentialsClient } from "@matter/main/behaviors/operational-credentials";
import { GeneralCommissioning, OperationalCredentials } from "@matter/main/clusters";
import {
    ClientRead,
    CommissionableDeviceIdentifiers,
    Fabric,
    FabricAuthority,
    getOperationalDeviceQname,
    Invoke,
    Peer as ProtocolPeer,
    PeerSet,
    Read,
    ReadResult,
    Subscribe,
    Write,
    WriteResult,
} from "@matter/main/protocol";
import {
    AttributeId,
    ClusterId,
    CommandId,
    EndpointNumber,
    EventId,
    ManualPairingCodeCodec,
    NodeId,
    Status,
    StatusResponseError,
    VendorId,
} from "@matter/main/types";
import { AttributeModel } from "@matter/model";
import type {
    AttributePathSpec,
    AttributeReadEntry,
    AttributeWriteEntry,
    AttributeWriteStatus,
    BatchCommandResult,
    BatchCommandSpec,
    CertNodeApi,
    CertNodeRef,
    CommissioningTarget,
    ControllerAdapter,
    ControllerAdapterOptions,
    ControllerTransport,
    EventPathSpec,
    EventReadEntry,
    ManualPairingCodeFields,
    OnboardingPayloadFields,
    ReadAttributeOptions,
    ReadEventOptions,
    SubscribeEventOptions,
    PicsValues,
    SubscribeOptions,
    TimedInteractionOptions,
} from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import { AsyncLocalStorage } from "node:async_hooks";
import { certClusterModelFor, findCertCluster } from "./custom-clusters.js";
import { refusalOf, singleQrPayload } from "./onboarding-payload.js";
import { timedInteractionTimeoutOf } from "./timed-interaction.js";

/**
 * Attributes a matter.js controller `write`/`invoke` call to the {@link InProcessControllerAdapter} whose
 * operation is currently on the call stack, so the shared log destination below can route lines to the
 * right adapter's {@link LogSource} even when multiple adapters run concurrently in one process.
 */
const activeAdapterId = new AsyncLocalStorage<string>();

/** As `ChipToolControllerAdapter`'s own declarations: what this controller claims the device's PICS cannot. */
export const MATTERJS_CONTROLLER_PICS: PicsValues = {
    "MCORE.IDM.C.InvokeRequest.BatchCommands": 1,
    "MCORE.ROLE.COMMISSIONER": 1,
    "MCORE.DD.QR_COMMISSIONING": 1,
    "MCORE.DD.MANUAL_PC_COMMISSIONING": 1,

    // Takes the scanned payload itself (`MT:…`), not only the digits of a manual code.
    "MCORE.DD.SCAN_QR_CODE": 1,

    // A concatenated payload names several commissionees and is refused; the caller is told to split it.
    "MCORE.DD.CTRL_CONCATENATED_QR_CODE_1": 0,

    // Every Actions command, invoked by id. The CHIP PICS file answers 0 for these because it
    // describes a device, which is not an Actions client; here the client is the controller.
    "ACT.C.C00.Tx": 1,
    "ACT.C.C01.Tx": 1,
    "ACT.C.C02.Tx": 1,
    "ACT.C.C03.Tx": 1,
    "ACT.C.C04.Tx": 1,
    "ACT.C.C05.Tx": 1,
    "ACT.C.C06.Tx": 1,
    "ACT.C.C07.Tx": 1,
    "ACT.C.C08.Tx": 1,
    "ACT.C.C09.Tx": 1,
    "ACT.C.C0a.Tx": 1,
    "ACT.C.C0b.Tx": 1,

    // The Groups client commands this run's DUT sends, its preconditions' AddGroup included. The CHIP
    // PICS file answers 0 for these because it describes a device, which is not a Groups client; here
    // the client is the controller.
    "G.C.C00.Tx": 1,
    "G.C.C02.Tx": 1,
    "G.C.C03.Tx": 1,
    "G.C.C04.Tx": 1,
    "G.C.C05.Tx": 1,

    // Every ScenesManagement client command TC-S-3.1 sends. The CHIP PICS file answers 0 for the
    // cluster and each command because it describes a device, which is not a scenes client.
    "S.C": 1,
    "S.C.C00.Tx": 1,
    "S.C.C01.Tx": 1,
    "S.C.C02.Tx": 1,
    "S.C.C03.Tx": 1,
    "S.C.C04.Tx": 1,
    "S.C.C05.Tx": 1,
    "S.C.C06.Tx": 1,
    "S.C.C40.Tx": 1,

    // GroupKeyManagement and Groups client commands TC-SC-6.1 sends beyond what the device file already
    // answers 1 for. The file describes a device, which is neither a group-key nor a groups client.
    "G.C.C01.Tx": 1,
    "GRPKEY.C.C03.Tx": 1,
    "GRPKEY.C.C04.Tx": 1,
};

const adapterStreams = new Map<string, LineQueue>();

// Boot.reboot() runs before every spec file and replaces Logger.destinations wholesale (see
// Logger.ts's own Boot.init), so a one-time install at module load would stop forwarding adapter log
// lines from the second cert-test file onward. Boot.init re-runs this on every reboot instead.
Boot.init(() => {
    Logger.destinations["cert-controller-adapter"] = LogDestination({
        name: "cert-controller-adapter",
        format: LogFormat.formats.plain,
        write(text: string) {
            const id = activeAdapterId.getStore();
            if (id === undefined) {
                return;
            }
            adapterStreams.get(id)?.push(text);
        },
    });
});

const logger = Logger.get("CertControllerAdapter");

function runTagged<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return activeAdapterId.run(id, fn);
}

function toIds(path: AttributePathSpec) {
    return {
        endpointId: path.endpoint !== undefined ? EndpointNumber(path.endpoint) : undefined,
        clusterId: path.cluster !== undefined ? ClusterId(path.cluster) : undefined,
        attributeId: path.attribute !== undefined ? AttributeId(path.attribute) : undefined,
    };
}

/**
 * `Invoke`/`Write` derive `timedRequest` from either flag, and a zero timeout is falsy — asking for one
 * without `timed` would send the interaction untimed, where chip-tool sends a real timed request for
 * the same call. An absent option stays absent rather than becoming a default the caller did not ask
 * for.
 */
function timedInteraction(options?: TimedInteractionOptions) {
    const timeout = timedInteractionTimeoutOf(options);
    if (timeout === undefined) {
        return {};
    }
    return { timed: true, timeout: Millis(timeout) };
}

/**
 * `commandRef` stays absent for a single-command request: Matter Core § 8.9.3 defines it only for a
 * batch, and a device without batch support does not echo it.
 */
function commandRequestFor(spec: BatchCommandSpec, commandRef?: number) {
    const { cluster, command, args, endpoint = 0 } = spec;
    const { model: clusterModel, id: clusterId } = certClusterModelFor(cluster);
    const commandModel = clusterModel.commands(command);
    if (commandModel?.id === undefined) {
        throw new ImplementationError(`Unknown command "${command}" on cluster ${cluster}`);
    }

    return Invoke.ConcreteCommandRequest({
        endpoint: EndpointNumber(endpoint),
        cluster: { id: ClusterId(clusterId), name: clusterModel.name },
        command: { id: CommandId(commandModel.id), name: commandModel.name, schema: commandModel },
        commandRef,
        // Argument-less commands require an absent payload — {} fails TLV validation ("expected void")
        fields: args !== undefined && Object.keys(args).length > 0 ? args : undefined,
    });
}

function isConcretePath(path: AttributePathSpec) {
    return path.endpoint !== undefined && path.cluster !== undefined && path.attribute !== undefined;
}

function toEventIds(path: EventPathSpec) {
    return {
        endpointId: path.endpoint !== undefined ? EndpointNumber(path.endpoint) : undefined,
        clusterId: path.cluster !== undefined ? ClusterId(path.cluster) : undefined,
        eventId: path.event !== undefined ? EventId(path.event) : undefined,
    };
}

function isConcreteEventPath(path: EventPathSpec) {
    return path.endpoint !== undefined && path.cluster !== undefined && path.event !== undefined;
}

function toWireEvents(values: ReadResult.EventValue[]): EventReadEntry[] {
    return values.map(({ path: { endpointId, clusterId, eventId }, number, value }) => ({
        endpoint: endpointId,
        cluster: clusterId,
        event: eventId,
        eventNumber: number,
        value,
    }));
}

function eventFiltersFor(options?: ReadEventOptions) {
    return options?.minEventNumber === undefined ? undefined : [{ eventMin: options.minEventNumber }];
}

/**
 * A concrete path the device answered with a status is a failed read of that path, the same way
 * {@link CertNodeApi.readAttribute}'s is: the step asked for that attribute and got none, so reporting
 * the read as successful would have it read as "the device has no value for it".
 *
 * A wildcard path's statuses are per-item results of the expansion instead (UNSUPPORTED_ATTRIBUTE for
 * a path the expansion reached but that does not apply there), so those are dropped.
 */
function assertNoConcreteAttributeStatus(
    paths: AttributePathSpec[],
    statuses: ReadResult.AttributeStatus[],
    operation: string,
) {
    for (const status of statuses) {
        const { endpointId, clusterId, attributeId } = status.path;
        const requested = paths.some(
            path =>
                isConcretePath(path) &&
                path.endpoint === endpointId &&
                path.cluster === clusterId &&
                path.attribute === attributeId,
        );
        if (requested) {
            throw new StatusResponseError(
                `${operation} ${JSON.stringify({ endpoint: endpointId, cluster: clusterId, attribute: attributeId })} failed`,
                status.status,
                status.clusterStatus,
            );
        }
    }
}

/**
 * A status for a path the step named concretely means it will never see that event; per-path statuses
 * of a wildcard expansion are results of the expansion instead (see {@link CertNodeApi.readEvents}).
 *
 * A subscribe whose every path the device refuses is rejected by the interaction itself, but one that
 * also carries a path the device serves is established, and only the priming report's status says the
 * other path went unanswered.
 */
function assertNoConcreteEventStatus(paths: EventPathSpec[], statuses: ReadResult.EventStatus[], operation: string) {
    for (const status of statuses) {
        const { endpointId, clusterId, eventId } = status.path;
        const requested = paths.some(
            path =>
                isConcreteEventPath(path) &&
                path.endpoint === endpointId &&
                path.cluster === clusterId &&
                path.event === eventId,
        );
        if (requested) {
            throw new StatusResponseError(
                `${operation} ${JSON.stringify({ endpoint: endpointId, cluster: clusterId, event: eventId })} failed`,
                status.status,
                status.clusterStatus,
            );
        }
    }
}

function toWireValues(values: ReadResult.AttributeValue[]) {
    return values.map(({ path: { endpointId, clusterId, attributeId }, value, version }) => ({
        endpoint: endpointId,
        cluster: clusterId,
        attribute: attributeId,
        value,
        version,
    }));
}

function attributeSpecFor(cluster: number, attribute: number, value: unknown) {
    const clusterModel = findCertCluster(cluster);
    const attributeModel = clusterModel?.attributes(attribute) ?? inferAttributeModel(attribute, value);
    return {
        cluster: { id: ClusterId(cluster), name: clusterModel?.name ?? `cluster_${cluster}` },
        attributes: { id: AttributeId(attribute), name: attributeModel.name, schema: attributeModel },
    };
}

/**
 * Best-effort attribute schema for a write when the model has no definition for the attribute (e.g. an
 * intentionally out-of-model attribute a TC writes to test error handling).
 */
function inferAttributeModel(id: number, value: unknown): AttributeModel {
    let type: string;
    if (typeof value === "bigint") type = "uint64";
    else if (typeof value === "string") type = "string";
    else if (typeof value === "boolean") type = "bool";
    else if (typeof value === "number" || value === null) type = "int32";
    else throw new ImplementationError(`Cannot infer a TLV type for attribute ${id} from a ${typeof value} value`);
    return new AttributeModel({
        id,
        name: `attr_${id}`,
        type,
        quality: value === null ? "X" : undefined,
        access: "RW",
    });
}

interface ResolvedCommissioningTarget {
    identifierData: CommissionableDeviceIdentifiers;
    passcode: number;

    /** What the payload names, so a device advertising another identity is passed over. */
    vendorId?: VendorId;
    productId?: number;
}

/**
 * A `manualPairingCode` (from an enhanced commissioning window) only carries a short discriminator
 * (§ 5.1.4.1's 4-bit form) and the window's freshly-generated passcode — never the device's original
 * setup passcode/discriminator, which `openEnhancedCommissioningWindow` deliberately replaces per
 * window. `target.passcode`/`target.discriminator` are for the device's original setup code instead.
 *
 * A `qrPairingCode` carries the full 12-bit discriminator, so it discovers by the long form. Its
 * remaining fields (vendor and product id, commissioning flow, discovery capabilities) describe the
 * commissionee rather than how to reach it; a step asserting on them decodes the payload itself.
 */
function resolveCommissioningTarget(target: CommissioningTarget): ResolvedCommissioningTarget {
    if (target.qrPairingCode) {
        const { discriminator, passcode, vendorId, productId } = singleQrPayload(target.qrPairingCode);
        return {
            identifierData: { longDiscriminator: discriminator },
            passcode,
            vendorId: vendorId === undefined ? undefined : VendorId(vendorId, false),
            productId,
        };
    }
    if (target.manualPairingCode !== undefined) {
        const code = target.manualPairingCode;
        const { shortDiscriminator, passcode, vendorId, productId } = refusalOf(
            () => ManualPairingCodeCodec.decode(code),
            `manual pairing code ${code}`,
        );
        if (shortDiscriminator === undefined) {
            throw new ImplementationError("Manual pairing code did not decode to a short discriminator");
        }
        return { identifierData: { shortDiscriminator }, passcode, vendorId, productId };
    }
    if (target.passcode === undefined || target.discriminator === undefined) {
        throw new ImplementationError(
            "commission() requires a target.qrPairingCode, a target.manualPairingCode, or both target.passcode " +
                "and target.discriminator",
        );
    }
    return { identifierData: { longDiscriminator: target.discriminator }, passcode: target.passcode };
}

/**
 * The adapter's controller holds no {@link ClientNode} for the ref a step handed in. Besides a step
 * naming a node it never commissioned, this is what every node operation reports once the device
 * removed the controller's fabric: the controller reacts to the device's Leave event by deleting the
 * peer ("Peer ... has left the fabric"), so the refusal is derived from the device's own notice.
 */
export class NoCommissionedPeerError extends MatterError {}

class InProcessCertNodeApi implements CertNodeApi {
    readonly #adapterId: string;
    readonly #controller: ServerNode;
    readonly #fabric: Fabric;
    readonly #nodeId: NodeId;

    constructor(adapterId: string, controller: ServerNode, fabric: Fabric, ref: CertNodeRef) {
        this.#adapterId = adapterId;
        this.#controller = controller;
        this.#fabric = fabric;
        this.#nodeId = NodeId(ref);
    }

    get #peer(): ClientNode {
        const peer = this.#controller.peers.get(this.#fabric.addressOf(this.#nodeId));
        if (peer === undefined) {
            throw new NoCommissionedPeerError(
                `Controller "${this.#adapterId}" has no commissioned peer with node id ${this.#nodeId}`,
            );
        }
        return peer;
    }

    /** The protocol-level peer behind {@link #peer}, which carries the negotiated session parameters. */
    get #protocolPeer(): ProtocolPeer | undefined {
        return this.#controller.env.get(PeerSet).get(this.#fabric.addressOf(this.#nodeId));
    }

    invoke(
        cluster: string | number,
        command: string,
        args?: object,
        endpoint = 0,
        options?: TimedInteractionOptions,
    ): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const request = Invoke({
                ...timedInteraction(options),
                commands: [commandRequestFor({ cluster, command, args, endpoint })],
            });
            for await (const chunk of this.#peer.interaction.invoke(request)) {
                for (const entry of chunk) {
                    switch (entry.kind) {
                        case "cmd-status":
                            if (entry.status !== Status.Success) {
                                throw StatusResponseError.create(entry.status, undefined, entry.clusterStatus);
                            }
                            return undefined;

                        case "cmd-response":
                            return entry.data;
                    }
                }
            }
            return undefined;
        });
    }

    invokeBatch(commands: BatchCommandSpec[], options?: TimedInteractionOptions): Promise<BatchCommandResult[]> {
        return runTagged(this.#adapterId, async () => {
            if (commands.length === 0) {
                throw new ImplementationError("invokeBatch requires at least one command");
            }

            // `ClientInteraction.invoke` splits a request the peer cannot take in one message into
            // several single-command exchanges, which is right for an ordinary caller and wrong here:
            // the whole point of this call is the one request, and a step proving how a device answers
            // a batch would silently prove nothing. This reads the same value the interaction's own
            // exchange provider does.
            const advertised = this.#protocolPeer?.sessionParameters.maxPathsPerInvoke;
            if (commands.length > (advertised ?? 1)) {
                throw new ImplementationError(
                    `invokeBatch of ${commands.length} commands, but ` +
                        (advertised === undefined
                            ? `node ${this.#nodeId} has no protocol peer yet, so its limit is unknown and taken as 1`
                            : `node ${this.#nodeId} accepts ${advertised} path(s) per invoke`) +
                        "; the request would be split into separate interactions",
                );
            }

            // Refs number from 1, matching matter.js's own allocator, so the device's echoed ref maps
            // back to a request position without further bookkeeping.
            const request = Invoke({
                ...timedInteraction(options),
                commands: commands.map((command, index) => commandRequestFor(command, index + 1)),
            });

            const results = new Array<BatchCommandResult>();
            for await (const chunk of this.#peer.interaction.invoke(request)) {
                for (const entry of chunk) {
                    const index = entry.commandRef === undefined ? undefined : entry.commandRef - 1;
                    if (index === undefined || index < 0 || index >= commands.length) {
                        throw new UnexpectedDataError(
                            `Invoke response carries commandRef ${entry.commandRef}, which belongs to no command of ` +
                                `this ${commands.length}-command request; ${results.length} result(s) had arrived ` +
                                `first: ${Diagnostic.json(results)}`,
                        );
                    }

                    if (entry.kind === "cmd-status") {
                        results.push({ index, status: entry.status, clusterStatus: entry.clusterStatus });
                    } else {
                        results.push({ index, data: entry.data });
                    }
                }
            }

            return results;
        });
    }

    readAttribute(path: AttributePathSpec, options?: ReadAttributeOptions): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const { endpointId, clusterId, attributeId } = toIds(path);
            const values = new Array<ReadResult.AttributeValue>();
            const statuses = new Array<ReadResult.AttributeStatus>();
            // A cert step asserts on what the device actually reports, so the read must never be answered
            // with "unchanged" against versions the node's own subscription cached.
            const request: ClientRead = {
                ...Read({
                    attributes: [{ endpointId, clusterId, attributeId }],
                    fabricFilter: options?.fabricFiltered,
                }),
                includeKnownVersions: true,
            };
            for await (const chunk of this.#peer.interaction.read(request)) {
                for await (const report of chunk) {
                    if (report.kind === "attr-value") {
                        values.push(report);
                    } else if (report.kind === "attr-status") {
                        statuses.push(report);
                    }
                }
            }
            if (isConcretePath(path)) {
                if (statuses.length) {
                    throw new StatusResponseError(`readAttribute ${JSON.stringify(path)} failed`, statuses[0].status);
                }
                if (values.length === 0) {
                    throw new InternalError(`readAttribute ${JSON.stringify(path)} returned no data`);
                }
                return values[0].value;
            }
            // A wildcard expansion legitimately mixes data with per-item statuses (e.g.
            // UNSUPPORTED_ATTRIBUTE for a path the expansion reached but that doesn't apply there) —
            // unlike a concrete path's status, that's not itself a read failure.
            return toWireValues(values);
        });
    }

    readAttributes(paths: AttributePathSpec[], options?: ReadAttributeOptions): Promise<AttributeReadEntry[]> {
        return runTagged(this.#adapterId, async () => {
            if (paths.length === 0) {
                throw new ImplementationError("readAttributes requires at least one path");
            }
            const values = new Array<ReadResult.AttributeValue>();
            const statuses = new Array<ReadResult.AttributeStatus>();
            const request: ClientRead = {
                ...Read({ attributes: paths.map(toIds), fabricFilter: options?.fabricFiltered }),
                includeKnownVersions: true,
            };
            for await (const chunk of this.#peer.interaction.read(request)) {
                for await (const report of chunk) {
                    if (report.kind === "attr-value") {
                        values.push(report);
                    } else if (report.kind === "attr-status") {
                        statuses.push(report);
                    }
                }
            }
            assertNoConcreteAttributeStatus(paths, statuses, "readAttributes");
            return toWireValues(values);
        });
    }

    writeAttribute(path: AttributePathSpec, value: unknown, options?: TimedInteractionOptions): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const { endpoint, cluster, attribute } = path;
            if (endpoint === undefined || cluster === undefined || attribute === undefined) {
                throw new ImplementationError("writeAttribute requires a concrete endpoint/cluster/attribute path");
            }
            const result = await this.#peer.interaction.write(
                Write(
                    timedInteraction(options),
                    Write.Attribute({
                        endpoint: EndpointNumber(endpoint),
                        ...attributeSpecFor(cluster, attribute, value),
                        value,
                    }),
                ),
            );
            WriteResult.assertSuccess(result);
        });
    }

    writeAttributes(entries: AttributeWriteEntry[]): Promise<AttributeWriteStatus[]> {
        return runTagged(this.#adapterId, async () => {
            if (entries.length === 0) {
                throw new ImplementationError("writeAttributes requires at least one attribute");
            }
            const attributes = entries.map(({ path: { endpoint, cluster, attribute }, value, dataVersion }) => {
                if (cluster === undefined || attribute === undefined) {
                    throw new ImplementationError("writeAttributes requires a concrete cluster and attribute");
                }
                const spec = attributeSpecFor(cluster, attribute, value);
                if (endpoint === undefined) {
                    return Write.Attribute({ ...spec, value, version: dataVersion });
                }
                return Write.Attribute({
                    endpoint: EndpointNumber(endpoint),
                    ...spec,
                    value,
                    version: dataVersion,
                });
            });
            const result = await this.#peer.interaction.write(Write(...attributes));
            return result.map(({ path: { endpointId, clusterId, attributeId }, status }) => ({
                endpoint: endpointId,
                cluster: clusterId,
                attribute: attributeId,
                status,
            }));
        });
    }

    subscribe(path: AttributePathSpec, opts: SubscribeOptions): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const { endpointId, clusterId, attributeId } = toIds(path);
            const seed = new Array<ReadResult.AttributeValue>();
            let seeding = true;
            const request = Subscribe({
                attributes: [{ endpointId, clusterId, attributeId }],
                keepSubscriptions: true,
                minIntervalFloor: Seconds(opts.minIntervalFloorSeconds),
                maxIntervalCeiling: Seconds(opts.maxIntervalCeilingSeconds),
            });
            request.updated = async data => {
                for await (const chunk of data) {
                    for await (const report of chunk) {
                        if (report.kind !== "attr-value") {
                            continue;
                        }
                        if (seeding) {
                            seed.push(report);
                        } else {
                            opts.onUpdate?.(report.value);
                        }
                    }
                }
            };
            await this.#peer.interaction.subscribe(request);
            seeding = false;
            if (isConcretePath(path)) {
                return seed[0]?.value;
            }
            return toWireValues(seed);
        });
    }

    readEvents(paths: EventPathSpec[], options?: ReadEventOptions): Promise<EventReadEntry[]> {
        return runTagged(this.#adapterId, async () => {
            if (paths.length === 0) {
                throw new ImplementationError("readEvents requires at least one path");
            }
            const values = new Array<ReadResult.EventValue>();
            const statuses = new Array<ReadResult.EventStatus>();
            const request = Read({
                events: paths.map(toEventIds),
                eventFilters: eventFiltersFor(options),
                fabricFilter: options?.fabricFiltered,
            });
            for await (const chunk of this.#peer.interaction.read(request)) {
                for await (const report of chunk) {
                    if (report.kind === "event-value") {
                        values.push(report);
                    } else if (report.kind === "event-status") {
                        statuses.push(report);
                    }
                }
            }
            assertNoConcreteEventStatus(paths, statuses, "readEvents");
            return toWireEvents(values);
        });
    }

    subscribeEvents(paths: EventPathSpec[], opts: SubscribeEventOptions): Promise<EventReadEntry[]> {
        return runTagged(this.#adapterId, async () => {
            if (paths.length === 0) {
                throw new ImplementationError("subscribeEvents requires at least one path");
            }
            const seed = new Array<ReadResult.EventValue>();
            const seedStatuses = new Array<ReadResult.EventStatus>();
            // A subscription this rejects stays established on the device and nothing here can revoke
            // it; dropping its reports is what keeps them away from the `onUpdate` of a step that has
            // already failed on the rejection, which is what the chip-tool adapter does too.
            let phase: "seeding" | "live" | "refused" = "seeding";
            const request = Subscribe({
                events: paths.map(toEventIds),
                eventFilters: eventFiltersFor(opts),
                fabricFilter: opts.fabricFiltered,
                keepSubscriptions: true,
                minIntervalFloor: Seconds(opts.minIntervalFloorSeconds),
                maxIntervalCeiling: Seconds(opts.maxIntervalCeilingSeconds),
            });
            request.updated = async data => {
                for await (const chunk of data) {
                    for await (const report of chunk) {
                        if (phase === "refused") {
                            continue;
                        }
                        if (report.kind === "event-status") {
                            if (phase === "seeding") {
                                seedStatuses.push(report);
                            }
                            continue;
                        }
                        if (report.kind !== "event-value") {
                            continue;
                        }
                        if (phase === "seeding") {
                            seed.push(report);
                        } else {
                            opts.onUpdate?.(toWireEvents([report])[0]);
                        }
                    }
                }
            };
            await this.#peer.interaction.subscribe(request);
            try {
                assertNoConcreteEventStatus(paths, seedStatuses, "subscribeEvents");
            } catch (e) {
                phase = "refused";
                throw e;
            }
            phase = "live";
            return toWireEvents(seed);
        });
    }

    openCommissioningWindow(opts: {
        timeout: number;
        enhanced: boolean;
    }): Promise<{ manualPairingCode?: string; qrPairingCode?: string }> {
        return runTagged(this.#adapterId, async () => {
            const peer = this.#peer;
            if (opts.enhanced) {
                return await peer.openEnhancedCommissioningWindow(Seconds(opts.timeout));
            }
            await peer.openBasicCommissioningWindow(Seconds(opts.timeout));
            return {};
        });
    }

    decommission(): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const peer = this.#peer;

            // Decommissioning acts through the peer's OperationalCredentials behavior, which the first
            // report carrying that cluster installs; a peer whose structure read aborted has none, and
            // reading it here is what installs it. Only that condition may be pre-empted: any other
            // failure is the step's outcome, including a refusal a step means to assert.
            if (peer.lifecycle.isCommissioned && !peer.behaviors.has(OperationalCredentialsClient)) {
                logger.info(`Reading ${peer.id}'s credentials, which decommissioning it needs`);
                await this.readAttribute({ endpoint: 0, cluster: OperationalCredentials.id });
            }

            await peer.decommission();
        });
    }

    operationalMdnsInstanceName(): Promise<string> {
        return runTagged(this.#adapterId, async () => {
            return getOperationalDeviceQname(this.#fabric.globalId, this.#nodeId);
        });
    }
}

/**
 * A cert step's own checks bound how long they wait (e.g. TC-CADMIN-1.17 step 8's 25s
 * `expectRejection`), so a connect attempt that can't succeed must fail well inside that budget —
 * `PeerTimingParameters.defaults.defaultConnectionTimeout` (90s) is right for a real user's
 * session but would still be "pending" when a cert step's own check gives up. Test-ergonomics bound
 * only, scoped to each cert adapter's own {@link PeerSet} below; every other consumer keeps the 90s
 * default.
 */
const CERT_PEER_CONNECTION_TIMEOUT = Seconds(15);

const CERT_PEER_SETTLE_TIMEOUT = Seconds(30);

/**
 * Budget that expresses {@link CommissioningTarget.singleHandshakeAttempt}. Below every retry interval commissioning's
 * operational connection uses — `delayBeforeNextAddress` (15s), the `NoSharedTrustRoots` fast retry (15s) and
 * `delayAfterNetworkError` (15s) — so commissioning ends on the first handshake attempt, whether or not that attempt
 * produced an answer: initial contact retransmits until the device responds, so a silent device is cut off mid-attempt.
 *
 * This bounds only how long commissioning waits, not the handshake itself, so the rejection it produces reports a
 * budget that expired rather than what the device answered. A step needing the device's own answer reads it from the
 * controller log or from the counterparty's evidence.
 */
const SINGLE_HANDSHAKE_TIMEOUT = Seconds(10);

/**
 * Waits for the peer's sustained subscription to become active (`isConnected` tracks `subscriptionActive`,
 * and the subscription bootstraps with the structure read, so this covers both).
 *
 * A step's own subscription must not be in flight while that sustained one is still establishing: it carries
 * `keepSubscriptions: false`, so the device drops the step's subscription and answers it `InvalidAction`.
 *
 * A peer that never gets there is reported, not failed: a step addresses the peer through raw interaction
 * paths, which work without a subscription, so refusing to continue would fail test cases whose device holds
 * a cluster matter.js cannot build a behavior for.
 */
async function settlePeer(peer: ClientNode) {
    if (peer.lifecycle.isConnected) {
        return;
    }
    const observers = new ObserverGroup();
    const expiry = Time.sleep("cert peer settling", CERT_PEER_SETTLE_TIMEOUT);
    try {
        const connected = new Promise<void>(resolve => {
            const check = () => {
                if (peer.lifecycle.isConnected) {
                    resolve();
                }
            };
            observers.on(peer.lifecycle.connectionStateChanged, check);
            check();
        });
        if (!(await Promise.race([connected.then(() => true), expiry.then(() => false)]))) {
            logger.warn(
                `Peer ${peer.id} held no subscription after ${Duration.format(CERT_PEER_SETTLE_TIMEOUT)} ` +
                    `(seeded: ${peer.lifecycle.isSeeded}, state: ${peer.lifecycle.connectionState}); continuing`,
            );
        }
    } finally {
        expiry.cancel();
        observers.close();
    }
}

/**
 * Wraps a controller {@link ServerNode} as a {@link ControllerAdapter} for cert tests.
 *
 * Each instance gets its own {@link Environment} (child of {@link Environment.default}) with in-memory
 * storage, so multiple adapters (e.g. "dut", "th_cr2") in the same process never share fabric/session
 * state.
 */
export class InProcessControllerAdapter implements ControllerAdapter {
    readonly id: string;
    readonly log: LogFollower;
    readonly #env: Environment;
    readonly #logStream = new LineQueue();
    #controller?: ServerNode;
    #fabric?: Fabric;
    readonly #transport?: ControllerTransport;

    constructor(id: string, options?: ControllerAdapterOptions) {
        if (adapterStreams.has(id)) {
            throw new InternalError(
                `InProcessControllerAdapter "${id}" is already registered; two live adapters with the same id ` +
                    "would misattribute each other's logs (adapterStreams is keyed by id) — give each controller " +
                    "role a unique id",
            );
        }

        this.id = id;
        this.#transport = options?.transport;
        this.#env = new Environment(`cert-${id}`, Environment.default);
        new MockStorageService(this.#env);
        this.log = new LogFollower(this.#logStream.follow(), id);

        adapterStreams.set(id, this.#logStream);
    }

    get #startedController(): ServerNode {
        if (this.#controller === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#controller;
    }

    get #adminFabric(): Fabric {
        if (this.#fabric === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#fabric;
    }

    start(): Promise<void> {
        return runTagged(this.id, async () => {
            const controller = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
                environment: this.#env,
                id: this.id,
                commissioning: { enabled: false },
                controller: { adminFabricLabel: this.id },
                network: {
                    autoStartCommissionedPeers: false,

                    // A TC that needs TCP asks for it; every other run keeps the transport its
                    // evidence and timing were written against.
                    ...(this.#transport === "tcp" ? { tcp: true, transportPreference: "tcp" as const } : {}),
                },
                subscriptions: { persistenceEnabled: false },
            });
            this.#controller = controller;

            const fabricAuthority = await controller.env.load(FabricAuthority);
            this.#fabric = await fabricAuthority.defaultFabric({ adminFabricLabel: this.id });

            await controller.start();

            controller.env.get(PeerSet).timing = {
                defaultConnectionTimeout: CERT_PEER_CONNECTION_TIMEOUT,
            };
        });
    }

    async close(): Promise<void> {
        try {
            await runTagged(this.id, async () => {
                await this.#controller?.close();
            });
        } finally {
            adapterStreams.delete(this.id);
            this.#logStream.close();
        }
    }

    async parseQrPayload(code: string): Promise<OnboardingPayloadFields> {
        const { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode } =
            singleQrPayload(code);
        return { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode };
    }

    async parseManualPairingCode(code: string): Promise<ManualPairingCodeFields> {
        const { shortDiscriminator, passcode, vendorId, productId } = refusalOf(
            () => ManualPairingCodeCodec.decode(code),
            `manual pairing code ${code}`,
        );
        if (shortDiscriminator === undefined) {
            throw new InternalError(`Manual pairing code ${code} decoded to no short discriminator`);
        }
        return { shortDiscriminator, passcode, vendorId, productId };
    }

    commission(target: CommissioningTarget): Promise<CertNodeRef> {
        return runTagged(this.id, async () => {
            const { identifierData, passcode, vendorId, productId } = resolveCommissioningTarget(target);
            // A commissioned peer holds the sustained wildcard subscription that bootstraps its own structure
            // read, so the standalone post-commissioning read is suppressed — one read, not two.
            const peer = await this.#startedController.peers.commission({
                ...identifierData,
                passcode,
                vendorId,
                productId,
                autoStateInitialize: false,
                caseConnectionTimeout: target.singleHandshakeAttempt ? SINGLE_HANDSHAKE_TIMEOUT : undefined,
                timeout: target.giveUpAfterMs === undefined ? undefined : Millis(target.giveUpAfterMs),
                regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
                regulatoryCountryCode: "XX",
                onAttestationFailure: findings => {
                    // Accepting is what lets a test device commission at all; the evidence still has
                    // to say what was accepted, or a step asserting a clean attestation proves nothing
                    logger.notice(
                        `Accepting device attestation findings: ${findings
                            .map(({ level, type, message }) => `${level} ${type}: ${message}`)
                            .join("; ")}`,
                    );
                    return true;
                },
            });
            const address = peer.peerAddress;
            if (address === undefined) {
                throw new InternalError(`Commissioned peer ${peer.id} has no peer address`);
            }
            await settlePeer(peer);
            return address.nodeId.toString();
        });
    }

    node(ref: CertNodeRef): CertNodeApi {
        return new InProcessCertNodeApi(this.id, this.#startedController, this.#adminFabric, ref);
    }
}
