/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Duration } from "@matter/general";
import {
    Diagnostic,
    ImplementationError,
    InternalError,
    isObject,
    MatterError,
    Minutes,
    Mutex,
    UnexpectedDataError,
} from "@matter/general";
import { getOperationalDeviceQname } from "@matter/main/protocol";
import { GlobalFabricId, ManualPairingCodeCodec, NodeId, Status, StatusResponseError } from "@matter/main/types";
import { Matter } from "@matter/model";
import type {
    AttributePathSpec,
    AttributeReadEntry,
    CertGroupApi,
    CertNodeApi,
    CertNodeRef,
    ClientAttributePath,
    ClientEndpointEntry,
    CommissioningTarget,
    ControllerAdapter,
    ControllerAdapterOptions,
    ControllerCapability,
    ControllerCapabilityGaps,
    ManualPairingCodeFields,
    OnboardingPayloadFields,
    PicsValues,
    ReadAttributeOptions,
    TimedInteractionOptions,
} from "@matter/testing";
import { capabilitiesFor, CertConfigError, LogFollower, UnsupportedByControllerError } from "@matter/testing";
import { env } from "node:process";
import type { MatterServerClient } from "../matter-server/matter-server-client.js";
import { MatterServerProcess } from "../matter-server/matter-server-process.js";
import {
    decodeAttributeResult,
    decodeCommandResponse,
    encodeAttributeValue,
    encodeCommandPayload,
    MatterServerUnmodeledError,
    type WireAttributeResult,
} from "../matter-server/matter-server-wire.js";
import { findCertCluster } from "./custom-clusters.js";
import { refusalOf, singleQrPayload } from "./onboarding-payload.js";
import { timedInteractionTimeoutOf } from "./timed-interaction.js";

/** Name {@link UnsupportedByControllerError} reports for this adapter. */
const CONTROLLER = "matterjs-server";

/**
 * Outlasts matter.js's own commissioning budget, which waits out the specification's 3-minute minimum commissioning
 * window for a device that never answers: a WS timeout before that would report a failure while the server still
 * commissions.
 */
const COMMISSION_TIMEOUT = Minutes(5);

/** `handleReadAttributes` sends at most this many paths per ReadRequest and splits a longer list into several. */
const MAX_PATHS_PER_READ = 9;

/** Concrete ids `splitAttributePath` on the server reads as wildcards. */
const WILDCARD_ENDPOINT = 0xffff;
const WILDCARD_CLUSTER = 0xffffffff;
const WILDCARD_ATTRIBUTE = 0xffffffff;

const DESCRIPTOR = 0x1d;
const DEVICE_TYPE_LIST = 0;
const PARTS_LIST = 3;

/**
 * What this controller claims about itself, overlaying the device's PICS for a run (see `controllerPicsOverridesFor`).
 * Only what differs from the CHIP PICS file, which describes a device.
 */
