/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ClosedError,
    Diagnostic,
    ImplementationError,
    isObject,
    Logger,
    MatterError,
    Millis,
    Minutes,
    Mutex,
    Seconds,
    UnexpectedDataError,
} from "@matter/general";
import { DiscoveryError } from "@matter/main";
import {
    AccessControl,
    Descriptor,
    IcdManagement,
    OperationalCredentials,
    OtaSoftwareUpdateProvider,
    OtaSoftwareUpdateRequestor,
} from "@matter/main/clusters";
import { getOperationalDeviceQname } from "@matter/main/protocol";
import { GlobalFabricId, NodeId, Status, StatusResponseError } from "@matter/main/types";
import type {
    AnnounceOtaProviderOptions,
    AttestationApi,
    AttributePathSpec,
    AttributeReadEntry,
    AttributeWriteEntry,
    AttributeWriteStatus,
    BatchCommandResult,
    BatchCommandSpec,
    CertControllerGroup,
    CertGroupApi,
    CertIcdClientApi,
    CertNodeApi,
    CertNodeRef,
    ClientAttributePath,
    ClientEndpointEntry,
    CommissionableNodeFilter,
    CommissioningTarget,
    ControllerAdapter,
    ControllerAdapterOptions,
    ControllerCapabilitiesOutOfScope,
    ControllerCapability,
    ControllerCapabilityGaps,
    DiscoveredCommissionableNode,
    EventPathSpec,
    EventReadEntry,
    GroupKeySetSpec,
    ManualPairingCodeFields,
    ObserveEventOptions,
    OnboardingPayloadFields,
    OtaAnnouncement,
    OtaAnnouncementRecord,
    OtaBdxTransfer,
    ReadAttributeOptions,
    ReadEventOptions,
    ServeOtaUpdateOptions,
    SubscribeAttributesOptions,
    SubscribeEventOptions,
    SubscribeOptions,
    TimedInteractionOptions,
} from "@matter/testing";
import { capabilitiesFor, CertConfigError, LogFollower, UnsupportedByControllerError } from "@matter/testing";
import { env } from "node:process";
import { type CertContextFile, certContextFor } from "../matter-server/matter-server-cert-context.js";
import { type MatterServerClient, MatterServerCommandError } from "../matter-server/matter-server-client.js";
import { MatterServerProcess, type MatterServerProcessOptions } from "../matter-server/matter-server-process.js";
import { MatterServerSubscriptions } from "../matter-server/matter-server-subscriptions.js";
import {
    clusterKeyOf,
    decodeAttributeResult,
    decodeCommandResponse,
    decodeInteractionReport,
    encodeAttributeValue,
    encodeCommandPayload,
    serverClusterModel,
    type WireAttribute,
    type WireEvent,
    type WireInteractionReport,
    type WirePathStatus,
    type WireValueResult,
} from "../matter-server/matter-server-wire.js";
import { assertDeclaredKeySet, declaredGroup, KeyedGroups, validateControllerGroups } from "./controller-groups.js";
import {
    assertDeclaredRevocationSet,
    type DeclaredRevocationSet,
    declaredRevocationSet,
} from "./controller-revocation.js";
import { findCertCluster } from "./custom-clusters.js";
import { MatterServerIcdClient } from "./matter-server-icd-client.js";
import { MatterServerOtaError, serveOtaUpdateThroughServer } from "./matter-server-ota.js";
import { assertSingleQrPayload, OnboardingPayloadRefusedError } from "./onboarding-payload.js";
import { timedInteractionTimeoutOf } from "./timed-interaction.js";

const logger = Logger.get("MatterServerControllerAdapter");

/** Name {@link UnsupportedByControllerError} reports for this adapter. */
const CONTROLLER = "matterjs-server";

/**
 * Outlasts matter.js's own commissioning budget, which waits out the specification's 3-minute minimum commissioning
 * window for a device that never answers: a WS timeout before that would report a failure while the server still
 * commissions. With a `discovery_timeout_s` it is the allowance for the steps after PASE, which that timeout does not
 * bound, on top of the discovery timeout.
 */
const COMMISSION_TIMEOUT = Minutes(5);

/**
 * Outlasts the server's own wait for its subscription (matter.js `DEFAULT_CASE_CONNECTION_TIMEOUT`, 255 s), which ends
 * with an error naming the cause.
 */
const AUTO_SUBSCRIPTION_TIMEOUT = Minutes(5);

/** Concrete ids `splitAttributePath` on the server reads as wildcards, for an event id as for an attribute id. */
const WILDCARD_ENDPOINT = 0xffff;
const WILDCARD_CLUSTER = 0xffffffff;
const WILDCARD_LEAF = 0xffffffff;

/**
 * The WebSocket API schema with everything this adapter relies on: `subscribe` with its complete priming report, typed
 * error causes, duplicate prevention per connection, `parse_onboarding_payload`, `data_versions` in read and
 * subscription results, `batched_device_commands`, `write_attribute` with a wildcard endpoint and
 * `timed_request_timeout_ms`, and the UnitTesting cluster in the server's model. The server needs all of them; schema
 * 14 does not guarantee the last four, and a build without one refuses it when a step uses it.
 */
const MINIMUM_SCHEMA_VERSION = 14;

/** `commission_on_network`'s `filter_type` for a long (12-bit) discriminator. */
const LONG_DISCRIMINATOR_FILTER = 2;

const DESCRIPTOR_ID = Descriptor.Cluster.id;
const DEVICE_TYPE_LIST_ID = Descriptor.Cluster.attributes.deviceTypeList.id;
const PARTS_LIST_ID = Descriptor.Cluster.attributes.partsList.id;

const SERVER_LIST: AttributePathSpec = {
    cluster: Descriptor.Cluster.id,
    attribute: Descriptor.Cluster.attributes.serverList.id,
};

/**
 * What this controller lacks, declared with its registration so a step needing one of these is skipped before it acts
 * (see `controllerCapabilityGap`). Every operation that needs one of them refuses naming it before it sends anything.
 */
export const MATTERJS_SERVER_CAPABILITY_GAPS = {
    "basic-commissioning-window": "open_commissioning_window ignores its option and always opens an enhanced window",
    "max-value-path-ids": "the server reads endpoint 0xFFFF and cluster, attribute or event id 0xFFFFFFFF as wildcards",
    "session-introspection": "the WebSocket API exposes no session state",
    "tcp-transport": "the server chooses the transport of each session itself and the WebSocket API cannot ask for one",
    "unmodeled-requests":
        "device_command and write_attribute address only clusters, commands and attributes of the server's own " +
        "Matter model",
    "batch-arrival-order":
        "batched_device_commands answers in request order, so the order the device's answers arrived in is not visible",
    "webrtc-requestor": "the WebSocket API does not expose the server's requestor cluster to a case",
    "noc-update":
        "the WebSocket API has no command that replaces a node's operational certificate, and a device_command " +
        "UpdateNOC cannot stand in: the NOC must be issued by the server's certificate authority, which the API " +
        "does not expose. The server gets a NOC update command later, with the node-management rollout",
} as const satisfies ControllerCapabilityGaps;

const MULTI_PATH_WRITE_OUT_OF_SCOPE =
    "not reachable for controller use cases: the server writes one attribute per request, on one endpoint or on " +
    "all, and handles conditional writes itself";

/**
 * What this controller deliberately does not offer, declared with its registration so a step needing one of these does
 * not apply to it and does not count against its test case (see `controllerCapabilityOutOfScope`). The operations
 * refuse naming the capability, like those of a gap.
 */
export const MATTERJS_SERVER_OUT_OF_SCOPE = {
    "multi-path-write": MULTI_PATH_WRITE_OUT_OF_SCOPE,
    "mixed-version-write": MULTI_PATH_WRITE_OUT_OF_SCOPE,
    "typed-list-write-with-others": MULTI_PATH_WRITE_OUT_OF_SCOPE,
    "ota-provider-script":
        "the server's OTA provider answers only with a staged image; scripted answers stay excluded until the test " +
        "plans' need for them is clarified",
} as const satisfies ControllerCapabilitiesOutOfScope;

type MatterServerGap = keyof typeof MATTERJS_SERVER_CAPABILITY_GAPS;

type MatterServerRefusal = MatterServerGap | keyof typeof MATTERJS_SERVER_OUT_OF_SCOPE;

function refusal(capability: MatterServerRefusal, operation: string) {
    return new UnsupportedByControllerError(
        operation,
        CONTROLLER,
        isGap(capability) ? MATTERJS_SERVER_CAPABILITY_GAPS[capability] : MATTERJS_SERVER_OUT_OF_SCOPE[capability],
        capability,
    );
}

function isGap(capability: ControllerCapability): capability is MatterServerGap {
    return Object.hasOwn(MATTERJS_SERVER_CAPABILITY_GAPS, capability);
}

/**
 * A read the server answered with neither a value nor a status for a concrete path the step asked for, a
 * subscription's priming report that left such a path out, or a read asking for data versions that the server
 * answered with a value but without its cluster's version.
 */
