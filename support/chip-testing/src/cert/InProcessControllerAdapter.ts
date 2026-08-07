/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Environment,
    ImplementationError,
    InternalError,
    LogDestination,
    LogFormat,
    Logger,
    MockStorageService,
} from "@matter/main";
import { OperationalCredentialsClient } from "@matter/main/behaviors/operational-credentials";
import { GeneralCommissioning } from "@matter/main/clusters";
import {
    AttributeId,
    ClusterId,
    ClusterType,
    EndpointNumber,
    FabricIndex,
    NodeId,
    StatusResponseError,
} from "@matter/main/types";
import { AttributeModel, ClusterModel, Matter } from "@matter/model";
import { CommissioningController } from "@project-chip/matter.js";
import { AsyncLocalStorage } from "node:async_hooks";
import type {
    AttributePathSpec,
    CertNodeApi,
    CertNodeRef,
    CommissioningTarget,
    ControllerAdapter,
    LogSource,
    SubscribeOptions,
} from "@matter/testing";

/**
 * Attributes a matter.js controller `write`/`invoke` call to the {@link InProcessControllerAdapter} whose
 * operation is currently on the call stack, so the shared log destination below can route lines to the
 * right adapter's {@link LogSource} even when multiple adapters run concurrently in one process.
 */
const activeAdapterId = new AsyncLocalStorage<string>();

const adapterStreams = new Map<string, LineStream>();
let logCaptureInstalled = false;

function installLogCapture() {
    if (logCaptureInstalled) {
        return;
    }
    logCaptureInstalled = true;

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
}

function runTagged<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return activeAdapterId.run(id, fn);
}

/** A pull/push line buffer satisfying {@link LogSource}. */
class LineStream implements LogSource {
    #lines = new Array<string>();
    #waiters = new Array<() => void>();
    #closed = false;

    push(line: string) {
        this.#lines.push(line);
        this.#wake();
    }

    close() {
        this.#closed = true;
        this.#wake();
    }