export const MATTERJS_SERVER_CONTROLLER_PICS: PicsValues = {
    // `device_command` sends one command per invoke request and no CommandRef.
    "MCORE.IDM.C.InvokeRequest.BatchCommands": 0,

    "MCORE.ROLE.COMMISSIONER": 1,

    // `commission_with_code` takes either onboarding payload, the scanned `MT:…` form included.
    "MCORE.DD.QR_COMMISSIONING": 1,
    "MCORE.DD.MANUAL_PC_COMMISSIONING": 1,
    "MCORE.DD.SCAN_QR_CODE": 1,

    // A concatenated payload names several commissionees and is refused; the caller is told to split it.
    "MCORE.DD.CTRL_CONCATENATED_QR_CODE_1": 0,

    // `open_commissioning_window` ignores its `option` and always opens an enhanced window.
    "CADMIN.C.C01.Tx": 0,

    // The server takes no BDX role, and its OTA provider is not reachable through this adapter yet.
    "MCORE.BDX.Sender": 0,
    "MCORE.BDX.Responder": 0,
    "MCORE.BDX.SynchronousSender": 0,
    "MCORE.BDX.AsynchronousSender": 0,
    "MCORE.BDX.BlockQueryWithSkip": 0,
    "MCORE.OTA.Provider": 0,
    "OTAR.C.M.AnnounceOTAProvider": 0,
    "OTAP.S.M.DelayedActionTime": 0,
    "OTAP.S.M.UserConsentNeeded": 0,

    // The server has an ICD client, but this adapter does not expose it.
    "ICDB.C": 0,
    "ICDM.C": 0,

    // Started without its own subscriptions, the server holds a node as commissioning read it and maintains nothing
    // a bridge later adds, renames or reports.
    "MCORE.DEVLIST.UseDevices": 0,
    "MCORE.DEVLIST.UseDeviceName": 0,
    "MCORE.DEVLIST.UseDeviceState": 0,
    "MCORE.DEVLIST.UseBatInfo": 0,

    // Client commands `device_command` sends for the cases that need them. The CHIP PICS file answers 0 for these
    // because it describes a device; here the client is the controller.
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
    "G.C.C00.Tx": 1,
    "G.C.C01.Tx": 1,
    "G.C.C02.Tx": 1,
    "G.C.C03.Tx": 1,
    "G.C.C04.Tx": 1,
    "G.C.C05.Tx": 1,
    "GRPKEY.C.C03.Tx": 1,
    "GRPKEY.C.C04.Tx": 1,
    "S.C": 1,
    "S.C.C00.Tx": 1,
    "S.C.C01.Tx": 1,
    "S.C.C02.Tx": 1,
    "S.C.C03.Tx": 1,
    "S.C.C04.Tx": 1,
    "S.C.C05.Tx": 1,
    "S.C.C06.Tx": 1,
    "S.C.C40.Tx": 1,
    "TBRM.C": 1,
    "TBRM.C.C00.Tx": 1,
    "TBRM.C.C01.Tx": 1,
    "TBRM.C.C03.Tx": 1,
    "TBRM.C.C04.Tx": 1,
};

/**
 * What this controller lacks, declared with its registration so a step needing one of these is skipped before it acts
 * (see `controllerCapabilityGap`). The adapter refuses each of them as well, before it sends anything.
 */
export const MATTERJS_SERVER_CAPABILITY_GAPS = {
    "single-handshake-attempt":
        "the WebSocket API has no option for it, and the server's own retries would answer the refusal the step " +
        "means to prove",
    "commissioning-give-up":
        "the WebSocket API has no commissioning timeout, so the server's own policy would decide when it stops looking",
    "group-messaging": "the WebSocket API has no group key management and no group addressing",
    "tcp-transport": "the server chooses the transport of each session itself and the WebSocket API cannot ask for one",
    "data-versions": "read_attribute answers values without the cluster data versions",
    "unmodeled-data":
        "the server addresses only clusters and attributes of its own Matter model, and sends values outside it " +
        "lossily",
    attestation: "the server reads revocation from the DCL and the WebSocket API cannot install a revocation set",
    "webrtc-requestor": "the WebSocket API does not expose the server's requestor cluster to a case",
} as const satisfies ControllerCapabilityGaps;

function refusal(capability: ControllerCapability, operation: string) {
    return new UnsupportedByControllerError(operation, CONTROLLER, MATTERJS_SERVER_CAPABILITY_GAPS[capability]);
}

/** A read the server answered without a value for a concrete path the step asked for. */
export class MatterServerReadError extends MatterError {}

/** What {@link MatterServerControllerAdapter} needs of a running server. {@link MatterServerProcess} is one. */
export interface MatterServerConnection {
    readonly client: MatterServerClient;

    /** The entry point the server was started from. */
    readonly entry: string;

    /** The server's own output, which is what the adapter reports as its log. */
    readonly log: LogFollower;

    close(): Promise<void>;
}

/** Starts the server an adapter drives. */
export type MatterServerLauncher = (role: string) => Promise<MatterServerConnection>;

/**
 * Starts matterjs-server from `MATTER_CERT_SERVER_ENTRY`, on the interface `MATTER_MDNS_NETWORKINTERFACE` names
 * where it is set.
 */