export class MatterServerReadError extends MatterError {}

/**
 * A node the server commissioned whose server subscription, which the case declared as `sustained-subscription`, did
 * not start. The adapter removed the node from the server again; `cause` is why the subscription failed.
 */
export class MatterServerSustainedSubscriptionError extends MatterError {}

/**
 * A commissioning the server reports as failed for a reason it names (`passcode-mismatch`, `attestation-rejected`,
 * `timeout`, `other`), which is a cause a step can attribute rather than a bare command failure.
 */
export class MatterServerCommissioningError extends MatterError {
    constructor(
        readonly reason: string,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}

/** What {@link MatterServerControllerAdapter} needs of a running server. {@link MatterServerProcess} is one. */
export interface MatterServerConnection {
    readonly client: MatterServerClient;

    /** The entry point the server was started from. */
    readonly entry: string;

    /** The server's own output, which is what the adapter reports as its log. */
    readonly log: LogFollower;

    /** Base URL of the server's HTTP endpoints, such as the OTA image upload: `http://<host>:<port>`. */
    readonly httpUrl: string;

    close(): Promise<void>;
}

/**
 * Starts the server an adapter drives. `signal` aborts when the adapter closes before the server is ready. The
 * launcher must honour it and reject once it stopped what it started: `close()` waits for the launch to settle, so
 * a launcher that ignores the signal blocks `close()` until the server is ready.
 *
 * `startup` holds what the server has to be given before it starts: the groups the case declares the controller sends
 * on, and the revocation set it declares (see `MatterServerProcessOptions`).
 */
export type MatterServerLauncher = (
    role: string,
    signal: AbortSignal,
    startup: MatterServerStartup,
) => Promise<MatterServerConnection>;

/** What a server is given before it starts, where the case declares it. */
export type MatterServerStartup = Pick<MatterServerProcessOptions, "certContext" | "revocationSet">;

/**
 * Starts matterjs-server from `MATTER_CERT_SERVER_ENTRY`, on the interface `MATTER_MDNS_NETWORKINTERFACE` names
 * where it is set.
 */
async function launchFromEnvironment(
    role: string,
    signal: AbortSignal,
    startup: MatterServerStartup,
): Promise<MatterServerConnection> {
    const entry = env.MATTER_CERT_SERVER_ENTRY;
    if (entry === undefined || entry === "") {
        throw new CertConfigError(
            'MATTER_CERT_CONTROLLER="matterjs-server" needs MATTER_CERT_SERVER_ENTRY, the server entry point to run',
        );
    }
    return MatterServerProcess.start({
        entry,
        role,
        primaryInterface: env.MATTER_MDNS_NETWORKINTERFACE || undefined,
        signal,
        ...startup,
    });
}

/**
 * Drives matterjs-server as the DUT controller, through its WebSocket API.
 *
 * An operation the WebSocket API cannot express refuses with {@link UnsupportedByControllerError} before it sends
 * anything, naming the capability it lacks in {@link MATTERJS_SERVER_CAPABILITY_GAPS} or does not offer in
 * {@link MATTERJS_SERVER_OUT_OF_SCOPE}; a step that needs it declares it and is skipped before it runs.
 *
 * The server runs with `--disable-auto-subscription`, so reads and subscriptions are the adapter's own: `read`,
 * `subscribe` and `unsubscribe`. A `read` and a `subscribe` go out as the in-process adapter sends them, without data
 * version filters the step did not ask for, so the priming report is complete. A subscription report the adapter cannot
 * deliver ends the subscription with the cause.
 *
 * The server's own subscription to a node is on only where something needs it:
 *
 * | Needed for              | On from                         | Off again                              |
 * | ----------------------- | ------------------------------- | -------------------------------------- |
 * | `sustainedSubscription` | before `commission()` returns   | `decommission()`, or the adapter closes |
 * | an OTA update           | `serveOtaUpdate()`              | when that update ends                  |
 * | the ICD client          | `register()`                    | `unregister()`, `stopSubscription()`   |
 *
 * The end of an OTA update and `unregister()` leave a sustained subscription on. `stopSubscription()` refuses it with
 * `ImplementationError`, because its contract is to end the subscription. With `sustainedSubscription`,
 * `clientEndpoints` and `clientAttribute` answer from the server's node data (`get_node`), and `observeEvents` reports
 * the server's `node_event`s. The server refuses `subscribe` for such a node.
 *
 * Onboarding payloads are parsed by the server (`parse_onboarding_payload`), so a step sees the server's reading of a
 * code, mapped to the fields and absent identifiers the in-process adapter reports.
 *
 * Statuses:
 *
 * - A status a device answers a concrete read or subscribe path with surfaces as `StatusResponseError` with its
 *   cluster status, as in-process.
 * - A status the device answers an invoke or a write with surfaces as `StatusResponseError` with its cluster status,
 *   as in-process. A command the server itself refuses surfaces as `MatterServerCommandError`.
 * - A failed commissioning surfaces by the reason the server gives: `OnboardingPayloadRefusedError` for a code the
 *   server could not decode, `DiscoveryError` for a device it did not find, {@link MatterServerCommissioningError}
 *   for any other reason, and `MatterServerCommandError` for a refusal without a reason.
 *
 * The server prevents duplicates: a `device_command` identical to one still in flight on the same connection is
 * answered with that one's answer and never reaches the device. The adapter has one connection, so it sends the
 * invokes of one node one at a time, in call order. A batch is one `batched_device_commands`, which the server does
 * not de-duplicate.
 */
export class MatterServerControllerAdapter implements ControllerAdapter {
    readonly id: string;
    readonly attestation?: AttestationApi;

    readonly #launch: MatterServerLauncher;
    readonly #groups?: readonly CertControllerGroup[];
    readonly #startup: MatterServerStartup;
    readonly #keyedGroups = new KeyedGroups();
    readonly #invokeQueues = new Map<string, Mutex>();
    readonly #autoSubscriptions = new AutoSubscriptions(() => this.#started.client);
    readonly #sustainSubscriptions: boolean;
    readonly #icdClients = new Map<string, MatterServerIcdClient>();
    #listening?: Promise<void>;
    readonly #closing = new AbortController();
    #starting?: Promise<void>;
    #connection?: MatterServerConnection;
    #subscriptions?: MatterServerSubscriptions;

    constructor(id: string, options?: ControllerAdapterOptions, launch: MatterServerLauncher = launchFromEnvironment) {
        const lacking = capabilitiesFor(options).find(isGap);
        if (lacking !== undefined) {
            throw refusal(lacking, `an adapter built for ${lacking}`);
        }

        this.id = id;
        this.#launch = launch;
        this.#sustainSubscriptions = options?.sustainedSubscription === true;
        validateControllerGroups(id, options?.groups);
        this.#groups = options?.groups;
        const revocationSet = declaredRevocationSet(id, options);
        this.#startup = {
            certContext: options?.groups === undefined ? undefined : certContextFor(options.groups),
            revocationSet: revocationSet?.text,
        };
        if (options?.attestation) {
            this.attestation = new MatterServerAttestationApi(id, revocationSet);
        }
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
        if (this.#closing.signal.aborted) {
            throw new ImplementationError(`Controller adapter "${this.id}" was closed and cannot be restarted`);
        }
        if (this.#starting !== undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}": start() was already called`);
        }
        this.#starting = this.#connect();
        await this.#starting;
    }

