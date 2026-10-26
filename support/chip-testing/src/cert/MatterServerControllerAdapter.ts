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
    ClientEndpointEntry,
    CommissioningTarget,
    ControllerAdapter,
    ControllerAdapterOptions,
    ControllerCapabilitiesOutOfScope,
    ControllerCapability,
    ControllerCapabilityGaps,
    EventPathSpec,
    EventReadEntry,
    GroupKeySetSpec,
    ManualPairingCodeFields,
    OnboardingPayloadFields,
    OtaAnnouncement,
    OtaAnnouncementRecord,
    OtaBdxTransfer,
    PicsValues,
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

const SERVER_LIST: AttributePathSpec = {
    cluster: Descriptor.Cluster.id,
    attribute: Descriptor.Cluster.attributes.serverList.id,
};

/**
 * What this controller claims about itself, overlaying the device's PICS for a run (see `controllerPicsOverridesFor`).
 * Only what differs from the CHIP PICS file, which describes a device.
 */
export const MATTERJS_SERVER_CONTROLLER_PICS: PicsValues = {
    // `batched_device_commands` sends the batch as one InvokeRequest.
    "MCORE.IDM.C.InvokeRequest.BatchCommands": 1,

    "MCORE.ROLE.COMMISSIONER": 1,

    // `commission_with_code` takes either onboarding payload, the scanned `MT:…` form included.
    "MCORE.DD.QR_COMMISSIONING": 1,
    "MCORE.DD.MANUAL_PC_COMMISSIONING": 1,
    "MCORE.DD.SCAN_QR_CODE": 1,

    // A concatenated payload names several commissionees and is refused; the caller is told to split it.
    "MCORE.DD.CTRL_CONCATENATED_QR_CODE_1": 0,

    // `open_commissioning_window` ignores its `option` and always opens an enhanced window.
    "CADMIN.C.C01.Tx": 0,

    // matter.js commissioning sends no SetTCAcknowledgements.
    "CGEN.C.F00": 0,

    // The server hosts matter.js's OTA provider, so it takes the BDX and OTA roles the in-process controller declares.
    // The CHIP PICS file answers these for a device. Scripted provider answers are out of scope
    // (`ota-provider-script`).
    "MCORE.BDX.Sender": 1,
    "MCORE.BDX.Responder": 1,
    "MCORE.BDX.SynchronousSender": 1,
    "MCORE.BDX.AsynchronousSender": 0,
    "MCORE.BDX.BlockQueryWithSkip": 0,

    // The server only sends images, on a requestor's ReceiveInit: it never receives a transfer or opens one, and as
    // the sender it sends no BlockQuery, which the test plans check for the driver role. The CHIP PICS file answers 1
    // for the initiator and the driver.
    "MCORE.BDX.Receiver": 0,
    "MCORE.BDX.Initiator": 0,
    "MCORE.BDX.Driver": 0,
    "MCORE.BDX.SynchronousReceiver": 0,
    "MCORE.BDX.AsynchronousReceiver": 0,
    "MCORE.OTA.Provider": 1,
    "MCORE.OTA.HTTPS": 0,
    "OTAR.C.M.AnnounceOTAProvider": 1,
    "OTAR.C.M.NotifyUpdateApplied": 0,
    "OTAP.S.M.DelayedActionTime": 1,
    "OTAP.S.M.UserConsentNeeded": 1,

    // The server registers as an ICD Check-In client (`register_icd`). The CHIP PICS file answers only the server
    // side.
    "ICDB.C": 1,

    // The IcdManagement client commands the server sends: RegisterClient and UnregisterClient through `register_icd`
    // and `unregister_icd`, StayActiveRequest through `device_command`. The CHIP PICS file does not answer these.
    "ICDM.C.C00.Tx": 1,
    "ICDM.C.C02.Tx": 1,
    "ICDM.C.C03.Tx": 1,

    // The server is a bridge client that maintains the devices behind a bridge. The CHIP PICS file answers these for
    // a device. That it maintains them only through a subscription of its own, which it runs without here, is the
    // `sustained-subscription` capability gap.
    "MCORE.BRIDGECLIENT": 1,
    "MCORE.DEVLIST.UseDevices": 1,
    "MCORE.DEVLIST.UseDeviceName": 1,
    "MCORE.DEVLIST.UseDeviceState": 1,
    "MCORE.DEVLIST.UseBatInfo": 1,

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

    // The client commands and the attribute the single-command client cases send or read (TC-OO-3.2, TC-I-3.2,
    // TC-MOD-2.2, TC-LOWPOWER-2.2, TC-WNCV-6.1, TC-WNCV-7.1). Only `OO.C` (0 in matter.js's own PICS file) and `WNCV.C`
    // (0 in CHIP's) need the overlay; the other keys state the server's full client surface for these cases.
    "OO.C": 1,
    "OO.C.C00.Tx": 1,
    "OO.C.C01.Tx": 1,
    "OO.C.C02.Tx": 1,
    "OO.C.C40.Tx": 1,
    "OO.C.C41.Tx": 1,
    "OO.C.C42.Tx": 1,
    "I.C": 1,
    "I.C.C00.Tx": 1,
    "I.C.C40.Tx": 1,
    "MOD.C": 1,
    "MOD.C.A0002": 1,
    "MOD.C.C00.Tx": 1,
    "LOWPOWER.C": 1,
    "LOWPOWER.C.C00.Tx": 1,
    "WNCV.C": 1,
    "WNCV.C.C00.Tx": 1,
    "WNCV.C.C01.Tx": 1,
    "WNCV.C.C02.Tx": 1,
    "WNCV.C.C05.Tx": 1,
    "WNCV.C.C08.Tx": 1,

    // The diagnostics client commands, and the one attribute, that TC-DGETH-3.2, TC-DGSW-3.2, TC-DGTHREAD-3.4 and
    // TC-DGWIFI-3.2 send or read. Only `DGTHREAD.C` and `DGWIFI.C.C00.Tx` need the overlay, because CHIP's file
    // answers them 0; the other keys state the server's full client surface for these cases.
    "DGETH.C": 1,
    "DGETH.C.C00.Tx": 1,
    "DGSW.C": 1,
    "DGSW.C.C00.Tx": 1,
    "DGTHREAD.C": 1,
    "DGTHREAD.C.C00.Tx": 1,
    "DGTHREAD.C.A0006": 1,
    "DGWIFI.C": 1,
    "DGWIFI.C.C00.Tx": 1,

    // The same Switch client declaration as the other controllers: the switch it observes is an action switch
    "SWTCH.C": 1,
    "SWTCH.C.F02": 0,
    "SWTCH.C.F05": 1,
    "TBRM.C": 1,
    "TBRM.C.C00.Tx": 1,
    "TBRM.C.C01.Tx": 1,
    "TBRM.C.C03.Tx": 1,
    "TBRM.C.C04.Tx": 1,
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
    "sustained-subscription":
        "this adapter keeps the server's own subscription to a node off except while an OTA update or an ICD " +
        "registration needs it, so it has none to observe events through or to keep its device list current",
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
    readonly #autoSubscriptions = new Map<string, Promise<void>>();
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
        return node.node_id.toString();
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
                enableAutoSubscription: () => this.#enableAutoSubscription(key),
                disableAutoSubscription: () => this.#disableAutoSubscription(key),
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

    /**
     * Switches the server's own subscription to the node on, once, and says whether this call did: the server's ICD
     * client and OTA provider act only on a node it subscribes to itself. A failed attempt is forgotten, so the next
     * caller tries again.
     */
    async #enableAutoSubscription(nodeId: string) {
        const enabled = this.#autoSubscriptions.get(nodeId);
        if (enabled !== undefined) {
            await enabled;
            return false;
        }
        const enabling = this.#enable(nodeId);
        this.#autoSubscriptions.set(nodeId, enabling);
        await enabling;
        return true;
    }

    async #enable(nodeId: string) {
        try {
            await this.#started.client.command(
                "enable_auto_subscription",
                { node_id: NodeId(BigInt(nodeId)) },
                { timeout: AUTO_SUBSCRIPTION_TIMEOUT },
            );
        } catch (error) {
            this.#autoSubscriptions.delete(nodeId);
            throw error;
        }
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

    /** The server runs with its own subscriptions off, so one this adapter did not switch on is off already. */
    async #disableAutoSubscription(nodeId: string) {
        if (!this.#autoSubscriptions.delete(nodeId)) {
            return;
        }
        await this.#started.client.command("disable_auto_subscription", { node_id: NodeId(BigInt(nodeId)) });
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

    disableAutoSubscription(): Promise<void>;

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

    async observeEvents(): Promise<never> {
        throw refusal("sustained-subscription", "observeEvents");
    }

    /** The server holds what its own subscription keeps current, and this adapter keeps that subscription off. */
    async clientEndpoints(): Promise<ClientEndpointEntry[]> {
        throw refusal("sustained-subscription", "the endpoints the controller holds for a node");
    }

    /** As {@link clientEndpoints}. */
    async clientAttribute(): Promise<unknown> {
        throw refusal("sustained-subscription", "an attribute value the controller holds for a node");
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