async function launchFromEnvironment(role: string): Promise<MatterServerConnection> {
    const entry = env.MATTER_CERT_SERVER_ENTRY;
    if (entry === undefined || entry === "") {
        throw new CertConfigError(
            'MATTER_CERT_CONTROLLER="matterjs-server" needs MATTER_CERT_SERVER_ENTRY, the server entry point to run',
        );
    }
    return MatterServerProcess.start({ entry, role, primaryInterface: env.MATTER_MDNS_NETWORKINTERFACE || undefined });
}

/**
 * Drives matterjs-server as the DUT controller, through its WebSocket API.
 *
 * Operations the WebSocket API cannot express throw {@link UnsupportedByControllerError} before they send anything.
 * Those with a PICS key are declared in {@link MATTERJS_SERVER_CONTROLLER_PICS}, and those a step states as a
 * controller capability in {@link MATTERJS_SERVER_CAPABILITY_GAPS}, so their steps are skipped before they run.
 *
 * The server runs without subscriptions of its own, so it holds a node as commissioning read it and reports no
 * events.
 *
 * Failures carry little structure:
 *
 * - A status the device answers an invoke with surfaces as `MatterServerCommandError` with a message only.
 * - A read that returns values for only some of its paths fails with `MatterServerReadError` for the first concrete
 *   path without a value, because the server drops a path the device answered with a status. When every path is
 *   dropped, the server answers with an error and the read fails with `MatterServerCommandError` ("no values
 *   returned").
 * - A write's status code from the device surfaces as `StatusResponseError` without a cluster status. A write the
 *   server itself refuses surfaces as `MatterServerCommandError`.
 *
 * A step that asserts a particular status therefore fails rather than passing on the wrong one.
 *
 * The server merges concurrent identical invokes into one request to the device, so the adapter sends the invokes of
 * one node one at a time, in call order.
 */
export class MatterServerControllerAdapter implements ControllerAdapter {
    readonly id: string;

    readonly #launch: MatterServerLauncher;
    readonly #invokeQueues = new Map<string, Mutex>();
    #connection?: MatterServerConnection;
    #closed = false;

    constructor(id: string, options?: ControllerAdapterOptions, launch: MatterServerLauncher = launchFromEnvironment) {
        const [lacking] = capabilitiesFor(options);
        if (lacking !== undefined) {
            throw refusal(lacking, `an adapter built for ${lacking}`);
        }

        this.id = id;
        this.#launch = launch;
    }

    get log(): LogFollower {
        return this.#started.log;
    }

    get build(): Record<string, string> | undefined {
        if (this.#connection === undefined) {
            return undefined;
        }
        const { entry, client } = this.#connection;
        return {
            entry,
            sdkVersion: client.serverInfo.sdk_version,
            schemaVersion: String(client.serverInfo.schema_version),
        };
    }

    async start(): Promise<void> {
        if (this.#closed) {
            throw new ImplementationError(`Controller adapter "${this.id}" was closed and cannot be restarted`);
        }
        if (this.#connection !== undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was already started`);
        }
        const connection = await this.#launch(this.id);
        if (this.#closed) {
            await connection.close();
            throw new ImplementationError(`Controller adapter "${this.id}" was closed while it started`);
        }
        this.#connection = connection;
    }

    async close(): Promise<void> {
        this.#closed = true;
        const connection = this.#connection;
        this.#connection = undefined;
        await connection?.close();
    }

    get #started() {
        if (this.#connection === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#connection;
    }

    async commission(target: CommissioningTarget): Promise<CertNodeRef> {
        if (target.singleHandshakeAttempt) {
            throw refusal(
                "single-handshake-attempt",
                "commissioning bounded to a single operational handshake attempt",
            );
        }
        if (target.giveUpAfterMs !== undefined) {
            throw refusal("commissioning-give-up", "commissioning bounded to a discovery budget");
        }

        // The server decodes a code with the same matter.js codec, so a code it would refuse is refused here, before
        // the request, as the in-process adapter refuses it: the WebSocket API reports the server's refusal only as a
        // message.
        let command: string;
        let args: object;
        if (target.qrPairingCode) {
            singleQrPayload(target.qrPairingCode);
            command = "commission_with_code";
            args = { code: target.qrPairingCode, network_only: true };
        } else if (target.manualPairingCode !== undefined) {
            decodeManualPairingCode(target.manualPairingCode);
            command = "commission_with_code";
            args = { code: target.manualPairingCode, network_only: true };
        } else if (target.passcode !== undefined && target.discriminator !== undefined) {
            command = "commission_on_network";
            args = { setup_pin_code: target.passcode, filter_type: 2, filter: target.discriminator };
        } else {
            throw new ImplementationError(
                "commission() requires a target.qrPairingCode, a target.manualPairingCode, or both target.passcode " +
                    "and target.discriminator",
            );
        }

        const node = await this.#started.client.command(command, args, COMMISSION_TIMEOUT);
        if (!isObject(node) || (typeof node.node_id !== "number" && typeof node.node_id !== "bigint")) {
            throw new UnexpectedDataError(
                `matterjs-server answered ${command} without a node id: ${Diagnostic.json(node)}`,
            );
        }
        return node.node_id.toString();
    }