    async #connect() {
        const connection = await this.#launch(this.id, this.#closing.signal, this.#startup);
        if (this.#closing.signal.aborted) {
            await connection.close();
            throw new ClosedError(`Controller adapter "${this.id}" was closed while its server started`);
        }
        const schema = connection.client.serverInfo.schema_version;
        if (schema < MINIMUM_SCHEMA_VERSION) {
            try {
                await connection.close();
            } catch (error) {
                logger.warn(`Stopping matterjs-server from ${connection.entry} after its schema check failed:`, error);
            }
            throw new CertConfigError(
                `matterjs-server from ${connection.entry} speaks WebSocket API schema ${schema}; the cert adapter ` +
                    `needs schema ${MINIMUM_SCHEMA_VERSION} or later`,
            );
        }
        this.#connection = connection;
        this.#subscriptions = new MatterServerSubscriptions(connection.client);
    }

    /** Also stops a server still starting, before it resolves. */
    async close(): Promise<void> {
        this.#closing.abort();
        // start() reports its own failure to its caller
        await Promise.allSettled([this.#starting]);
        const connection = this.#connection;
        const subscriptions = this.#subscriptions;
        this.#connection = undefined;
        this.#subscriptions = undefined;
        try {
            await subscriptions?.closeAll();
        } finally {
            await connection?.close();
        }
    }

    get #started() {
        if (this.#connection === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#connection;
    }

    get #startedSubscriptions() {
        if (this.#subscriptions === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#subscriptions;
    }

    async commission(target: CommissioningTarget): Promise<CertNodeRef> {
        // The server bounds discovery and PASE together with it, as matter.js does with its one `timeout`
        const discoveryTimeout = target.giveUpAfterMs === undefined ? undefined : Millis(target.giveUpAfterMs);
        const discovery =
            discoveryTimeout === undefined ? {} : { discovery_timeout_s: Seconds.fractionalOf(discoveryTimeout) };

        // The server judges every code itself, except a concatenated one, which names several commissionees where
        // this call pairs one
        let command: string;
        let args: object;
        if (target.qrPairingCode) {
            assertSingleQrPayload(target.qrPairingCode);
            command = "commission_with_code";
            args = { code: target.qrPairingCode, network_only: true, ...discovery };
        } else if (target.manualPairingCode !== undefined) {
            command = "commission_with_code";
            args = { code: target.manualPairingCode, network_only: true, ...discovery };
        } else if (target.passcode !== undefined && target.discriminator !== undefined) {
            command = "commission_on_network";
            args = {
                setup_pin_code: target.passcode,
                filter_type: LONG_DISCRIMINATOR_FILTER,
                filter: target.discriminator,
                ...discovery,
            };
        } else {
            throw new ImplementationError(
                "commission() requires a target.qrPairingCode, a target.manualPairingCode, or both target.passcode " +
                    "and target.discriminator",
            );
        }

        let node: unknown;
        try {
            node = await this.#started.client.command(command, args, {
                timeout:
                    discoveryTimeout === undefined ? COMMISSION_TIMEOUT : Millis(discoveryTimeout + COMMISSION_TIMEOUT),
            });
        } catch (error) {
            throw commissioningFailureOf(error);
        }
        if (!isObject(node) || (typeof node.node_id !== "number" && typeof node.node_id !== "bigint")) {
            throw new UnexpectedDataError(
                `matterjs-server answered ${command} without a node id: ${Diagnostic.json(node)}`,
            );
        }
        const ref = node.node_id.toString();
        if (this.#sustainSubscriptions && !target.withoutSubscription) {
            await this.#sustain(ref);
        }
        return ref;
    }

    /**
     * Switches the server's own subscription to a node just commissioned on for the rest of the case. Where that
     * fails, the node is removed from the server again: the caller gets no ref and could not decommission it.
     */
    async #sustain(ref: CertNodeRef) {
        const nodeId = NodeId(BigInt(ref));
        try {
            await this.#autoSubscriptions.sustain(nodeId.toString());
        } catch (error) {
            try {
                await this.#started.client.command("remove_node", { node_id: nodeId });
            } catch (cleanup) {
                if (!this.#closing.signal.aborted) {
                    logger.warn(`Removing node ${nodeId} after its subscription failed to start failed:`, cleanup);
                }
            }
            throw new MatterServerSustainedSubscriptionError(
                `matterjs-server commissioned node ${nodeId}, but switching its own subscription to the node on ` +
                    "failed, so the node was removed again",
                { cause: error },
            );
        }
    }

    /** Refuses a concatenated code before it is sent, as the in-process adapter refuses it. */
    async parseQrPayload(code: string): Promise<OnboardingPayloadFields> {
        assertSingleQrPayload(code);
        const parsed = await this.#parse(code, "qr", `QR onboarding payload ${code}`);
        if (!Array.isArray(parsed.payloads) || parsed.payloads.length !== 1) {
            throw new UnexpectedDataError(
                `matterjs-server parsed the single-payload QR code ${code} as ${Diagnostic.json(parsed.payloads)}`,
            );
        }
        const [payload] = parsed.payloads;
        if (!isObject(payload)) {
            throw new UnexpectedDataError(`matterjs-server parsed QR code ${code} as ${Diagnostic.json(payload)}`);
        }
        return {
            version: parsedRequired(payload, "version", code),
            vendorId: parsedIdentifier(payload, "vendor_id", code),
            productId: parsedIdentifier(payload, "product_id", code),
            flowType: parsedRequired(payload, "flow_type", code),
            discoveryCapabilities: parsedRequired(payload, "discovery_capabilities", code),
            discriminator: parsedRequired(payload, "discriminator", code),
            passcode: parsedRequired(payload, "setup_pin_code", code),
        };
    }

    async parseManualPairingCode(code: string): Promise<ManualPairingCodeFields> {
        const parsed = await this.#parse(code, "manual", `manual pairing code ${code}`);
        return {
            shortDiscriminator: parsedRequired(parsed, "short_discriminator", code),
            passcode: parsedRequired(parsed, "setup_pin_code", code),
            vendorId: parsedIdentifier(parsed, "vendor_id", code),
            productId: parsedIdentifier(parsed, "product_id", code),
        };
    }

    /**
     * The server's reading of `code`, refused as {@link OnboardingPayloadRefusedError} where the server could not
     * decode it or read it as the other code form, which the in-process codec of that form refuses too.
     */
    async #parse(code: string, type: "qr" | "manual", what: string) {
        let parsed: unknown;
        try {
            parsed = await this.#started.client.command("parse_onboarding_payload", { code });
        } catch (error) {
            if (error instanceof MatterServerCommandError && error.failure.reason === "invalid-payload") {
                throw new OnboardingPayloadRefusedError(`Refused ${what}: ${error.message}`, { cause: error });
            }
            throw error;
        }
        if (!isObject(parsed) || (parsed.type !== "qr" && parsed.type !== "manual")) {
            throw new UnexpectedDataError(
                `matterjs-server answered parse_onboarding_payload for ${what} with ${Diagnostic.json(parsed)}`,
            );
        }
        if (parsed.type !== type) {
            throw new OnboardingPayloadRefusedError(
                `Refused ${what}: matterjs-server read it as a ${parsed.type} code`,
            );
        }
        return parsed;
    }

    /**
     * `discover_commissionable_nodes` takes no filter, so this reports every node the server found, whatever
     * `filter` asks for. The server searches over IP only, for a window of its own.
     */
    async discoverCommissionableNodes(_filter?: CommissionableNodeFilter): Promise<DiscoveredCommissionableNode[]> {
        const nodes = await this.#started.client.command("discover_commissionable_nodes", {});
        if (!Array.isArray(nodes)) {
            throw new UnexpectedDataError(
                `matterjs-server answered discover_commissionable_nodes with ${Diagnostic.json(nodes)}`,
            );
        }
        return nodes.map(discoveredNodeOf);
    }

    node(ref: CertNodeRef): MatterServerCertNodeApi {
        const key = NodeId(BigInt(ref)).toString();
        let queue = this.#invokeQueues.get(key);
        if (queue === undefined) {
            queue = new Mutex(`matterjs-server invokes of node ${key}`);
            this.#invokeQueues.set(key, queue);
        }
        return new MatterServerCertNodeApi(
            () => this.#started.client,
            () => this.#startedSubscriptions,
            other => this.node(other),
            ref,
            queue,
            {
                log: () => this.log,
                enableAutoSubscription: () => this.#autoSubscriptions.use(key),
                disableAutoSubscription: () => this.#autoSubscriptions.release(key),
                endAutoSubscription: () => this.#autoSubscriptions.end(key),
                forgetAutoSubscription: () => this.#autoSubscriptions.forget(key),
                sustainedSubscription: operation => this.#sustainedSubscription(key, operation),
                startListening: () => this.#startListening(),
                uploadOtaImage: image => this.#uploadOtaImage(image),
                icdClient: create => {
                    let client = this.#icdClients.get(key);
                    if (client === undefined) {
                        client = create();
                        this.#icdClients.set(key, client);
                    }
                    return client;
                },
            },
        );
    }

    /** Once per connection: listening sends every node's state, and events reach every listening connection anyway. */
    #startListening() {
        this.#listening ??= this.#listen();
        return this.#listening;
    }

    async #listen() {
        try {
            await this.#started.client.command("start_listening", {});
        } catch (error) {
            this.#listening = undefined;
            throw error;
        }
    }

    /** The server stores the image by the vendor, product and version in its header, for any node they fit. */
    async #uploadOtaImage(image: Uint8Array) {
        const { client, httpUrl } = this.#started;
        const reservation = await client.command("initiate_ota_upload", {});
        if (!isObject(reservation) || typeof reservation.upload_id !== "string") {
            throw new UnexpectedDataError(
                `matterjs-server answered initiate_ota_upload with ${Diagnostic.json(reservation)}`,
            );
        }
        const response = await fetch(`${httpUrl}/ota-upload/${reservation.upload_id}`, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: new Uint8Array(image),
        });
        if (!response.ok) {
            throw new MatterServerOtaError(
                `matterjs-server refused an OTA image upload with HTTP ${response.status}: ${await response.text()}`,
            );
        }
    }

    /**
     * Refuses `operation` as the `sustained-subscription` capability where the adapter was built without it, which
     * reaches a step only as a framework error: a case that needs it declares it.
     */
    async #sustainedSubscription(nodeId: string, operation: string) {
        if (!this.#sustainSubscriptions) {
            throw new UnsupportedByControllerError(
                operation,
                CONTROLLER,
                "the adapter keeps the server's own subscription to a node only for a case that declares " +
                    "sustained-subscription",
                "sustained-subscription",
            );
        }
        const active = this.#autoSubscriptions.sustained(nodeId);
        if (active === undefined) {
            throw new ImplementationError(
                `Controller adapter "${this.id}" holds no sustained subscription to node ${nodeId}: it keeps one ` +
                    "only for a node it commissioned without CommissioningTarget.withoutSubscription",
            );
        }
        await active;
    }

    group(groupId: number): CertGroupApi {
        return new MatterServerCertGroupApi(
            this.id,
            groupId,
            this.#groups,
            this.#keyedGroups,
            () => this.#started.client,
        );
    }
}

