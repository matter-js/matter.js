/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Boot,
    ClientNode,
    ControllerBehavior,
    Duration,
    Environment,
    ImplementationError,
    InternalError,
    LogDestination,
    LogFormat,
    Logger,
    MockStorageService,
    ObserverGroup,
    Seconds,
    ServerNode,
    Time,
} from "@matter/main";
import { GeneralCommissioning } from "@matter/main/clusters";
import {
    ClientRead,
    CommissionableDeviceIdentifiers,
    Fabric,
    FabricAuthority,
    getOperationalDeviceQname,
    Invoke,
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
    ManualPairingCodeCodec,
    NodeId,
    Status,
    StatusResponseError,
} from "@matter/main/types";
import { AttributeModel, ClusterModel, Matter } from "@matter/model";
import type {
    AttributePathSpec,
    CertNodeApi,
    CertNodeRef,
    CommissioningTarget,
    ControllerAdapter,
    ReadAttributeOptions,
    SubscribeOptions,
} from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Attributes a matter.js controller `write`/`invoke` call to the {@link InProcessControllerAdapter} whose
 * operation is currently on the call stack, so the shared log destination below can route lines to the
 * right adapter's {@link LogSource} even when multiple adapters run concurrently in one process.
 */
const activeAdapterId = new AsyncLocalStorage<string>();

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

function isConcretePath(path: AttributePathSpec) {
    return path.endpoint !== undefined && path.cluster !== undefined && path.attribute !== undefined;
}

function toWireValues(values: ReadResult.AttributeValue[]) {
    return values.map(({ path: { endpointId, clusterId, attributeId }, value }) => ({
        endpoint: endpointId,
        cluster: clusterId,
        attribute: attributeId,
        value,
    }));
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
}

/**
 * A `manualPairingCode` (from an enhanced commissioning window) only carries a short discriminator
 * (§ 5.1.4.1's 4-bit form) and the window's freshly-generated passcode — never the device's original
 * setup passcode/discriminator, which `openEnhancedCommissioningWindow` deliberately replaces per
 * window. `target.passcode`/`target.discriminator` are for the device's original setup code instead.
 */
function resolveCommissioningTarget(target: CommissioningTarget): ResolvedCommissioningTarget {
    if (target.manualPairingCode !== undefined) {
        const { shortDiscriminator, passcode } = ManualPairingCodeCodec.decode(target.manualPairingCode);
        if (shortDiscriminator === undefined) {
            throw new ImplementationError("Manual pairing code did not decode to a short discriminator");
        }
        return { identifierData: { shortDiscriminator }, passcode };
    }
    if (target.passcode === undefined || target.discriminator === undefined) {
        throw new ImplementationError(
            "commission() requires either target.manualPairingCode or both target.passcode and target.discriminator",
        );
    }
    return { identifierData: { longDiscriminator: target.discriminator }, passcode: target.passcode };
}

function clusterModelFor(cluster: string | number): { model: ClusterModel; id: number } {
    const model = Matter.clusters(cluster);
    if (model === undefined) {
        throw new ImplementationError(`Unknown cluster ${cluster}`);
    }
    const { id } = model;
    if (id === undefined) {
        throw new InternalError(`Cluster model for ${cluster} has no id`);
    }
    return { model, id };
}

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
            throw new ImplementationError(
                `Controller "${this.#adapterId}" has no commissioned peer with node id ${this.#nodeId}`,
            );
        }
        return peer;
    }

    invoke(cluster: string | number, command: string, args?: object, endpoint = 0): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const { model: clusterModel, id: clusterId } = clusterModelFor(cluster);
            const commandModel = clusterModel.commands(command);
            if (commandModel?.id === undefined) {
                throw new ImplementationError(`Unknown command "${command}" on cluster ${cluster}`);
            }
            const request = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(endpoint),
                        cluster: { id: ClusterId(clusterId), name: clusterModel.name },
                        command: {
                            id: CommandId(commandModel.id),
                            name: commandModel.name,
                            schema: commandModel,
                        },
                        // Argument-less commands require an absent payload — {} fails TLV validation ("expected void")
                        fields: args !== undefined && Object.keys(args).length > 0 ? args : undefined,
                    }),
                ],
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

    writeAttribute(path: AttributePathSpec, value: unknown): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const { endpoint, cluster, attribute } = path;
            if (endpoint === undefined || cluster === undefined || attribute === undefined) {
                throw new ImplementationError("writeAttribute requires a concrete endpoint/cluster/attribute path");
            }
            const clusterModel = Matter.clusters(cluster);
            const attributeModel = clusterModel?.attributes(attribute) ?? inferAttributeModel(attribute, value);
            const result = await this.#peer.interaction.write(
                Write(
                    Write.Attribute({
                        endpoint: EndpointNumber(endpoint),
                        cluster: { id: ClusterId(cluster), name: clusterModel?.name ?? `cluster_${cluster}` },
                        attributes: {
                            id: AttributeId(attribute),
                            name: attributeModel.name,
                            schema: attributeModel,
                        },
                        value,
                    }),
                ),
            );
            WriteResult.assertSuccess(result);
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
            await this.#peer.decommission();
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

    constructor(id: string) {
        if (adapterStreams.has(id)) {
            throw new InternalError(
                `InProcessControllerAdapter "${id}" is already registered; two live adapters with the same id ` +
                    "would misattribute each other's logs (adapterStreams is keyed by id) — give each controller " +
                    "role a unique id",
            );
        }

        this.id = id;
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
                network: { autoStartCommissionedPeers: false },
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

    commission(target: CommissioningTarget): Promise<CertNodeRef> {
        return runTagged(this.id, async () => {
            const { identifierData, passcode } = resolveCommissioningTarget(target);
            // A commissioned peer holds the sustained wildcard subscription that bootstraps its own structure
            // read, so the standalone post-commissioning read is suppressed — one read, not two.
            const peer = await this.#startedController.peers.commission({
                ...identifierData,
                passcode,
                autoStateInitialize: false,
                regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
                regulatoryCountryCode: "XX",
                onAttestationFailure: () => true,
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