    /**
     * The WebSocket API reports no parse, so this reads the payload with the matter.js codec the server's
     * `commission_with_code` reads it with.
     */
    async parseQrPayload(code: string): Promise<OnboardingPayloadFields> {
        const { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode } =
            singleQrPayload(code);
        return { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode };
    }

    /** As {@link parseQrPayload}, with the codec `commission_with_code` reads a manual pairing code with. */
    async parseManualPairingCode(code: string): Promise<ManualPairingCodeFields> {
        const { shortDiscriminator, passcode, vendorId, productId } = decodeManualPairingCode(code);
        if (shortDiscriminator === undefined) {
            throw new InternalError(`Manual pairing code ${code} decoded to no short discriminator`);
        }
        return { shortDiscriminator, passcode, vendorId, productId };
    }

    node(ref: CertNodeRef): CertNodeApi {
        const key = NodeId(BigInt(ref)).toString();
        let queue = this.#invokeQueues.get(key);
        if (queue === undefined) {
            queue = new Mutex(`matterjs-server invokes of node ${key}`);
            this.#invokeQueues.set(key, queue);
        }
        return new MatterServerCertNodeApi(() => this.#started.client, ref, queue);
    }

    group(_groupId: number): CertGroupApi {
        return new MatterServerCertGroupApi();
    }
}

class MatterServerCertGroupApi implements CertGroupApi {
    async defineKeySet(): Promise<void> {
        throw refusal("group-messaging", "installing a group key set");
    }

    async invoke(): Promise<void> {
        throw refusal("group-messaging", "invoking a group command");
    }
}

class MatterServerCertNodeApi implements CertNodeApi {
    readonly #client: () => MatterServerClient;
    readonly #nodeId: NodeId;
    readonly #invokeQueue: Mutex;

    constructor(client: () => MatterServerClient, ref: CertNodeRef, invokeQueue: Mutex) {
        this.#client = client;
        this.#invokeQueue = invokeQueue;
        this.#nodeId = NodeId(BigInt(ref));
    }

    #command(command: string, args: object, timeout?: Duration) {
        return this.#client().command(command, args, timeout);
    }

    async invoke(
        cluster: string | number,
        command: string,
        args?: object,
        endpoint = 0,
        options?: TimedInteractionOptions,
    ): Promise<unknown> {
        const clusterModel = Matter.clusters(cluster);
        if (clusterModel === undefined) {
            if (findCertCluster(cluster) !== undefined) {
                throw refusal("unmodeled-data", `invoke ${cluster}.${command}`);
            }
            throw new ImplementationError(`Unknown cluster ${cluster}`);
        }
        const commandModel = clusterModel.commands(command);
        if (clusterModel.id === undefined || commandModel === undefined) {
            throw new ImplementationError(`Unknown command "${command}" on cluster ${clusterModel.name}`);
        }

        const timeout = timedInteractionTimeoutOf(options);
        if (timeout === 0) {
            throw new UnsupportedByControllerError(
                `invoke ${clusterModel.name}.${commandModel.name} timed with a zero timeout`,
                CONTROLLER,
                "the server makes an invoke timed only for a non-zero timeout, so it would send this one untimed",
            );
        }

        const request = {
            node_id: this.#nodeId,
            endpoint_id: endpoint,
            cluster_id: clusterModel.id,
            command_name: commandModel.name,
            payload: encodeCommandPayload(clusterModel.id, commandModel.name, args ?? {}),
            ...(timeout === undefined ? {} : { timed_request_timeout_ms: timeout }),
        };
        const result = await this.#invokeQueue.produce(() => this.#command("device_command", request));
        return decodeCommandResponse(clusterModel.id, commandModel.name, result);
    }