/** Who switched the server's own subscription to a node on. */
type AutoSubscriptionOwner = "sustained" | "temporary";

interface AutoSubscription {
    readonly owner: AutoSubscriptionOwner;

    /** Resolves once the server reports the subscription active; rejects where switching it on failed. */
    active: Promise<void>;
}

/**
 * The server's own subscription to each node, at most one record per node, saying who switched it on: `commission()`
 * for a case's sustained subscription, or a temporary user (the OTA provider, the ICD client). The server runs with
 * its own subscriptions off, so a node without a record has none.
 *
 * | Call        | No record             | Temporary record          | Sustained record         |
 * | ----------- | --------------------- | ------------------------- | ------------------------ |
 * | `use()`     | on, `true`            | waits, `false`            | waits, `false`           |
 * | `release()` | nothing               | off                       | nothing                  |
 * | `end()`     | nothing               | off                       | `ImplementationError`    |
 * | `sustain()` | on                    | `ImplementationError`     | `ImplementationError`    |
 * | `forget()`  | nothing               | record dropped            | record dropped           |
 *
 * A failed switch-on drops its record. That says nothing about the server: it may keep trying to subscribe.
 */
class AutoSubscriptions {
    readonly #client: () => MatterServerClient;
    readonly #records = new Map<string, AutoSubscription>();

    constructor(client: () => MatterServerClient) {
        this.#client = client;
    }

    /** Switches the subscription on for a temporary user, once; `true` where this call switched it on. */
    async use(nodeId: string) {
        const record = this.#records.get(nodeId);
        if (record !== undefined) {
            await record.active;
            return false;
        }
        await this.#enable(nodeId, "temporary");
        return true;
    }

    /** Switches the subscription a temporary user needed off again; a sustained one stays on. */
    async release(nodeId: string) {
        if (this.#records.get(nodeId)?.owner !== "temporary") {
            return;
        }
        this.#records.delete(nodeId);
        await this.#client().command("disable_auto_subscription", { node_id: NodeId(BigInt(nodeId)) });
    }

    /** As {@link release}, but refuses a sustained subscription, which the case needs for its whole run. */
    async end(nodeId: string) {
        if (this.#records.get(nodeId)?.owner === "sustained") {
            throw new ImplementationError(
                `The server's subscription to node ${nodeId} is the one the case declared as sustained-subscription, ` +
                    "so it cannot end",
            );
        }
        await this.release(nodeId);
    }

    /**
     * Switches the subscription on for the rest of the case. The server assigns node ids at commissioning, so a node
     * just commissioned has no record yet; an existing one is refused.
     */
    async sustain(nodeId: string) {
        if (this.#records.has(nodeId)) {
            throw new ImplementationError(`Node ${nodeId} already has a server subscription record`);
        }
        await this.#enable(nodeId, "sustained");
    }

    /** Resolves once a sustained subscription is active; `undefined` where the node has none. */
    sustained(nodeId: string) {
        const record = this.#records.get(nodeId);
        return record?.owner === "sustained" ? record.active : undefined;
    }

    /** Drops the record of a node the server no longer holds. */
    forget(nodeId: string) {
        this.#records.delete(nodeId);
    }

    async #enable(nodeId: string, owner: AutoSubscriptionOwner) {
        const record: AutoSubscription = { owner, active: this.#switchOn(nodeId) };
        this.#records.set(nodeId, record);
        try {
            await record.active;
        } catch (error) {
            if (this.#records.get(nodeId) === record) {
                this.#records.delete(nodeId);
            }
            throw error;
        }
    }

    async #switchOn(nodeId: string) {
        await this.#client().command(
            "enable_auto_subscription",
            { node_id: NodeId(BigInt(nodeId)) },
            { timeout: AUTO_SUBSCRIPTION_TIMEOUT },
        );
    }
}

/**
 * Device attestation as the server judges it. The server installed the revocation set the adapter wrote before it
 * started, so a case's set is checked against that declaration rather than installed.
 */
class MatterServerAttestationApi implements AttestationApi {
    readonly #adapterId: string;
    readonly #declared?: DeclaredRevocationSet;

    constructor(adapterId: string, declared: DeclaredRevocationSet | undefined) {
        this.#adapterId = adapterId;
        this.#declared = declared;
    }

    async installRevocations(revocationSet: string): Promise<void> {
        assertDeclaredRevocationSet(this.#adapterId, this.#declared, revocationSet);
    }
}

/**
 * A group the server sends on. The server's fabric holds the key from the {@link CertContextFile} the adapter wrote
 * before the server started, so a case's key set is checked against that declaration rather than installed, and the
 * groupcast is a `device_command` to the Group Node ID.
 */
class MatterServerCertGroupApi implements CertGroupApi {
    readonly #adapterId: string;
    readonly #groupId: number;
    readonly #groups?: readonly CertControllerGroup[];
    readonly #keyed: KeyedGroups;
    readonly #client: () => MatterServerClient;

    constructor(
        adapterId: string,
        groupId: number,
        groups: readonly CertControllerGroup[] | undefined,
        keyed: KeyedGroups,
        client: () => MatterServerClient,
    ) {
        this.#adapterId = adapterId;
        this.#groupId = groupId;
        this.#groups = groups;
        this.#keyed = keyed;
        this.#client = client;
    }

    async defineKeySet(keySet: GroupKeySetSpec): Promise<void> {
        assertDeclaredKeySet(this.#adapterId, this.#groups, this.#groupId, keySet);
        this.#keyed.add(this.#groupId);
    }

    /** The server answers a group invoke with `null`: nobody answers a groupcast. */
    async invoke(cluster: string | number, command: string, args?: object): Promise<void> {
        declaredGroup(this.#adapterId, this.#groups, this.#groupId);
        this.#keyed.assertKeyed(this.#adapterId, this.#groupId);
        const clusterModel = serverClusterModel(cluster);
        const commandModel = clusterModel?.commands(command);
        if (clusterModel?.id === undefined || commandModel === undefined) {
            throw new ImplementationError(`Unknown command "${command}" on cluster ${cluster}`);
        }
        const result = await this.#client().command("device_command", {
            node_id: NodeId.fromGroupId(this.#groupId),
            cluster_id: clusterModel.id,
            command_name: commandModel.name,
            payload: encodeCommandPayload(clusterModel.id, commandModel.name, args ?? {}),
        });
        if (result !== null && result !== undefined) {
            throw new UnexpectedDataError(
                `matterjs-server answered a group invoke of ${clusterModel.name}.${commandModel.name} with ` +
                    Diagnostic.json(result),
            );
        }
    }
}

/** What the node APIs of one node share, since `node()` hands out a new one per call. */
interface MatterServerNodeShared {
    /** The server's log. */
    log(): LogFollower;

    /** Resolves once the server's own subscription to the node is active; `true` where this call switched it on. */
    enableAutoSubscription(): Promise<boolean>;

    /** Switches off a subscription {@link enableAutoSubscription} switched on; a sustained one stays on. */
    disableAutoSubscription(): Promise<void>;

    /** As {@link disableAutoSubscription}, but throws `ImplementationError` for a sustained subscription. */
    endAutoSubscription(): Promise<void>;

    /** Drops the record of the server's subscription to a node the server no longer holds. */
    forgetAutoSubscription(): void;

    /**
     * Resolves once the subscription `commission()` switched on for `sustainedSubscription` is active. Refuses
     * `operation` with `UnsupportedByControllerError` where the adapter was built without it, and throws
     * `ImplementationError` for a node it holds no such subscription for.
     */
    sustainedSubscription(operation: string): Promise<void>;

    /** Resolves once the server forwards node events to the adapter's connection (`start_listening`). */
    startListening(): Promise<void>;

    /** Stores an OTA image with the server: `initiate_ota_upload`, then the upload over HTTP. */
    uploadOtaImage(image: Uint8Array): Promise<void>;

    /** The node's ICD client, created by `create` on first use. */
    icdClient(create: () => MatterServerIcdClient): MatterServerIcdClient;
}

class MatterServerCertNodeApi implements CertNodeApi {
    readonly #client: () => MatterServerClient;
    readonly #subscriptions: () => MatterServerSubscriptions;
    readonly #node: (ref: CertNodeRef) => MatterServerCertNodeApi;
    readonly #nodeId: NodeId;