    #wake() {
        const waiters = this.#waiters;
        this.#waiters = new Array<() => void>();
        for (const resolve of waiters) resolve();
    }

    async *follow(): AsyncIterable<string> {
        let index = 0;
        while (true) {
            while (index < this.#lines.length) {
                yield this.#lines[index++];
            }
            if (this.#closed) {
                return;
            }
            await new Promise<void>(resolve => this.#waiters.push(resolve));
        }
    }
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
    readonly #controller: CommissioningController;
    readonly #nodeId: NodeId;

    constructor(adapterId: string, controller: CommissioningController, ref: CertNodeRef) {
        this.#adapterId = adapterId;
        this.#controller = controller;
        this.#nodeId = NodeId(ref);
    }

    async #node() {
        return this.#controller.getNode(this.#nodeId);
    }

    async #interactionClient() {
        return (await this.#node()).getInteractionClient();
    }

    invoke(cluster: string | number, command: string, args?: object, endpoint = 0): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const { model: clusterModel, id: clusterId } = clusterModelFor(cluster);
            const clusterType = ClusterType(clusterModel) as ClusterType.Concrete;
            const commandType = clusterType.commands?.[command];
            if (commandType === undefined) {
                throw new ImplementationError(`Unknown command "${command}" on cluster ${cluster}`);
            }
            const client = await this.#interactionClient();
            return await client.invoke({
                endpointId: EndpointNumber(endpoint),
                clusterId: ClusterId(clusterId),
                command: commandType,
                // Argument-less commands require an absent payload — {} fails TLV validation ("expected void")
                request: args !== undefined && Object.keys(args).length > 0 ? args : undefined,
            });
        });
    }

    readAttribute(path: AttributePathSpec): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const client = await this.#interactionClient();
            const { endpointId, clusterId, attributeId } = toIds(path);
            const { attributeData, attributeStatus } = await client.getMultipleAttributesAndStatus({
                attributes: [{ endpointId, clusterId, attributeId }],
            });
            if (attributeStatus?.length) {
                throw new StatusResponseError(
                    `readAttribute ${JSON.stringify(path)} failed`,
                    attributeStatus[0].status,
                );
            }
            if (isConcretePath(path)) {
                if (attributeData.length === 0) {
                    throw new InternalError(`readAttribute ${JSON.stringify(path)} returned no data`);
                }
                return attributeData[0].value;
            }
            return attributeData.map(({ path: { endpointId, clusterId, attributeId }, value }) => ({
                endpoint: endpointId,
                cluster: clusterId,
                attribute: attributeId,
                value,
            }));
        });
    }

    writeAttribute(path: AttributePathSpec, value: unknown): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const { endpoint, cluster, attribute } = path;
            if (endpoint === undefined || cluster === undefined || attribute === undefined) {
                throw new ImplementationError("writeAttribute requires a concrete endpoint/cluster/attribute path");
            }
            const attributeModel =
                Matter.clusters(cluster)?.attributes(attribute) ?? inferAttributeModel(attribute, value);
            const client = await this.#interactionClient();
            await client.setAttribute({
                attributeData: {
                    endpointId: EndpointNumber(endpoint),
                    clusterId: ClusterId(cluster),
                    attribute: { id: AttributeId(attribute), name: attributeModel.name, schema: attributeModel },
                    value,
                },
            });
        });
    }

    subscribe(path: AttributePathSpec, opts: SubscribeOptions): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const client = await this.#interactionClient();
            const { endpointId, clusterId, attributeId } = toIds(path);
            let seeding = true;
            const { attributeReports = [] } = await client.subscribeMultipleAttributesAndEvents({
                attributes: [{ endpointId, clusterId, attributeId }],
                minIntervalFloorSeconds: opts.minIntervalFloorSeconds,
                maxIntervalCeilingSeconds: opts.maxIntervalCeilingSeconds,
                attributeListener: data => {
                    if (seeding) return;
                    opts.onUpdate?.(data.value);
                },
                keepSubscriptions: false,
            });
            seeding = false;
            if (isConcretePath(path)) {
                return attributeReports[0]?.value;
            }
            return attributeReports.map(({ path: { endpointId, clusterId, attributeId }, value }) => ({
                endpoint: endpointId,
                cluster: clusterId,
                attribute: attributeId,
                value,
            }));
        });
    }

    openCommissioningWindow(opts: {
        timeout: number;
        enhanced: boolean;
    }): Promise<{ manualPairingCode?: string; qrPairingCode?: string }> {
        return runTagged(this.#adapterId, async () => {
            const node = await this.#node();
            if (opts.enhanced) {
                return await node.openEnhancedCommissioningWindow(opts.timeout);
            }
            await node.openBasicCommissioningWindow(opts.timeout);
            return {};
        });
    }

    removeFabric(fabricIndex: number): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const node = await this.#node();
            return await node.commandsOf(OperationalCredentialsClient).removeFabric({
                fabricIndex: FabricIndex(fabricIndex),
            });
        });
    }

    readFabrics(): Promise<unknown[]> {
        return runTagged(this.#adapterId, async () => {
            const node = await this.#node();
            const { fabrics } = await node.getStateOf(OperationalCredentialsClient, ["fabrics"]);
            return fabrics ?? [];
        });
    }

    decommission(): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const node = await this.#node();
            await node.decommission();
        });
    }
}

/**
 * Wraps a legacy {@link CommissioningController} as a {@link ControllerAdapter} for cert tests.
 *
 * Each instance gets its own {@link Environment} (child of {@link Environment.default}) with in-memory
 * storage, so multiple adapters (e.g. "dut", "th_cr2") in the same process never share fabric/session
 * state.
 */
export class InProcessControllerAdapter implements ControllerAdapter {
    readonly id: string;
    readonly #controller: CommissioningController;
    readonly #logStream = new LineStream();

    constructor(id: string) {
        this.id = id;
        const env = new Environment(`cert-${id}`, Environment.default);
        new MockStorageService(env);
        this.#controller = new CommissioningController({
            environment: { environment: env, id },
            autoConnect: false,
            adminFabricLabel: id,
        });

        installLogCapture();
        adapterStreams.set(id, this.#logStream);
    }

    get log(): LogSource {
        return this.#logStream;
    }

    start(): Promise<void> {
        return runTagged(this.id, () => this.#controller.start());
    }

    async close(): Promise<void> {
        try {
            await runTagged(this.id, () => this.#controller.close());
        } finally {
            adapterStreams.delete(this.id);
            this.#logStream.close();
        }
    }

    commission(target: CommissioningTarget): Promise<CertNodeRef> {
        return runTagged(this.id, async () => {
            const nodeId = await this.#controller.commissionNode({
                commissioning: {
                    regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
                    regulatoryCountryCode: "XX",
                    onAttestationFailure: true,
                },
                discovery: {
                    identifierData: { longDiscriminator: target.discriminator },
                },
                passcode: target.passcode,
            });
            return nodeId.toString();
        });
    }

    node(ref: CertNodeRef): CertNodeApi {
        return new InProcessCertNodeApi(this.id, this.#controller, ref);
    }
}