    async invokeBatch(): Promise<never> {
        throw new UnsupportedByControllerError(
            "invokeBatch",
            CONTROLLER,
            "device_command sends one command per invoke request and no CommandRef",
        );
    }

    async readAttribute(path: AttributePathSpec, options?: ReadAttributeOptions): Promise<unknown> {
        const values = await this.#read([path], options);
        const key = concreteKeyOf(path);
        if (key === undefined) {
            return entriesOf(values);
        }
        return valueAt(values, key);
    }

    async readAttributes(paths: AttributePathSpec[], options?: ReadAttributeOptions): Promise<AttributeReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("readAttributes requires at least one path");
        }
        if (paths.length > MAX_PATHS_PER_READ) {
            throw new UnsupportedByControllerError(
                "readAttributes",
                CONTROLLER,
                `${paths.length} paths do not fit the one ReadRequest this method promises; the server sends at most ` +
                    `${MAX_PATHS_PER_READ} per request`,
            );
        }

        const values = await this.#read(paths, options);
        for (const path of paths) {
            const key = concreteKeyOf(path);
            if (key !== undefined) {
                valueAt(values, key);
            }
        }
        return entriesOf(values);
    }

    async writeAttribute(path: AttributePathSpec, value: unknown, options?: TimedInteractionOptions): Promise<void> {
        const { endpoint, cluster, attribute } = path;
        if (endpoint === undefined || cluster === undefined || attribute === undefined) {
            throw new ImplementationError("writeAttribute requires a concrete endpoint/cluster/attribute path");
        }
        if (timedInteractionTimeoutOf(options) !== undefined) {
            throw new UnsupportedByControllerError(
                "a timed write",
                CONTROLLER,
                "write_attribute has no timed-request timeout",
            );
        }
        assertExpressible(path);
        if (Matter.clusters(cluster)?.attributes(attribute) === undefined) {
            throw refusal("unmodeled-data", `writing attribute ${attribute} of cluster ${cluster}`);
        }

        const result = await this.#command("write_attribute", {
            node_id: this.#nodeId,
            attribute_path: pathKeyOf(path),
            value: encodeAttributeValue(cluster, attribute, value),
        });
        const status = writeStatusOf(result);
        if (status !== Status.Success) {
            throw StatusResponseError.create(status);
        }
    }

    async writeAttributes(): Promise<never> {
        throw new UnsupportedByControllerError(
            "writeAttributes",
            CONTROLLER,
            "write_attribute writes one attribute per request, by a concrete path and without a data version",
        );
    }

    async subscribe(): Promise<never> {
        throw new UnsupportedByControllerError(
            "subscribe",
            CONTROLLER,
            "this adapter does not drive the server's subscriptions yet",
        );
    }

    async readEvents(): Promise<never> {
        throw new UnsupportedByControllerError("readEvents", CONTROLLER, "this adapter does not read events yet");
    }

    async subscribeEvents(): Promise<never> {
        throw new UnsupportedByControllerError(
            "subscribeEvents",
            CONTROLLER,
            "this adapter does not drive the server's subscriptions yet",
        );
    }

    async observeEvents(): Promise<never> {
        throw new UnsupportedByControllerError(
            "observeEvents",
            CONTROLLER,
            "the server runs without a sustained subscription of its own, so there is none to observe events " +
                "through, and the events a node already holds need an event read this adapter does not have yet",
        );
    }

    async clientEndpoints(): Promise<ClientEndpointEntry[]> {
        const attributes = await this.#heldAttributes();
        const endpoints = new Set<number>();
        for (const key of Object.keys(attributes)) {
            const match = /^(\d+)\//.exec(key);
            if (match !== null) {
                endpoints.add(Number(match[1]));
            }
        }

        return [...endpoints]
            .sort((a, b) => a - b)
            .map(endpoint => ({
                endpoint,
                deviceTypes: listAt(attributes, `${endpoint}/${DESCRIPTOR}/${DEVICE_TYPE_LIST}`).map(deviceTypeOf),
                parts: listAt(attributes, `${endpoint}/${DESCRIPTOR}/${PARTS_LIST}`).map(Number),
            }));
    }

    async clientAttribute(path: ClientAttributePath): Promise<unknown> {
        const attributes = await this.#heldAttributes();
        return heldValue(attributes, pathKeyOf(path));
    }

    async sessions(): Promise<never> {
        throw new UnsupportedByControllerError(
            "the sessions the controller holds with a node",
            CONTROLLER,
            "the WebSocket API exposes no session state",
        );
    }

    async severTransportConnection(): Promise<never> {
        throw new UnsupportedByControllerError(
            "severing the connection beneath a session",
            CONTROLLER,
            "the WebSocket API exposes no session a case could reach into",
        );
    }

    icdClient(): never {
        throw new UnsupportedByControllerError(
            "icdClient",
            CONTROLLER,
            "this adapter does not expose the server's ICD client",
        );
    }

    async serveOtaUpdate(): Promise<never> {
        throw new UnsupportedByControllerError(
            "serveOtaUpdate",
            CONTROLLER,
            "this adapter does not stage images with the server's OTA provider yet",
        );
    }

    async announceOtaProvider(): Promise<never> {
        throw new UnsupportedByControllerError(
            "announceOtaProvider",
            CONTROLLER,
            "this adapter does not report what the server's OTA provider answers",
        );
    }

    async scriptOtaProvider(): Promise<never> {
        throw new UnsupportedByControllerError(
            "scriptOtaProvider",
            CONTROLLER,
            "the server's OTA provider answers for itself and cannot be scripted",
        );
    }

    async openCommissioningWindow(opts: {
        timeout: number;
        enhanced: boolean;
    }): Promise<{ manualPairingCode?: string; qrPairingCode?: string }> {
        if (!opts.enhanced) {
            throw new UnsupportedByControllerError(
                "opening a basic commissioning window",
                CONTROLLER,
                "open_commissioning_window ignores its option and always opens an enhanced window",
            );
        }

        const result = await this.#command("open_commissioning_window", {
            node_id: this.#nodeId,
            timeout: opts.timeout,
        });
        if (
            !isObject(result) ||
            typeof result.setup_manual_code !== "string" ||
            typeof result.setup_qr_code !== "string"
        ) {
            throw new UnexpectedDataError(
                `matterjs-server answered open_commissioning_window without pairing codes: ${Diagnostic.json(result)}`,
            );
        }
        return { manualPairingCode: result.setup_manual_code, qrPairingCode: result.setup_qr_code };
    }

    /** Relies on `remove_node` sending RemoveFabric, which the server does whenever it runs without its own subscriptions. */
    async decommission(): Promise<void> {
        await this.#command("remove_node", { node_id: this.#nodeId });
    }

    async operationalMdnsInstanceName(): Promise<string> {
        const compressedFabricId = GlobalFabricId(BigInt(this.#client().serverInfo.compressed_fabric_id));
        return getOperationalDeviceQname(compressedFabricId, this.#nodeId);
    }

    async #read(paths: AttributePathSpec[], options?: ReadAttributeOptions) {
        if (options?.dataVersions) {
            throw refusal("data-versions", "a read that reports data versions");
        }
        if (options?.largeMessage) {
            throw refusal("tcp-transport", "a read that requires a session permitting large payloads");
        }
        paths.forEach(assertExpressible);

        const keys = paths.map(pathKeyOf);
        const result = await this.#command("read_attribute", {
            node_id: this.#nodeId,
            attribute_path: keys.length === 1 ? keys[0] : keys,
            fabric_filtered: options?.fabricFiltered ?? true,
        });
        if (!isObject(result)) {
            throw new UnexpectedDataError(`matterjs-server answered read_attribute with ${Diagnostic.json(result)}`);
        }
        return decodeAttributeResult(result);
    }

    async #heldAttributes() {
        const node = await this.#command("get_node", { node_id: this.#nodeId });
        if (!isObject(node) || !isObject(node.attributes)) {
            throw new UnexpectedDataError(
                `matterjs-server answered get_node without attributes: ${Diagnostic.json(node)}`,
            );
        }
        return node.attributes;
    }
}