    /**
     * The server answers an invoke identical to one still in flight on the same connection with that one's answer
     * (duplicate prevention), so a second identical invoke would never reach the device.
     */
    readonly #invokeQueue: Mutex;

    readonly #shared: MatterServerNodeShared;

    constructor(
        client: () => MatterServerClient,
        subscriptions: () => MatterServerSubscriptions,
        node: (ref: CertNodeRef) => MatterServerCertNodeApi,
        ref: CertNodeRef,
        invokeQueue: Mutex,
        shared: MatterServerNodeShared,
    ) {
        this.#client = client;
        this.#subscriptions = subscriptions;
        this.#node = node;
        this.#invokeQueue = invokeQueue;
        this.#shared = shared;
        this.#nodeId = NodeId(BigInt(ref));
    }

    #command(command: string, args: object) {
        return this.#client().command(command, args);
    }

    async invoke(
        cluster: string | number,
        command: string,
        args?: object,
        endpoint = 0,
        options?: TimedInteractionOptions,
    ): Promise<unknown> {
        const invocation = this.#invocation({ cluster, command, args, endpoint });
        const request = {
            node_id: this.#nodeId,
            ...invocation.command,
            ...timedRequestOf(options),
        };
        const result = await this.#invokeQueue.produce(() =>
            deviceStatusOf(this.#command("device_command", request), invocation.operation),
        );
        return decodeCommandResponse(invocation.clusterId, invocation.commandName, result);
    }

    /**
     * Sends one `batched_device_commands`, which the server sends as exactly one InvokeRequest. The server answers per
     * command in request order, so the results are in request order too and not in the order the device's answers
     * arrived (`batch-arrival-order`).
     */
    async invokeBatch(commands: BatchCommandSpec[], options?: TimedInteractionOptions): Promise<BatchCommandResult[]> {
        if (commands.length === 0) {
            throw new ImplementationError("invokeBatch requires at least one command");
        }
        const invocations = commands.map(command => this.#invocation(command));
        const result = await this.#command("batched_device_commands", {
            node_id: this.#nodeId,
            commands: invocations.map(({ command }) => command),
            ...timedRequestOf(options),
        });
        return batchResultsOf(result, invocations);
    }

    /** One command as the server addresses it, refused before anything is sent where the server cannot send it. */
    #invocation({ cluster, command, args, endpoint = 0 }: BatchCommandSpec) {
        const clusterModel = serverClusterModel(cluster);
        if (clusterModel === undefined) {
            if (findCertCluster(cluster) !== undefined) {
                throw refusal("unmodeled-requests", `invoke ${cluster}.${command}`);
            }
            throw new ImplementationError(`Unknown cluster ${cluster}`);
        }
        const commandModel = clusterModel.commands(command);
        if (clusterModel.id === undefined || commandModel === undefined) {
            throw new ImplementationError(`Unknown command "${command}" on cluster ${clusterModel.name}`);
        }

        return {
            clusterId: clusterModel.id,
            commandName: commandModel.name,
            operation: `invoke ${clusterModel.name}.${commandModel.name}`,
            command: {
                endpoint_id: endpoint,
                cluster_id: clusterModel.id,
                command_name: commandModel.name,
                payload: encodeCommandPayload(clusterModel.id, commandModel.name, args ?? {}),
            },
        };
    }

    async readAttribute(path: AttributePathSpec, options?: ReadAttributeOptions): Promise<unknown> {
        const report = await this.#readAttributes([path], options);
        const key = concreteKeyOf(path);
        if (key === undefined) {
            return entriesOf(report, options?.dataVersions);
        }
        throwIfRefused(report.attributeStatus, key, "readAttribute");
        const entry = attributeAt(report.attributes, path);
        if (entry === undefined) {
            throw new MatterServerReadError(`matterjs-server returned neither a value nor a status for ${key}`);
        }
        return valueOf(entry.result);
    }

    async readAttributes(paths: AttributePathSpec[], options?: ReadAttributeOptions): Promise<AttributeReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("readAttributes requires at least one path");
        }
        const report = await this.#readAttributes(paths, options);
        for (const path of paths) {
            const key = concreteKeyOf(path);
            if (key === undefined) {
                continue;
            }
            throwIfRefused(report.attributeStatus, key, "readAttributes");
            if (attributeAt(report.attributes, path) === undefined) {
                throw new MatterServerReadError(`matterjs-server returned neither a value nor a status for ${key}`);
            }
        }
        return entriesOf(report, options?.dataVersions);
    }

    async writeAttribute(path: AttributePathSpec, value: unknown, options?: TimedInteractionOptions): Promise<void> {
        if (path.endpoint === undefined || path.cluster === undefined || path.attribute === undefined) {
            throw new ImplementationError("writeAttribute requires a concrete endpoint/cluster/attribute path");
        }
        const [{ status, clusterStatus }] = await this.#write(path, value, "writeAttribute", timedRequestOf(options));
        if (status !== Status.Success) {
            throw new StatusResponseError(`writeAttribute ${pathKeyOf(path)} failed`, status, clusterStatus);
        }
    }

    /**
     * One entry without a data version, on one endpoint or, without `endpoint`, on every endpoint that has the
     * attribute: what one `write_attribute` sends.
     */
    async writeAttributes(entries: AttributeWriteEntry[]): Promise<AttributeWriteStatus[]> {
        if (entries.length === 0) {
            throw new ImplementationError("writeAttributes requires at least one attribute");
        }
        if (entries.length > 1 || entries[0].dataVersion !== undefined) {
            throw refusal("multi-path-write", "writeAttributes of several paths or with a data version");
        }
        const [{ path, value }] = entries;
        const statuses = await this.#write(path, value, "writeAttributes");
        return statuses.map(({ endpoint, cluster, attribute, status }) => ({ endpoint, cluster, attribute, status }));
    }

    async #write(
        path: AttributePathSpec,
        value: unknown,
        operation: string,
        options: { timed_request_timeout_ms?: number } = {},
    ) {
        const { cluster, attribute } = path;
        if (cluster === undefined || attribute === undefined) {
            throw new ImplementationError(`${operation} requires a concrete cluster and attribute`);
        }
        assertExpressible(path);
        if (serverClusterModel(cluster)?.attributes(attribute) === undefined) {
            throw refusal("unmodeled-requests", `writing attribute ${attribute} of cluster ${cluster}`);
        }

        const key = pathKeyOf(path);
        const result = await deviceStatusOf(
            this.#command("write_attribute", {
                node_id: this.#nodeId,
                attribute_path: key,
                value: encodeAttributeValue(cluster, attribute, value),
                ...options,
            }),
            `${operation} ${key}`,
        );
        return writeStatusesOf(result, { endpoint: path.endpoint, cluster, attribute });
    }

    /**
     * Keeps other subscriptions to the node, as the in-process adapter does: the server's default would end every
     * other subscription of the controller to it.
     */
    async subscribe(path: AttributePathSpec, opts: SubscribeOptions): Promise<unknown> {
        const key = pathKeyOf(path);
        const concrete = concreteKeyOf(path);
        return this.#subscribeAttributes(
            "subscribe",
            [path],
            opts,
            ({ id, priming }) => {
                if (concrete === undefined) {
                    return entriesOf(priming);
                }
                throwIfRefused(priming.attributeStatus, concrete, "subscribe");
                const entry = attributeAt(priming.attributes, path);
                if (entry === undefined) {
                    throw new MatterServerReadError(
                        `The priming report of matterjs-server subscription ${id} has neither a value nor a status for ${key}`,
                    );
                }
                return valueOf(entry.result);
            },
            ({ result }) => opts.onUpdate?.(valueOf(result)),
        );
    }

    /** Keeps other subscriptions to the node, as {@link subscribe} does. */
    async subscribeAttributes(
        paths: AttributePathSpec[],
        opts: SubscribeAttributesOptions,
    ): Promise<AttributeReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("subscribeAttributes requires at least one path");
        }
        return this.#subscribeAttributes(
            "subscribeAttributes",
            paths,
            opts,
            ({ priming }) => {
                throwIfAnyRefused(priming.attributeStatus, paths.map(concreteKeyOf), "subscribeAttributes");
                return entriesOf(priming);
            },
            ({ endpoint, cluster, attribute, result }) =>
                opts.onUpdate?.({ endpoint, cluster, attribute, value: valueOf(result) }),
        );
    }

    /**
     * One subscription to every path of `paths`. `seedOf` turns the priming report into the caller's result and
     * closes the subscription if it throws; every attribute a later report carries reaches `update`, and a later
     * status on a concrete path ends the subscription.
     */
    async #subscribeAttributes<T>(
        operation: string,
        paths: AttributePathSpec[],
        opts: Omit<SubscribeOptions, "onUpdate">,
        seedOf: (subscription: { id: number; priming: WireInteractionReport }) => T,
        update: (attribute: WireAttribute) => void,
    ): Promise<T> {
        paths.forEach(assertExpressible);
        const keys = paths.map(pathKeyOf);
        const concreteKeys = paths.map(concreteKeyOf);

        const subscription = await this.#subscriptions().open(
            this.#nodeId,
            {
                attribute_paths: keys,
                fabric_filtered: true,
                min_interval: opts.minIntervalFloorSeconds,
                max_interval: opts.maxIntervalCeilingSeconds,
                keep_subscriptions: true,
            },
            `attribute${keys.length === 1 ? "" : "s"} ${keys.join(", ")} of node ${this.#nodeId}`,
        );

        let seed: T;
        try {
            seed = seedOf(subscription);
        } catch (error) {
            await subscription.close();
            throw error;
        }

        subscription.listen({
            report: ({ attributes, attributeStatus }) => {
                throwIfAnyRefused(attributeStatus, concreteKeys, operation);
                attributes.forEach(update);
            },
            ended: cause => opts.onEnded?.(cause),
        });
        return seed;
    }

    async readEvents(paths: EventPathSpec[], options?: ReadEventOptions): Promise<EventReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("readEvents requires at least one path");
        }
        paths.forEach(assertExpressible);

        const result = await this.#command("read", {
            node_id: this.#nodeId,
            event_paths: paths.map(path => ({ path: eventKeyOf(path) })),
            ...eventFilterOf(options),
        });
        const { events, eventStatus } = decodeInteractionReport(result);
        throwIfAnyRefused(eventStatus, paths.map(concreteEventKeyOf), "readEvents");
        return events.map(eventEntryOf);
    }

    /** Keeps other subscriptions to the node, as {@link subscribe} does. */
    async subscribeEvents(paths: EventPathSpec[], opts: SubscribeEventOptions): Promise<EventReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("subscribeEvents requires at least one path");
        }
        paths.forEach(assertExpressible);

        const keys = paths.map(eventKeyOf);
        const subscription = await this.#subscriptions().open(
            this.#nodeId,
            {
                event_paths: keys.map(path => ({ path, is_urgent: opts.urgent })),
                ...eventFilterOf(opts),
                min_interval: opts.minIntervalFloorSeconds,
                max_interval: opts.maxIntervalCeilingSeconds,
                keep_subscriptions: true,
            },
            `events ${keys.join(", ")} of node ${this.#nodeId}`,
        );

        let seed: EventReadEntry[];
        try {
            const { events, eventStatus } = subscription.priming;
            throwIfAnyRefused(eventStatus, paths.map(concreteEventKeyOf), "subscribeEvents");
            seed = events.map(eventEntryOf);
        } catch (error) {
            await subscription.close();
            throw error;
        }

        const concreteKeys = paths.map(concreteEventKeyOf);
        subscription.listen({
            report: ({ events, eventStatus }) => {
                throwIfAnyRefused(eventStatus, concreteKeys, "subscribeEvents");
                for (const event of events) {
                    opts.onUpdate?.(eventEntryOf(event));
                }
            },
            ended: cause => opts.onEnded?.(cause),
        });
        return seed;
    }

    /**
     * Reports the `node_event`s the server's own subscription forwards, after the events a `read` of `paths` answers
     * with. The observation ends with the adapter's connection.
     */
    async observeEvents(paths: EventPathSpec[], opts: ObserveEventOptions): Promise<EventReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("observeEvents requires at least one path");
        }
        await this.#shared.sustainedSubscription("observeEvents");
        await this.#shared.startListening();

        const observation = new EventObservation(this.#nodeId, paths, opts);
        const events = this.#client().events;
        events.on(observation.listener);
        let seed: EventReadEntry[];
        try {
            seed = await this.readEvents(paths);
        } catch (error) {
            events.off(observation.listener);
            throw error;
        }
        observation.seed(seed);
        return seed;
    }

    /** The endpoints in the server's node data, with the Descriptor values it holds for each. */
    async clientEndpoints(): Promise<ClientEndpointEntry[]> {
        const held = await this.#heldAttributes("the endpoints the controller holds for a node");
        const endpoints = new Set(held.map(({ endpoint }) => endpoint));
        return [...endpoints]
            .sort((a, b) => a - b)
            .map(endpoint => {
                const deviceTypeList = heldValueOf(held, {
                    endpoint,
                    cluster: DESCRIPTOR_ID,
                    attribute: DEVICE_TYPE_LIST_ID,
                });
                const partsList = heldValueOf(held, { endpoint, cluster: DESCRIPTOR_ID, attribute: PARTS_LIST_ID });
                return {
                    endpoint,
                    deviceTypes: (Array.isArray(deviceTypeList) ? deviceTypeList : []).map(entry =>
                        deviceTypeOf(entry, endpoint),
                    ),
                    parts: (Array.isArray(partsList) ? partsList : []).map(Number),
                };
            });
    }

    /** The value in the server's node data, `undefined` where it holds none. */
    async clientAttribute(path: ClientAttributePath): Promise<unknown> {
        return heldValueOf(await this.#heldAttributes("an attribute value the controller holds for a node"), path);
    }

    /**
     * The node's attributes as the server holds them (`get_node`), which its own subscription keeps current. The server
     * drops the attributes of an endpoint the node no longer has.
     */
    async #heldAttributes(operation: string): Promise<WireAttribute[]> {
        await this.#shared.sustainedSubscription(operation);
        const node = await this.#command("get_node", { node_id: this.#nodeId });
        if (!isObject(node) || !isObject(node.attributes)) {
            throw new UnexpectedDataError(
                `matterjs-server answered get_node for node ${this.#nodeId} without attributes: ${Diagnostic.json(node)}`,
            );
        }
        return decodeAttributeResult(node.attributes);
    }

    async sessions(): Promise<never> {
        throw refusal("session-introspection", "the sessions the controller holds with a node");
    }

    async severTransportConnection(): Promise<never> {
        throw refusal("session-introspection", "severing the connection beneath a session");
    }

    /** One client per node, so what it recorded survives from one step to the next. */
    icdClient(): CertIcdClientApi {
        return this.#shared.icdClient(
            () =>
                new MatterServerIcdClient({
                    nodeId: this.#nodeId,
                    log: this.#shared.log(),
                    command: (command, args) => this.#command(command, args),
                    enableAutoSubscription: this.#shared.enableAutoSubscription,
                    disableAutoSubscription: this.#shared.disableAutoSubscription,
                    endAutoSubscription: this.#shared.endAutoSubscription,
                    ownNodeId: () => this.#ownNodeId(),
                    stayActive: async durationMs => {
                        const response = await this.invoke(
                            IcdManagement.Cluster.id,
                            "StayActiveRequest",
                            { stayActiveDuration: durationMs },
                            0,
                        );
                        if (!isObject(response) || typeof response.promisedActiveDuration !== "number") {
                            throw new UnexpectedDataError(
                                `Node ${this.#nodeId} answered StayActiveRequest with ${Diagnostic.json(response)}`,
                            );
                        }
                        return response.promisedActiveDuration;
                    },
                }),
        );
    }

    serveOtaUpdate(options?: ServeOtaUpdateOptions): Promise<OtaBdxTransfer> {
        return serveOtaUpdateThroughServer(
            {
                nodeId: this.#nodeId,
                log: this.#shared.log(),
                command: (command, args, timeout) => this.#client().command(command, args, { timeout }),
                enableAutoSubscription: this.#shared.enableAutoSubscription,
                disableAutoSubscription: this.#shared.disableAutoSubscription,
                startListening: this.#shared.startListening,
                events: this.#client().events,
                readAttributes: paths => this.readAttributes(paths),
                ownNodeId: async () => (await this.#ownNodeId()).toString(),
                upload: this.#shared.uploadOtaImage,
            },
            options,
        );
    }

    /**
     * Announcing another node is the administrator's role and a plain `AnnounceOTAProvider` invoke, with the endpoint
     * the provider reports its cluster on.
     *
     * Its VendorID is the server's Basic Information VendorID. The WebSocket API does not expose the server's own
     * Basic Information; the server sets that VendorID from the same `--vendorid` it gives each node it commissions as
     * the AdminVendorId of its fabric entry (matterjs-server `ControllerNode.ts`), so the entry is where it is read.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.20.7.6.1.2
     */
    async announceOtaProvider(options?: AnnounceOtaProviderOptions): Promise<OtaAnnouncement> {
        const provider = options?.provider;
        if (provider === undefined) {
            throw refusal("ota-provider-script", "announcing the controller's own OTA provider");
        }

        const announcement: OtaAnnouncementRecord = {
            providerNodeId: provider,
            vendorId: await this.#adminVendorId(),
            announcementReason:
                options?.announcementReason ?? OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable,
            endpoint: await this.#node(provider).#endpointServing(OtaSoftwareUpdateProvider.Cluster.id),
        };

        await this.invoke(
            OtaSoftwareUpdateRequestor.Cluster.id,
            "AnnounceOtaProvider",
            {
                providerNodeId: NodeId(BigInt(announcement.providerNodeId)),
                vendorId: announcement.vendorId,
                announcementReason: announcement.announcementReason,
                endpoint: announcement.endpoint,
            },
            await this.#endpointServing(OtaSoftwareUpdateRequestor.Cluster.id),
        );

        return {
            announcement,
            exchanges: { queryImage: [], applyUpdate: [], notifyUpdateApplied: [] },
            observedMs: 0,
        };
    }

    async scriptOtaProvider(): Promise<never> {
        throw refusal("ota-provider-script", "scriptOtaProvider");
    }

    async openCommissioningWindow(opts: {
        timeout: number;
        enhanced: boolean;
    }): Promise<{ manualPairingCode?: string; qrPairingCode?: string }> {
        if (!opts.enhanced) {
            throw refusal("basic-commissioning-window", "opening a basic commissioning window");
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

    /**
     * Relies on `remove_node` sending RemoveFabric, which it always tries to (matterjs-server `docs/cli.md`, "Disabled
     * auto subscription").
     */
    async decommission(): Promise<void> {
        await this.#command("remove_node", { node_id: this.#nodeId });
        this.#shared.forgetAutoSubscription();
    }

    async updateOperationalCertificate(): Promise<never> {
        throw refusal("noc-update", "updating the operational certificate of a node");
    }

    async operationalMdnsInstanceName(): Promise<string> {
        const compressedFabricId = GlobalFabricId(BigInt(this.#client().serverInfo.compressed_fabric_id));
        return getOperationalDeviceQname(compressedFabricId, this.#nodeId);
    }

    async #readAttributes(paths: AttributePathSpec[], options?: ReadAttributeOptions) {
        if (options?.largeMessage) {
            throw refusal("tcp-transport", "a read that requires a session permitting large payloads");
        }
        paths.forEach(assertExpressible);

        const result = await this.#command("read", {
            node_id: this.#nodeId,
            attribute_paths: paths.map(pathKeyOf),
            fabric_filtered: options?.fabricFiltered ?? true,
        });
        return decodeInteractionReport(result);
    }

    /** The lowest endpoint whose ServerList names `cluster`, read from the node. */
    async #endpointServing(cluster: number): Promise<number> {
        const endpoints = (await this.readAttributes([SERVER_LIST]))
            .filter(({ value }) => Array.isArray(value) && value.map(Number).includes(cluster))
            .map(({ endpoint }) => endpoint)
            .sort((a, b) => a - b);
        if (endpoints.length === 0) {
            throw new UnexpectedDataError(`Node ${this.#nodeId} has no endpoint serving cluster ${cluster}`);
        }
        return endpoints[0];
    }

    /**
     * The server's own node id on this node's fabric: the subject of the CASE administrator entry the server's
     * commissioning gave the node's access control list (its `CaseAdminSubject`), which the WebSocket API does not
     * report otherwise.
     */
    async #ownNodeId(): Promise<bigint> {
        const acl = await this.readAttribute({
            endpoint: 0,
            cluster: AccessControl.Cluster.id,
            attribute: AccessControl.Cluster.attributes.acl.id,
        });
        const subjects = new Array<bigint>();
        if (Array.isArray(acl)) {
            for (const entry of acl) {
                if (
                    isObject(entry) &&
                    entry.privilege === AccessControl.AccessControlEntryPrivilege.Administer &&
                    entry.authMode === AccessControl.AccessControlEntryAuthMode.Case &&
                    Array.isArray(entry.subjects)
                ) {
                    for (const subject of entry.subjects) {
                        if (typeof subject === "number" || typeof subject === "bigint") {
                            subjects.push(BigInt(subject));
                        }
                    }
                }
            }
        }
        if (subjects.length !== 1) {
            throw new UnexpectedDataError(
                `Node ${this.#nodeId} answered a fabric-filtered ACL read with ${Diagnostic.json(acl)}, not one CASE ` +
                    `administrator`,
            );
        }
        return subjects[0];
    }

    /** The vendor id of the server's own entry in this node's Fabrics list, which the server wrote commissioning it. */
    async #adminVendorId(): Promise<number> {
        const fabrics = await this.readAttribute({
            endpoint: 0,
            cluster: OperationalCredentials.Cluster.id,
            attribute: OperationalCredentials.Cluster.attributes.fabrics.id,
        });
        if (!Array.isArray(fabrics) || fabrics.length !== 1) {
            throw new UnexpectedDataError(
                `Node ${this.#nodeId} answered a fabric-filtered Fabrics read with ${Diagnostic.json(fabrics)}`,
            );
        }
        const [fabric] = fabrics;
        if (!isObject(fabric) || typeof fabric.vendorId !== "number") {
            throw new UnexpectedDataError(`Node ${this.#nodeId} holds a fabric entry without a vendor id`);
        }
        return fabric.vendorId;
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

/** The server's `"endpoint/cluster/event"` path, `*` for an absent segment. */
function eventKeyOf({ endpoint, cluster, event }: EventPathSpec) {
    return `${endpoint ?? "*"}/${cluster ?? "*"}/${event ?? "*"}`;
}

function concreteEventKeyOf(path: EventPathSpec) {
    const { endpoint, cluster, event } = path;
    return endpoint === undefined || cluster === undefined || event === undefined ? undefined : eventKeyOf(path);
}

function assertExpressible(path: { endpoint?: number; cluster?: number; attribute?: number; event?: number }) {
    if (
        path.endpoint === WILDCARD_ENDPOINT ||
        path.cluster === WILDCARD_CLUSTER ||
        path.attribute === WILDCARD_LEAF ||
        path.event === WILDCARD_LEAF
    ) {
        throw refusal("max-value-path-ids", `addressing ${JSON.stringify(path)}`);
    }
}

/**
 * A field left `undefined` is not sent, so without a `minEventNumber` the request carries no event filter at all, and
 * an event path without `urgent` no IsUrgent flag.
 */
function eventFilterOf(options?: ReadEventOptions) {
    return { fabric_filtered: options?.fabricFiltered ?? true, event_min: options?.minEventNumber };
}

/**
 * A concrete path the device answered with a status fails as in-process. A wildcard path's statuses are per-item
 * results of its expansion, so those are not looked at.
 */
function throwIfRefused(statuses: Map<string, WirePathStatus>, key: string, operation: string) {
    const refused = statuses.get(key);
    if (refused !== undefined) {
        throw new StatusResponseError(`${operation} ${key} failed`, refused.status, refused.clusterStatus);
    }
}

function throwIfAnyRefused(statuses: Map<string, WirePathStatus>, keys: (string | undefined)[], operation: string) {
    for (const key of keys) {
        if (key !== undefined) {
            throwIfRefused(statuses, key, operation);
        }
    }
}

function eventEntryOf({ endpoint, cluster, event, eventNumber, result }: WireEvent): EventReadEntry {
    return { endpoint, cluster, event, eventNumber, value: valueOf(result) };
}

function valueOf(entry: WireValueResult) {
    if (entry.kind === "value") {
        return entry.value;
    }
    throw entry.error;
}

function deviceTypeOf(entry: unknown, endpoint: number) {
    if (!isObject(entry) || typeof entry.deviceType !== "number") {
        throw new UnexpectedDataError(
            `matterjs-server holds a DeviceTypeList entry without a device type on endpoint ${endpoint}: ` +
                Diagnostic.json(entry),
        );
    }
    return entry.deviceType;
}

/** A held value that does not decode fails the call, as a read of it would. */
function heldValueOf(held: WireAttribute[], path: ClientAttributePath) {
    const entry = attributeAt(held, path);
    return entry === undefined ? undefined : valueOf(entry.result);
}

/**
 * One {@link CertNodeApi.observeEvents} call: `node_event`s of the node that match its paths reach `onUpdate` once,
 * by event number. Those arriving before the seed read returned are held until then, so an event the read also
 * answers with is not reported twice.
 */
class EventObservation {
    readonly #nodeId: NodeId;
    readonly #paths: EventPathSpec[];
    readonly #onUpdate?: (event: EventReadEntry) => void;
    readonly #delivered = new Set<bigint>();
    #pending?: EventReadEntry[] = new Array<EventReadEntry>();

    readonly listener = (event: string, data: unknown) => this.#receive(event, data);

    constructor(nodeId: NodeId, paths: EventPathSpec[], { onUpdate }: ObserveEventOptions) {
        this.#nodeId = nodeId;
        this.#paths = paths;
        this.#onUpdate = onUpdate;
    }

    seed(entries: EventReadEntry[]) {
        for (const { eventNumber } of entries) {
            this.#delivered.add(eventNumber);
        }
        const held = this.#pending ?? [];
        this.#pending = undefined;
        for (const entry of held) {
            this.#report(entry);
        }
    }

    /** Other listeners share the client's events, so a failure here is logged rather than thrown into them. */
    #receive(event: string, data: unknown) {
        try {
            this.#accept(event, data);
        } catch (error) {
            logger.debug(`Observation of the events of node ${this.#nodeId} dropped a node_event:`, error);
        }
    }

    #accept(event: string, data: unknown) {
        if (
            event !== "node_event" ||
            !isObject(data) ||
            (typeof data.node_id !== "number" && typeof data.node_id !== "bigint") ||
            BigInt(data.node_id) !== BigInt(this.#nodeId)
        ) {
            return;
        }
        const [decoded] = decodeInteractionReport({ attributes: {}, events: [data] }).events;
        const matches = this.#paths.some(
            ({ endpoint, cluster, event }) =>
                (endpoint === undefined || endpoint === decoded.endpoint) &&
                (cluster === undefined || cluster === decoded.cluster) &&
                (event === undefined || event === decoded.event),
        );
        if (!matches) {
            return;
        }
        const entry = eventEntryOf(decoded);
        if (this.#pending === undefined) {
            this.#report(entry);
        } else {
            this.#pending.push(entry);
        }
    }

    #report(entry: EventReadEntry) {
        if (this.#delivered.has(entry.eventNumber)) {
            return;
        }
        this.#delivered.add(entry.eventNumber);
        try {
            this.#onUpdate?.(entry);
        } catch (error) {
            logger.warn(`Observer of the events of node ${this.#nodeId} threw:`, error);
        }
    }
}