/** The server's `"endpoint/cluster/attribute"` path, `*` for an absent segment. */
function pathKeyOf({ endpoint, cluster, attribute }: AttributePathSpec) {
    return `${endpoint ?? "*"}/${cluster ?? "*"}/${attribute ?? "*"}`;
}

function concreteKeyOf(path: AttributePathSpec) {
    const { endpoint, cluster, attribute } = path;
    return endpoint === undefined || cluster === undefined || attribute === undefined ? undefined : pathKeyOf(path);
}

function assertExpressible(path: AttributePathSpec) {
    if (
        path.endpoint === WILDCARD_ENDPOINT ||
        path.cluster === WILDCARD_CLUSTER ||
        path.attribute === WILDCARD_ATTRIBUTE
    ) {
        throw new UnsupportedByControllerError(
            `addressing ${JSON.stringify(path)}`,
            CONTROLLER,
            "the server reads this concrete id as a wildcard",
        );
    }
}

/**
 * The server drops a path the device answered with a status rather than reporting it, so a concrete path without a
 * value failed for a reason the WebSocket API does not carry.
 */
function valueAt(values: Map<string, WireAttributeResult>, key: string) {
    const entry = values.get(key);
    if (entry === undefined) {
        throw new MatterServerReadError(
            `matterjs-server returned no value for ${key}; the server drops paths the device answered with a status`,
        );
    }
    return valueOf(entry, key);
}