function attributeAt(attributes: WireAttribute[], { endpoint, cluster, attribute }: AttributePathSpec) {
    return attributes.find(
        entry => entry.endpoint === endpoint && entry.cluster === cluster && entry.attribute === attribute,
    );
}

/**
 * The entries an in-process wildcard read returns, each with its cluster's data version where the server reported one.
 * With `versionsRequired`, an entry without one fails the read: the step would send it back as a write condition, and
 * a missing one would make that write unconditional.
 *
 * A value that does not decode fails the whole read: an in-process read would have returned it, so leaving it out
 * would answer a step with less than the device reported.
 */
function entriesOf(
    { attributes, dataVersions }: WireInteractionReport,
    versionsRequired = false,
): AttributeReadEntry[] {
    return attributes.map(({ endpoint, cluster, attribute, result }) => {
        const entry: AttributeReadEntry = { endpoint, cluster, attribute, value: valueOf(result) };
        const version = dataVersions.get(clusterKeyOf(endpoint, cluster));
        if (version !== undefined) {
            entry.version = version;
        } else if (versionsRequired) {
            throw new MatterServerReadError(
                `matterjs-server reported ${endpoint}/${cluster}/${attribute} without its cluster's data version`,
            );
        }
        return entry;
    });
}

/** An integer field of a `parse_onboarding_payload` result, `undefined` where the server left it out. */
function parsedInteger(parsed: Record<string, unknown>, name: string, code: string): number | undefined {
    const value = parsed[name];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new UnexpectedDataError(
            `matterjs-server parsed ${name} of ${code} as ${Diagnostic.json(value)}, which is no integer`,
        );
    }
    return value;
}

function parsedRequired(parsed: Record<string, unknown>, name: string, code: string): number {
    const value = parsedInteger(parsed, name, code);
    if (value === undefined) {
        throw new UnexpectedDataError(`matterjs-server parsed ${code} without ${name}`);
    }
    return value;
}

/**
 * A vendor or product id, which the server leaves out where the code states none; the in-process codec reports that
 * as absent too, so a 0 would compare unequal to the in-process reading.
 */
function parsedIdentifier(parsed: Record<string, unknown>, name: string, code: string): number | undefined {
    const value = parsedInteger(parsed, name, code);
    if (value === 0) {
        throw new UnexpectedDataError(`matterjs-server parsed ${name} of ${code} as 0 instead of leaving it out`);
    }
    return value;
}

/**
 * One `CommissionableNodeData` entry of a `discover_commissionable_nodes` answer. The server reports a vendor or
 * product the advertisement leaves out as -1.
 */
function discoveredNodeOf(entry: unknown): DiscoveredCommissionableNode {
    const malformed = (field: string) =>
        new UnexpectedDataError(
            `matterjs-server reported a discovered node without ${field}: ${Diagnostic.json(entry)}`,
        );
    if (!isObject(entry)) {
        throw malformed("any field");
    }
    const integer = (field: string) => {
        const value = entry[field];
        if (typeof value !== "number" || !Number.isInteger(value)) {
            throw malformed(field);
        }
        return value;
    };
    const identifier = (field: string) => {
        const value = integer(field);
        return value === -1 ? undefined : value;
    };
    const { instance_name } = entry;
    if (typeof instance_name !== "string") {
        throw malformed("instance_name");
    }
    return {
        instanceName: instance_name,
        longDiscriminator: integer("long_discriminator"),
        vendorId: identifier("vendor_id"),
        productId: identifier("product_id"),
        commissioningMode: integer("commissioning_mode"),
    };
}

/** The `timed_request_timeout_ms` field of a `device_command`, `batched_device_commands` or `write_attribute`. */
function timedRequestOf(options?: TimedInteractionOptions) {
    const timeout = timedInteractionTimeoutOf(options);
    return timeout === undefined ? {} : { timed_request_timeout_ms: timeout };
}

/**
 * The statuses `write_attribute` answers `path` with: one per endpoint the device answered for, each with the cluster
 * status the device sent beside it. A concrete endpoint gets exactly one.
 */
function writeStatusesOf(result: unknown, path: { endpoint?: number; cluster: number; attribute: number }) {
    const malformed = () =>
        new UnexpectedDataError(
            `matterjs-server answered write_attribute ${pathKeyOf(path)} with ${Diagnostic.json(result)}`,
        );
    if (!Array.isArray(result) || (path.endpoint !== undefined && result.length !== 1)) {
        throw malformed();
    }
    return result.map(entry => {
        if (
            !isObject(entry) ||
            !isObject(entry.Path) ||
            typeof entry.Path.EndpointId !== "number" ||
            entry.Path.ClusterId !== path.cluster ||
            entry.Path.AttributeId !== path.attribute ||
            (path.endpoint !== undefined && entry.Path.EndpointId !== path.endpoint) ||
            typeof entry.Status !== "number" ||
            (entry.ClusterStatus !== undefined && typeof entry.ClusterStatus !== "number")
        ) {
            throw malformed();
        }
        return {
            endpoint: entry.Path.EndpointId,
            cluster: path.cluster,
            attribute: path.attribute,
            status: entry.Status,
            clusterStatus: entry.ClusterStatus,
        };
    });
}

/**
 * The `batched_device_commands` result, one entry per command in request order, as the in-process adapter reports the
 * same answers: a status, or the decoded response payload.
 */
function batchResultsOf(result: unknown, invocations: { clusterId: number; commandName: string }[]) {
    if (!Array.isArray(result) || result.length !== invocations.length) {
        throw new UnexpectedDataError(
            `matterjs-server answered a batch of ${invocations.length} commands with ${Diagnostic.json(result)}`,
        );
    }
    return result.map((entry, index): BatchCommandResult => {
        if (
            !isObject(entry) ||
            typeof entry.status !== "number" ||
            (entry.cluster_status !== undefined && typeof entry.cluster_status !== "number")
        ) {
            throw new UnexpectedDataError(
                `matterjs-server answered command ${index} of a batch with ${Diagnostic.json(entry)}`,
            );
        }
        if (entry.status !== Status.Success || entry.response === undefined) {
            return { index, status: entry.status, clusterStatus: entry.cluster_status };
        }
        const { clusterId, commandName } = invocations[index];
        const data = decodeCommandResponse(clusterId, commandName, entry.response);
        return data === undefined ? { index, status: Status.Success } : { index, data };
    });
}

/**
 * A command the device answered with a status fails with that status, as in-process. The server sends `status` only
 * for a status the device returned, never for one of its own refusals.
 */
async function deviceStatusOf<T>(command: Promise<T>, operation: string): Promise<T> {
    try {
        return await command;
    } catch (error) {
        if (error instanceof MatterServerCommandError && error.failure.status !== undefined) {
            throw new StatusResponseError(`${operation} failed`, error.failure.status, error.failure.clusterStatus);
        }
        throw error;
    }
}

/**
 * A failed commissioning as the in-process controller reports it, by the reason the server gives. `not-discovered`
 * also covers devices that were found but did not finish PASE before discovery ended: matter.js reports both alike.
 */
function commissioningFailureOf(error: unknown) {
    if (!(error instanceof MatterServerCommandError)) {
        return error;
    }
    switch (error.failure.reason) {
        case "invalid-payload":
            return new OnboardingPayloadRefusedError(`Refused ${error.message}`, { cause: error });
        case "not-discovered":
            return new DiscoveryError(error.message, { cause: error });
        case undefined:
            return error;
        default:
            return new MatterServerCommissioningError(error.failure.reason, error.message, { cause: error });
    }
}