/**
 * A value the server sent for a path outside its model has nothing an in-process read would return to compare with,
 * which is a gap of this controller rather than a fault of the device.
 */
function valueOf(entry: WireAttributeResult, key: string) {
    if (entry.kind === "value") {
        return entry.value;
    }
    if (entry.error instanceof MatterServerUnmodeledError) {
        throw refusal("unmodeled-data", `reporting ${key}`);
    }
    throw entry.error;
}

function decodeManualPairingCode(code: string) {
    return refusalOf(() => ManualPairingCodeCodec.decode(code), `manual pairing code ${code}`);
}

/**
 * The entries an in-process wildcard read returns, without the data version the WebSocket API does not carry.
 *
 * A value that does not decode fails the whole read: an in-process read would have returned it, so leaving it out
 * would answer a step with less than the device reported.
 */
function entriesOf(values: Map<string, WireAttributeResult>): AttributeReadEntry[] {
    const entries = new Array<AttributeReadEntry>();
    for (const [key, entry] of values) {
        const value = valueOf(entry, key);
        const [endpoint, cluster, attribute] = key.split("/").map(Number);
        entries.push({ endpoint, cluster, attribute, value });
    }
    return entries;
}

function heldValue(attributes: Record<string, unknown>, key: string): unknown {
    if (!Object.hasOwn(attributes, key)) {
        return undefined;
    }
    const entry = decodeAttributeResult({ [key]: attributes[key] }).get(key);
    if (entry === undefined) {
        throw new UnexpectedDataError(`Decoding matterjs-server's held value for ${key} produced no result`);
    }
    return valueOf(entry, key);
}

function deviceTypeOf(entry: unknown): number {
    if (!isObject(entry) || typeof entry.deviceType !== "number") {
        throw new UnexpectedDataError(
            `matterjs-server holds a device type entry without a device type: ${Diagnostic.json(entry)}`,
        );
    }
    return entry.deviceType;
}

function listAt(attributes: Record<string, unknown>, key: string): unknown[] {
    const value = heldValue(attributes, key);
    return Array.isArray(value) ? value : [];
}

/** The one status `write_attribute` answers for its one path. */
function writeStatusOf(result: unknown): number {
    if (Array.isArray(result) && result.length === 1) {
        const [entry] = result;
        if (isObject(entry) && typeof entry.Status === "number") {
            return entry.Status;
        }
    }
    throw new UnexpectedDataError(`matterjs-server answered write_attribute with ${Diagnostic.json(result)}`);
}
