/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Crypto,
    Environment,
    ImplementationError,
    InternalError,
    isObject,
    MatterError,
    UnexpectedDataError,
} from "@matter/main";
import {
    Descriptor,
    OperationalCredentials,
    OtaSoftwareUpdateProvider,
    OtaSoftwareUpdateRequestor,
} from "@matter/main/clusters";
import { getOperationalDeviceQname, ResultStatus } from "@matter/main/protocol";
import { FabricId, GlobalFabricId, NodeId, statedIdentifier, Status, StatusResponseError } from "@matter/main/types";
import { ClusterModel, CommandModel, ValueModel } from "@matter/model";
import type {
    AnnounceOtaProviderOptions,
    AttributePathSpec,
    AttributeReadEntry,
    AttributeWriteEntry,
    AttributeWriteStatus,
    BatchCommandResult,
    BatchCommandSpec,
    CertControllerGroup,
    CertGroupApi,
    CertNodeApi,
    CertNodeRef,
    ClientAttributePath,
    ClientEndpointEntry,
    CommissioningTarget,
    ControllerAdapter,
    EventPathSpec,
    EventReadEntry,
    GroupKeySetSpec,
    ManualPairingCodeFields,
    ObserveEventOptions,
    OnboardingPayloadFields,
    OtaAnnouncement,
    OtaAnnouncementRecord,
    ReadAttributeOptions,
    ReadEventOptions,
    SubscribeAttributesOptions,
    SubscribeEventOptions,
    SubscribeOptions,
    TimedInteractionOptions,
} from "@matter/testing";
import type {
    ControllerAdapterOptions,
    ControllerCapabilityGaps,
    ControllerTransport,
    PicsValues,
} from "@matter/testing";
import { LineQueue, LogFollower, UnsupportedByControllerError } from "@matter/testing";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import type { ChipToolCommissionerName } from "../chip-tool/chip-tool-client.js";
import { ChipToolClient, resolveChipToolBinary } from "../chip-tool/chip-tool-client.js";
import { chipJsonToMatter, matterToChipJson, stringifyChipJson } from "../chip-tool/json-codec.js";
import { type LoggedAttributeStatus, loggedWriteResponseStatuses } from "../chip-tool/write-response-log.js";
import { ControllerCommandError } from "./controller-command-error.js";
import { assertDeclaredKeySet, declaredGroup, validateControllerGroups } from "./controller-groups.js";
import { certClusterModelFor, findCertCluster } from "./custom-clusters.js";
import { assertSingleQrPayload, OnboardingPayloadRefusedError } from "./onboarding-payload.js";
import { timedInteractionTimeoutOf } from "./timed-interaction.js";

/** Name {@link UnsupportedByControllerError} reports for this adapter. */
const CONTROLLER = "chip-tool";

/**
 * What this controller claims about itself, overlaying the device's PICS for a run (see
 * `controllerPicsOverridesFor`). Only what differs from the CHIP PICS file, which describes a device.
 */
export const CHIP_TOOL_CONTROLLER_PICS: PicsValues = {
    // chip-tool speaks no BDX at all: it is a commissioner, hosts no OTA provider and has no image to
    // send. The CHIP PICS file answers these for a device, so without this a BDX case would be gated
    // on what the TH supports rather than on what this controller can do.
    "MCORE.BDX.Sender": 0,
    "MCORE.BDX.Responder": 0,
    "MCORE.BDX.SynchronousSender": 0,
    "MCORE.BDX.AsynchronousSender": 0,
    "MCORE.BDX.BlockQueryWithSkip": 0,

    // The same for the OTA roles built on BDX. Without these the device file's own answers stand, the
    // SU cases are admitted, and their first step fails on a controller that cannot serve an image at
    // all — a whole case a controller cannot drive has to skip before it commissions anything.
    "MCORE.OTA.Provider": 0,
    "OTAP.S.M.DelayedActionTime": 0,
    "OTAP.S.M.UserConsentNeeded": 0,

    // `otasoftwareupdaterequestor announce-otaprovider` names another commissioned node as the provider.
    "OTAR.C.M.AnnounceOTAProvider": 1,

    // command-by-id sends one command path per invoke and no CommandRef.
    "MCORE.IDM.C.InvokeRequest.BatchCommands": 0,

    "MCORE.ROLE.COMMISSIONER": 1,

    // `pairing code` takes either onboarding payload, the scanned `MT:…` form included.
    "MCORE.DD.QR_COMMISSIONING": 1,
    "MCORE.DD.MANUAL_PC_COMMISSIONING": 1,
    "MCORE.DD.SCAN_QR_CODE": 1,

    // A concatenated payload names several commissionees and is refused; the caller is told to split it.
    "MCORE.DD.CTRL_CONCATENATED_QR_CODE_1": 0,

    // Every Actions command has its own `actions <command>`. The CHIP PICS file answers 0 for these
    // because it describes a device, which is not an Actions client; here the client is the controller.
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

    // The client commands, and the one attribute, that the single-command client cases send or read
    // (TC-OO-3.2, TC-I-3.2, TC-MOD-2.2, TC-LOWPOWER-2.2, TC-WNCV-6.1, TC-WNCV-7.1). Only `OO.C` (0 in
    // matter.js's own PICS file) and `WNCV.C` (0 in CHIP's) need the overlay, because both files
    // describe a device; the other keys state the controller's full client surface for these cases.
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
    // answers them 0; the other keys state the controller's full client surface for these cases.
    "DGETH.C": 1,
    "DGETH.C.C00.Tx": 1,
    "DGSW.C": 1,
    "DGSW.C.C00.Tx": 1,
    "DGTHREAD.C": 1,
    "DGTHREAD.C.C00.Tx": 1,
    "DGTHREAD.C.A0006": 1,
    "DGWIFI.C": 1,
    "DGWIFI.C.C00.Tx": 1,

    // Every ThreadBorderRouterManagement client command TC-TBRM-3.1 sends. The CHIP PICS file answers
    // only the server side, because it describes a device; here the client is the controller.
    "TBRM.C": 1,
    "TBRM.C.C00.Tx": 1,
    "TBRM.C.C01.Tx": 1,
    "TBRM.C.C03.Tx": 1,
    "TBRM.C.C04.Tx": 1,

    // chip-tool has an ICD client of its own, but this adapter does not expose it.
    "ICDB.C": 0,
    "ICDM.C": 0,

    // GroupKeyManagement and Groups client commands TC-SC-6.1 sends beyond what the device file already
    // answers 1 for. The file describes a device, which is neither a group-key nor a groups client.
    "G.C.C01.Tx": 1,
    "GRPKEY.C.C03.Tx": 1,
    "GRPKEY.C.C04.Tx": 1,

    // The Switch client flags TC-SWTCH-3.2 rests on. The CHIP PICS file answers 0 for `SWTCH.C` and
    // declares F00..F04 for a *device*; here the switch client is the controller, and this overlay is
    // the DUT-as-client declaration the plan's steps 0a-0h check for self-consistency.
    "SWTCH.C": 1,

    // CHIP's PICS file has no entry for the action-switch client flag, and it answers 1 for the release
    // flag, which the cluster forbids alongside an action switch (Application Clusters § 1.13.4). The
    // switch this controller observes is an action switch, so that is what it declares.
    "SWTCH.C.F02": 0,
    "SWTCH.C.F05": 1,

    // Bridge-client flags. `MCORE.BRIDGECLIENT` asks whether the DUT supports a bridge, and the
    // `MCORE.DEVLIST.*` flags whether it maintains the devices behind one — their names, their state,
    // their battery level. CHIP's PICS file answers these for a *device*, so the answers there say
    // nothing about the client, and this overlay is the DUT-as-client declaration TC-BR-4 rests on.
    //
    // chip-tool answers each command straight from the device and keeps nothing between them, so it
    // maintains no device list of any kind — the device file's own 1 for the `DEVLIST` flags would
    // otherwise let a step ask it what it holds.
    "MCORE.BRIDGECLIENT": 0,
    "MCORE.DEVLIST.UseDevices": 0,
    "MCORE.DEVLIST.UseDeviceName": 0,
    "MCORE.DEVLIST.UseDeviceState": 0,
    "MCORE.DEVLIST.UseBatInfo": 0,
};

/**
 * chip-tool's `kMaxAllowedPaths` (`src/app/tests/suites/commands/interaction_model/InteractionModel.h`).
 * chip-tool checks it in `InteractionModelConfig::GetAttributePaths`, which its read and write paths
 * reach only with a live `DeviceProxy` in hand, so this guard is what keeps an over-long id list from
 * costing a CASE session first.
 */
const MAX_PATHS_PER_COMMAND = 64;

/**
 * What chip-tool lacks, declared with its registration so a step or case needing one of these is skipped before it acts
 * (see `controllerCapabilityGap`).
 *
 * The transport is accepted as an option, and its `--allow-large-payload` reaches every command, but that does not make
 * chip-tool establish a TCP-backed session.
 */
export const CHIP_TOOL_CAPABILITY_GAPS = {
    "tcp-transport":
        "chip-tool reuses the session commissioning established, so a large-payload interaction does not cause it to " +
        "establish a TCP-backed one",
    attestation:
        "chip-tool reads revocation from a file its own process is started with, which a running adapter cannot change",
    "webrtc-requestor":
        "chip-tool is a commissioner process, not a node, so a provider has nowhere to invoke signaling",
    "chunked-write":
        "chip-tool write-by-id encodes the whole write into one message and fails with CHIP Error 0x0000000B (No memory) " +
        "when it does not fit",
    "batch-invoke":
        "command-by-id sends one command per invoke request: it takes a single command path and no CommandRef",
    "batch-arrival-order":
        "command-by-id sends one command per invoke request, so there is no batch whose answers arrive in an order",
    "many-paths-per-request": `chip-tool takes at most ${MAX_PATHS_PER_COMMAND} paths per command, so a step naming more declares this`,
    "mixed-version-write": "chip-tool takes one data version per path or none at all, not a mix",
    "typed-list-write-with-others":
        "chip-tool writes DefaultOTAProviders only through its typed cluster command, which writes one attribute per " +
        "request",
    "session-introspection":
        "chip-tool exposes no session state of its own: a session lives inside the process it spawns per command, and " +
        "nothing it prints names the transport beneath one",
    "sustained-subscription":
        "chip-tool keeps no subscription to a node between commands, so it has none to observe events through and " +
        "holds no device list or attribute values of its own",
    "ota-provider":
        "chip-tool is a commissioner, not an OTA provider: it hosts no OtaSoftwareUpdateProvider cluster and keeps no " +
        "image catalog to serve one from",
    "ota-provider-script":
        "chip-tool hosts no OtaSoftwareUpdateProvider cluster, so there is no provider of its own to script or announce",
    "icd-client":
        "this adapter drives chip-tool's commands for single interactions and does not expose its ICD client " +
        "(registration, key refresh and Check-In handling)",
} as const satisfies ControllerCapabilityGaps;

function refusal(capability: keyof typeof CHIP_TOOL_CAPABILITY_GAPS, operation: string, controller = CONTROLLER) {
    return new UnsupportedByControllerError(operation, controller, CHIP_TOOL_CAPABILITY_GAPS[capability], capability);
}

const WILDCARD_CLUSTER = 0xffffffff;
const WILDCARD_ATTRIBUTE = 0xffffffff;
const WILDCARD_EVENT = 0xffffffff;
const WILDCARD_ENDPOINT = 0xffff;

const FABRICS: AttributePathSpec = {
    endpoint: 0,
    cluster: OperationalCredentials.id,
    attribute: OperationalCredentials.attributes.fabrics.id,
};

const SERVER_LIST: AttributePathSpec = {
    cluster: Descriptor.id,
    attribute: Descriptor.attributes.serverList.id,
};

/** The lowest endpoint of `node` whose ServerList carries `cluster`. */
async function endpointServing(node: CertNodeApi, ref: CertNodeRef, cluster: number): Promise<number> {
    // The reply can also carry reports of a live subscription, such as a ClientList naming the same cluster
    const endpoints = (await node.readAttributes([SERVER_LIST]))
        .filter(entry => pathCovers(SERVER_LIST, entry))
        .filter(({ value }) => Array.isArray(value) && value.map(Number).includes(cluster))
        .map(({ endpoint }) => endpoint);
    if (endpoints.length === 0) {
        throw new UnexpectedDataError(`Node ${ref} has no endpoint serving cluster ${hex(cluster)}`);
    }
    return Math.min(...endpoints);
}

/** Digit count of the manual code form that carries a vendor and product id (§ 5.1.4.1 Table 64). */
const MANUAL_CODE_LONG_LENGTH = 21;

/** `chip::Crypto::kSpake2p_Min_PBKDF_Iterations`, the cheapest verifier chip-tool accepts. */
const PBKDF_ITERATIONS = 1000;

/**
 * A range of {@link ChipToolControllerAdapter.mintDiscriminator} values per commissioner name, so two
 * adapters opening a window at the same time pick different discriminators.
 */
const DISCRIMINATOR_RANGES: Record<ChipToolCommissionerName, number> = { alpha: 1, beta: 2, gamma: 3 };

/**
 * Assigned to adapters in this order, so a run's first controller role is chip-tool's `alpha`. These
 * are the identities chip-tool names; its `GetIdentity` also accepts `null-fabric-commissioner` and
 * any integer from 4 up (`examples/chip-tool/commands/common/CHIPCommand.cpp`).
 */
const COMMISSIONER_NAMES: ChipToolCommissionerName[] = ["alpha", "beta", "gamma"];

/**
 * Commissioner names live adapters hold, so each controller role is legible in chip-tool's own logs.
 * Sharing a name across two adapters would not merge their fabrics — their storage directories give
 * them different CA keys, hence different compressed fabric ids — but it would make a run's logs and
 * evidence ambiguous about which role acted.
 */
const claimedCommissioners = new Map<ChipToolCommissionerName, ChipToolControllerAdapter>();

/** First node id an adapter mints. Arbitrary, but outside the group and reserved ranges. */
const FIRST_NODE_ID = 0x1001n;

function hex(id: number) {
    return `0x${id.toString(16)}`;
}

/**
 * chip-tool tokenizes a command line with `std::quoted(arg, '\'')`
 * (`Commands::DecodeArgumentsFromStringStream`), which leaves a token not starting with `'` entirely
 * alone. Only whitespace and a leading quote need the quoted form.
 */
function quoteArg(value: string) {
    if (!/\s/.test(value) && !value.startsWith("'")) {
        return value;
    }
    return `'${value.replace(/[\\']/g, match => `\\${match}`)}'`;
}

/**
 * chip-tool decides a session's transport when it establishes one, so every interaction a test might
 * begin with carries this: `--allow-large-payload 1` asks for a TCP-backed session, which chip-tool
 * can only get where the peer advertises a TCP server (`OperationalSessionSetup`). The flag lives on
 * chip-tool's shared model-command base, so read, write, invoke, event read and subscribe all take it.
 */
function largePayloadArg(transport?: ControllerTransport) {
    return transport === "tcp" ? " --allow-large-payload 1" : "";
}

/**
 * How a group is addressed as a destination: a node id whose upper 48 bits are all ones carries the
 * group in its lower 16 (Matter Core § 2.5.4), and chip-tool takes that in place of a node id on any
 * command it sends. Built through {@link NodeId.fromGroupId} so a group id neither controller may use
 * is refused the same way on both.
 */
function groupDestination(groupId: number): string {
    return `0x${NodeId.fromGroupId(groupId).toString(16)}`;
}

/** chip-tool's own name for the timed-interaction timeout, on `command-by-id` and `write-by-id` alike. */
function timedArg(options?: TimedInteractionOptions) {
    const timeout = timedInteractionTimeoutOf(options);
    return timeout === undefined ? "" : ` --timedInteractionTimeoutMs ${timeout}`;
}

/**
 * List attributes written through chip-tool's typed cluster command rather than `any write-by-id`.
 *
 * `write-by-id` sends a list as one REPLACE `AttributeDataIB`. Matter Core (Encoding Specification, list encoding)
 * allows that only for AccessControl's ACL and Extension: any other list is an empty REPLACE followed by one ADD
 * per entry, and a server may apply those entries one by one. The typed command encodes through
 * `WriteClient::EncodeAttribute`, which follows that rule, but it takes chip-tool's own command and field names, so
 * each attribute that needs it is listed here with them.
 */
const TYPED_LIST_WRITES: readonly TypedListWrite[] = [
    {
        cluster: OtaSoftwareUpdateRequestor.id,
        attribute: OtaSoftwareUpdateRequestor.attributes.defaultOtaProviders.id,
        command: "otasoftwareupdaterequestor write default-otaproviders",
        fields: { providerNodeId: "providerNodeID", endpoint: "endpoint", fabricIndex: "fabricIndex" },
    },
];

interface TypedListWrite {
    cluster: number;
    attribute: number;
    command: string;

    /** Each entry field as matter.js names it, mapped to the name chip-tool's `ComplexArgumentParser` requires. */
    fields: Record<string, string>;
}

function typedListWriteFor(path: AttributePathSpec) {
    return TYPED_LIST_WRITES.find(({ cluster, attribute }) => cluster === path.cluster && attribute === path.attribute);
}

/**
 * The value of a {@link TypedListWrite} as its typed command parses it. Integers go as decimal strings: chip-tool's
 * `ComplexArgumentParser` reads a string at the field's full width for an unsigned field, which keeps a 64-bit node
 * id exact where a JSON number above 2^53 would not. It accepts a string for no signed field, so every field of a
 * {@link TypedListWrite} must be unsigned.
 */
function encodeTypedList(write: TypedListWrite, value: unknown) {
    if (!Array.isArray(value)) {
        throw new ImplementationError(`${write.command} needs a list, got ${describeValue(value)}`);
    }
    return JSON.stringify(
        value.map(entry => {
            if (!isObject(entry)) {
                throw new ImplementationError(`${write.command} needs struct entries, got ${describeValue(entry)}`);
            }
            const encoded: Record<string, string> = {};
            for (const [field, fieldValue] of Object.entries(entry)) {
                const chipName = write.fields[field];
                if (chipName === undefined) {
                    throw new ImplementationError(
                        `${write.command} has no field ${field}; it takes ${Object.keys(write.fields).join(", ")}`,
                    );
                }
                if (fieldValue === undefined) {
                    continue;
                }
                if (
                    !(typeof fieldValue === "bigint" && fieldValue >= 0n) &&
                    !(typeof fieldValue === "number" && Number.isSafeInteger(fieldValue) && fieldValue >= 0)
                ) {
                    throw new ImplementationError(
                        `${write.command} needs an unsigned integer for ${field}, got ${describeValue(fieldValue)}`,
                    );
                }
                encoded[chipName] = fieldValue.toString();
            }
            return encoded;
        }),
    );
}

function describeValue(value: unknown) {
    return JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? `${item}n` : item));
}

function clusterArg(path: AttributePathSpec) {
    return hex(path.cluster ?? WILDCARD_CLUSTER);
}

function attributeArg(path: AttributePathSpec) {
    return hex(path.attribute ?? WILDCARD_ATTRIBUTE);
}

function endpointArg(path: AttributePathSpec) {
    return path.endpoint === undefined ? hex(WILDCARD_ENDPOINT) : String(path.endpoint);
}

function eventClusterArg(path: EventPathSpec) {
    return hex(path.cluster ?? WILDCARD_CLUSTER);
}

function eventArg(path: EventPathSpec) {
    return hex(path.event ?? WILDCARD_EVENT);
}

function eventEndpointArg(path: EventPathSpec) {
    return path.endpoint === undefined ? hex(WILDCARD_ENDPOINT) : String(path.endpoint);
}

/** Whether `path`, wildcards included, addresses the concrete path of `entry`. */
function pathCovers(path: AttributePathSpec, entry: { endpoint: number; cluster: number; attribute: number }) {
    return (
        (path.endpoint === undefined || path.endpoint === entry.endpoint) &&
        (path.cluster === undefined || path.cluster === entry.cluster) &&
        (path.attribute === undefined || path.attribute === entry.attribute)
    );
}

/** {@link pathCovers} for an event path. */
function eventPathCovers(path: EventPathSpec, entry: { endpoint: number; cluster: number; event: number }) {
    return (
        (path.endpoint === undefined || path.endpoint === entry.endpoint) &&
        (path.cluster === undefined || path.cluster === entry.cluster) &&
        (path.event === undefined || path.event === entry.event)
    );
}

/**
 * Codes `StatusCodeList.h` names that matter.js's {@link Status} has no member for, `WRITE_IGNORED`
 * being chip-internal and outside the specification.
 */
const CHIP_ONLY_STATUS_CODES: [string, number][] = [["writeignored", 0xf0]];

const statusByChipName = new Map<string, number>([
    ...Object.entries(Status)
        .filter((entry): entry is [string, Status] => typeof entry[1] === "number")
        .map(([name, status]): [string, number] => [name.toLowerCase(), status]),
    ...CHIP_ONLY_STATUS_CODES,
]);

/**
 * One interaction status chip-tool reported: its code, or the name chip-tool printed when no code can
 * be derived from that name.
 *
 * `StatusName` renders every code outside chip's own `StatusCodeList.h` as `Unallocated`, and
 * matter.js's `UnsupportedNode`, `TermsAndConditionsChanged` and `MaintenanceRequired` are outside it,
 * so for a matter.js device the code is sometimes discarded before the reply is even written.
 */
type ChipStatus = { readonly code: Status } | { readonly unmapped: string };

/**
 * chip-tool renders an interaction status either as its numeric value or, in a
 * `CHIP_CONFIG_IM_STATUS_CODE_VERBOSE_FORMAT` build (which is every Linux one), as its `StatusName`
 * (`RemoteDataModelLogger::LogError`), and both forms reach the same field. Those names are not all
 * `SCREAMING_SNAKE_CASE`: a deprecated or reserved code is named after its own value, and an
 * unallocated one is not named at all.
 */
function statusOf(error: unknown): ChipStatus {
    if (typeof error === "number") {
        return { code: error };
    }
    if (typeof error === "bigint") {
        return { code: Number(error) };
    }
    if (typeof error !== "string") {
        throw new UnexpectedDataError(`chip-tool reported a status that is neither a number nor a name: ${error}`);
    }

    const named = statusByChipName.get(error.replace(/_/g, "").toLowerCase());
    if (named !== undefined) {
        return { code: named };
    }

    const suffixed = /^(?:deprecated|reserved)([0-9a-f]{2})$/i.exec(error);
    if (suffixed !== null) {
        return { code: Number.parseInt(suffixed[1], 16) };
    }

    return { unmapped: error };
}

/**
 * A status chip-tool reported under a name that carries no code. Reporting it as a
 * {@link StatusResponseError} would need a code to invent, and dropping the entry would let a step
 * conclude the path answered normally, so the name is what surfaces.
 */
export class ChipToolUnmappedStatusError extends MatterError {}

function describeStatus(status: ChipStatus) {
    return "unmapped" in status ? status.unmapped : `status ${hex(status.code)}`;
}

function codeOf(status: ChipStatus, operation: string): Status {
    if ("unmapped" in status) {
        throw new ChipToolUnmappedStatusError(
            `chip-tool ${operation} reported the interaction status "${status.unmapped}", which names no code`,
        );
    }
    return status.code;
}

/** The error for a status chip-tool decoded from a `StatusIB` the device sent. */
function deviceStatusError(status: ChipGlobalStatus, operation: string, message?: string) {
    return ResultStatus.errorOf(
        { status: codeOf(status.status, operation), clusterStatus: status.clusterStatus, received: true },
        message,
    );
}

function numberOf(entry: Record<string, unknown>, key: string): number | undefined {
    const value = entry[key];
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    return undefined;
}

/** An attribute chip-tool reported a value for. */
interface ChipAttributeValue {
    endpoint: number;
    cluster: number;
    attribute: number;
    value: unknown;
    version?: number;
}

/** An event chip-tool reported, from a read's response or from a subscription's report. */
interface ChipEventValue {
    endpoint: number;
    cluster: number;
    event: number;
    eventNumber: bigint;
    value: unknown;
}

/** A command response payload chip-tool reported. */
interface ChipCommandResponse {
    endpoint: number;
    cluster: number;
    command: number;
    value: unknown;
}

/** A non-success status chip-tool reported for one interaction path. */
interface ChipPathStatus {
    endpoint?: number;
    cluster?: number;
    attribute?: number;
    command?: number;
    event?: number;
    status: ChipStatus;
    clusterStatus?: number;
}

/** A non-success status chip-tool reported without naming a path. */
interface ChipGlobalStatus {
    status: ChipStatus;
    clusterStatus?: number;
}

interface ChipReply {
    values: ChipAttributeValue[];
    events: ChipEventValue[];
    responses: ChipCommandResponse[];
    /** Statuses carrying a path: for a wildcard expansion these are per-item, not a command failure. */
    statuses: ChipPathStatus[];
    /**
     * Statuses carrying no path, which chip-tool derives from a raw `CHIP_ERROR`
     * (`ReportCommand::OnError` and its siblings): they apply to the whole interaction, and the device
     * may or may not be behind them — see {@link assertNoFailure}.
     */
    globalStatuses: ChipGlobalStatus[];
    /**
     * Whether the reply's exit-status marker was the command's only account of itself: it failed, with
     * no interaction status to say how.
     */
    commandFailed: boolean;
}

/**
 * Whether `result` is the bare entry `InteractiveServerResult::AsJsonString` appends to the reply of a
 * command that exited non-zero — for any reason at all, an interaction status included or not.
 */
function isExitFailureMarker(result: unknown) {
    return isObject(result) && Object.keys(result).length === 1 && result.error === "FAILURE";
}

/** A concrete path chip-tool reported an entry for, of either kind. */
type ReportedPath = { endpoint: number; cluster: number } & (
    | { attribute: number; event?: undefined }
    | { event: number; attribute?: undefined }
);

/** The paths a chip-tool command asked about, by kind. */
interface RequestedPaths {
    attributes?: AttributePathSpec[];
    events?: EventPathSpec[];
}

/**
 * Whether the command a reply belongs to could itself have produced an entry for one concrete path,
 * as opposed to a live subscription of some other command.
 */
type OwnPathTest = (path: ReportedPath) => boolean;

/**
 * Whether `result` accounts for the command's non-zero exit, which only an interaction status can:
 * one chip-tool logged for the interaction as a whole (`RemoteDataModelLogger::LogErrorAsJSON(const
 * CHIP_ERROR &)`), or one for a path this command itself could have asked about. An attribute value or
 * a command response says nothing about why the command failed.
 */
function accountsForFailure(result: unknown, isOwnPath: OwnPathTest) {
    if (!isObject(result) || !("error" in result)) {
        return false;
    }
    const endpoint = numberOf(result, "endpointId");
    const cluster = numberOf(result, "clusterId");
    const attribute = numberOf(result, "attributeId");
    const event = numberOf(result, "eventId");
    if (endpoint === undefined || cluster === undefined) {
        // Only a per-path status carries a whole path, so a status with less than one cannot be a
        // subscription's report and is this command's own
        return true;
    }
    // Event first, matching ChipToolControllerAdapter's own #isOwnPath, so the two never classify one
    // entry against different subscription lists
    if (event !== undefined) {
        return isOwnPath({ endpoint, cluster, event });
    }
    if (attribute !== undefined) {
        return isOwnPath({ endpoint, cluster, attribute });
    }
    return true;
}

function bigIntOf(entry: Record<string, unknown>, key: string): bigint | undefined {
    const value = entry[key];
    if (typeof value === "bigint") {
        return value;
    }
    if (typeof value === "number") {
        return BigInt(value);
    }
    return undefined;
}

function interpretReply(results: unknown[], isOwnPath: OwnPathTest): ChipReply {
    const reply: ChipReply = {
        values: new Array<ChipAttributeValue>(),
        events: new Array<ChipEventValue>(),
        responses: new Array<ChipCommandResponse>(),
        statuses: new Array<ChipPathStatus>(),
        globalStatuses: new Array<ChipGlobalStatus>(),
        commandFailed: false,
    };

    // `AsJsonString` appends the marker after everything the command recorded, so only a trailing bare
    // FAILURE is that marker: an earlier one is a status chip-tool derived from a `StatusIB`.
    const markerIndex = isExitFailureMarker(results[results.length - 1]) ? results.length - 1 : -1;

    // The marker is redundant once the reply carries the failure's own account — a wildcard read's
    // per-path statuses, say. Nothing else in a reply is such an account: chip-tool records values and
    // subscription reports into whichever frame owns its result slot, so a failed command's reply can
    // consist of the marker beside a value on a path the command itself asked about, and taking that
    // for an account would report the failure as a success.
    const accountedFor =
        markerIndex !== -1 && results.slice(0, markerIndex).some(result => accountsForFailure(result, isOwnPath));

    for (const [index, result] of results.entries()) {
        if (index === markerIndex) {
            reply.commandFailed = !accountedFor;
            continue;
        }

        if (!isObject(result)) {
            continue;
        }

        const endpoint = numberOf(result, "endpointId");
        const cluster = numberOf(result, "clusterId");
        const attribute = numberOf(result, "attributeId");
        const command = numberOf(result, "commandId");
        const event = numberOf(result, "eventId");

        if ("error" in result) {
            const status: ChipPathStatus = {
                endpoint,
                cluster,
                attribute,
                command,
                event,
                status: statusOf(result.error),
                clusterStatus: numberOf(result, "clusterError"),
            };
            if (cluster === undefined && endpoint === undefined) {
                reply.globalStatuses.push({ status: status.status, clusterStatus: status.clusterStatus });
            } else {
                reply.statuses.push(status);
            }
            continue;
        }

        if (cluster === undefined || endpoint === undefined) {
            continue;
        }

        if (command !== undefined) {
            reply.responses.push({ endpoint, cluster, command, value: result.value });
            continue;
        }

        if (event !== undefined) {
            const eventNumber = bigIntOf(result, "eventNumber");
            if (eventNumber === undefined) {
                // Reporting an invented number would let a step order events by it
                throw new UnexpectedDataError(
                    `chip-tool reported event ${hex(event)} of cluster ${hex(cluster)} on endpoint ${endpoint} ` +
                        "without an event number",
                );
            }
            reply.events.push({ endpoint, cluster, event, eventNumber, value: result.value });
            continue;
        }

        if (attribute !== undefined) {
            reply.values.push({
                endpoint,
                cluster,
                attribute,
                value: result.value,
                version: numberOf(result, "dataVersion"),
            });
        }
    }

    return reply;
}

/**
 * A subscription one node of this adapter holds. chip-tool's reports carry no subscription id and no
 * node id (`RemoteDataModelLogger::LogAttributeAsJSON`), so the paths are all there is to attribute a
 * report by: every live subscription with a path covering a report sees it.
 */
interface LiveSubscription {
    paths: AttributePathSpec[];
    onUpdate?: (entry: AttributeReadEntry) => void;
}

/** As {@link LiveSubscription}, for a subscription to events. */
interface LiveEventSubscription {
    paths: EventPathSpec[];
    onUpdate?: (event: EventReadEntry) => void;
}

interface AttributeSchema {
    cluster: ClusterModel;
    attribute: ValueModel;
}

function attributeSchemaOf(cluster: number, attribute: number): AttributeSchema | undefined {
    const clusterModel = findCertCluster(cluster);
    const attributeModel = clusterModel?.attributes(attribute);
    if (clusterModel === undefined || attributeModel === undefined) {
        return undefined;
    }
    return { cluster: clusterModel, attribute: attributeModel };
}

/** An attribute the model has no definition for (a TC writing out of model) passes through unconverted. */
function decodeAttributeValue(entry: ChipAttributeValue) {
    const schema = attributeSchemaOf(entry.cluster, entry.attribute);
    return schema === undefined ? entry.value : chipJsonToMatter(entry.value, schema.attribute, schema.cluster);
}

function encodeAttributeValue(cluster: number, attribute: number, value: unknown) {
    const schema = attributeSchemaOf(cluster, attribute);
    const wire = schema === undefined ? value : matterToChipJson(value, schema.attribute, schema.cluster, "hex");
    return stringifyChipJson(wire);
}

/** An event the model has no definition for passes through unconverted, as an attribute's value does. */
function decodeEventValue(entry: ChipEventValue) {
    const clusterModel = findCertCluster(entry.cluster);
    const eventModel = clusterModel?.events(entry.event);
    return clusterModel === undefined || eventModel === undefined
        ? entry.value
        : chipJsonToMatter(entry.value, eventModel, clusterModel);
}

function toEventEntries(events: ChipEventValue[]): EventReadEntry[] {
    return events.map(entry => ({
        endpoint: entry.endpoint,
        cluster: entry.cluster,
        event: entry.event,
        eventNumber: entry.eventNumber,
        value: decodeEventValue(entry),
    }));
}

function toReadEntries(values: ChipAttributeValue[]): AttributeReadEntry[] {
    return values.map(entry => ({
        endpoint: entry.endpoint,
        cluster: entry.cluster,
        attribute: entry.attribute,
        value: decodeAttributeValue(entry),
        version: entry.version,
    }));
}

function commandModelFor(
    cluster: string | number,
    command: string,
): { cluster: ClusterModel; clusterId: number; command: CommandModel } {
    const { model: clusterModel, id: clusterId } = certClusterModelFor(cluster);
    const commandModel = clusterModel.commands(command);
    if (commandModel?.id === undefined) {
        throw new ImplementationError(`Unknown command "${command}" on cluster ${cluster}`);
    }
    return { cluster: clusterModel, clusterId, command: commandModel };
}

function statusFor(statuses: ChipPathStatus[], path: { endpoint?: number; cluster: number; attribute: number }) {
    return statuses.find(
        status =>
            status.cluster === path.cluster &&
            status.attribute === path.attribute &&
            (path.endpoint === undefined || status.endpoint === path.endpoint),
    );
}

/**
 * {@link statusFor} for the concrete attribute paths of a request. A status on one of those is that
 * path's read having failed, where a wildcard path's statuses are per-item results of the expansion.
 */
function attributeStatusFor(statuses: ChipPathStatus[], paths: AttributePathSpec[]) {
    for (const path of paths) {
        if (path.endpoint === undefined || path.cluster === undefined || path.attribute === undefined) {
            continue;
        }
        const status = statuses.find(
            entry =>
                entry.endpoint === path.endpoint &&
                entry.cluster === path.cluster &&
                entry.attribute === path.attribute,
        );
        if (status !== undefined) {
            return { path, status };
        }
    }
    return undefined;
}

/** {@link statusFor} for the concrete event paths of a request; a wildcard path's statuses are per-item. */
function eventStatusFor(statuses: ChipPathStatus[], paths: EventPathSpec[]) {
    for (const path of paths) {
        if (path.endpoint === undefined || path.cluster === undefined || path.event === undefined) {
            continue;
        }
        const status = statuses.find(
            candidate =>
                candidate.endpoint === path.endpoint &&
                candidate.cluster === path.cluster &&
                candidate.event === path.event,
        );
        if (status !== undefined) {
            return { path, status };
        }
    }
    return undefined;
}

/**
 * A chip-tool command that failed with no interaction-model status of the device's behind it.
 * chip-tool funnels discovery, PASE, attestation, CASE, timeout and argument-parse failures alike into
 * the bare `{"error": "FAILURE"}` marker its exit status produces, and a local failure of a live
 * interaction into a pathless `Failure` indistinguishable from the device's own; reporting either as a
 * {@link StatusResponseError} would invent a status the device never sent — and let a spec-negative
 * step asserting `Failure` pass without the device ever having answered.
 */
export class ChipToolCommandError extends ControllerCommandError {}

/**
 * chip-tool's own marker for a failure raised inside its setup-payload layer, as `CHIP_ERROR`'s
 * formatter renders it: `Run command failure: src/setup_payload/<file>:<line>: …`.
 *
 * `SetupPayload::FromStringRepresentation` is where chip-tool applies § 5.1's payload rules, and this
 * location is the only thing separating "the commissioner would not use this code" from every later
 * way a commissioning fails: discovery, PASE, attestation and a command timeout all reach
 * {@link ChipToolCommandError} alike.
 */
const PAYLOAD_FAILURE = /Run command failure: src\/setup_payload\//;

/**
 * For read/write/invoke. A pathless status is one chip-tool derived from a raw `CHIP_ERROR`
 * (`RemoteDataModelLogger::LogErrorAsJSON(const CHIP_ERROR &)`, called from `ReportCommand::OnError`
 * and its write and invoke siblings), and `ClusterStatusCode(CHIP_ERROR)` maps only the error's IM
 * global-status part to that status and its IM cluster-status part to `Failure` plus a cluster code —
 * a response timeout, a send failure, a dropped session and every other local failure fall through to
 * a bare `Failure`. So only a pathless status that is not `Failure`, or one carrying a cluster code,
 * can be attributed to the device; a bare `Failure` says no more than the exit-status marker does.
 */
function assertNoFailure(reply: ChipReply, operation: string) {
    const [global] = reply.globalStatuses;
    if (global !== undefined) {
        if (codeOf(global.status, operation) !== Status.Failure || global.clusterStatus !== undefined) {
            throw deviceStatusError(global, operation, `chip-tool ${operation} failed`);
        }
        throw new ChipToolCommandError(
            `chip-tool ${operation} failed with a bare Failure, which says nothing about whether the device answered`,
        );
    }
    if (reply.commandFailed) {
        throw new ChipToolCommandError(`chip-tool ${operation} failed`);
    }
}

/** For the `pairing` family, which reports no interaction-model status of its own. */
function assertCommandSucceeded(reply: ChipReply, operation: string) {
    const [global] = reply.globalStatuses;
    if (global !== undefined) {
        throw new ChipToolCommandError(`chip-tool ${operation} failed: ${describeStatus(global.status)}`);
    }
    if (reply.commandFailed) {
        throw new ChipToolCommandError(`chip-tool ${operation} failed`);
    }
    const [status] = reply.statuses;
    if (status !== undefined) {
        throw deviceStatusError(status, operation, `chip-tool ${operation} failed`);
    }
}

function describeLoggedStatus({ status, clusterStatus }: LoggedAttributeStatus) {
    return `status ${hex(status)}${clusterStatus === undefined ? "" : ` with cluster status ${hex(clusterStatus)}`}`;
}

/**
 * The statuses of a write with a wildcard-endpoint path, from the `WriteResponseMessage` chip-tool decoded into the
 * command's own log lines (see {@link loggedWriteResponseStatuses}). chip-tool's JSON results name only the paths that
 * failed, so they cannot say which endpoints the wildcard reached and the device accepted.
 *
 * Each failure the JSON results report for a requested path must appear in the decoded message with the same code and
 * cluster status, and each concrete requested path must appear in it at all: the device answers every concrete path
 * with a status. Either one missing means the log lost lines, and the statuses would be incomplete.
 *
 * @see {@link MatterSpecification.v161.Core} § 8.7.3.2, § 8.7.3.3
 */
function loggedWriteStatuses(
    reply: ChipReply,
    logs: string[],
    paths: { endpoint?: number; cluster: number; attribute: number }[],
    operation: string,
): AttributeWriteStatus[] {
    const logged = loggedWriteResponseStatuses(logs);
    if (logged === undefined) {
        throw new UnexpectedDataError(
            `chip-tool logged no decoded WriteResponseMessage for ${operation}, so the endpoints the device wrote are ` +
                "unknown; chip-tool decodes it only in a build with CHIP_CONFIG_IM_PRETTY_PRINT and detail logging, " +
                "which a debug build has",
        );
    }

    for (const { endpoint, cluster, attribute, status, clusterStatus } of reply.statuses) {
        if (endpoint === undefined || cluster === undefined || attribute === undefined) {
            continue;
        }
        if (!paths.some(path => pathCovers(path, { endpoint, cluster, attribute }))) {
            continue;
        }
        // A list written as REPLACE plus ADDs is answered with one status per data item, all on the same path
        const listed = logged.filter(
            entry => entry.endpoint === endpoint && entry.cluster === cluster && entry.attribute === attribute,
        );
        const same = listed.some(
            entry =>
                ("code" in status ? entry.status === status.code : entry.status !== Status.Success) &&
                (clusterStatus === undefined || entry.clusterStatus === clusterStatus),
        );
        if (!same) {
            throw new UnexpectedDataError(
                `chip-tool reported ${describeStatus(status)} for endpoint ${endpoint} cluster ${hex(cluster)} ` +
                    `attribute ${hex(attribute)} of ${operation}, which its decoded WriteResponseMessage ` +
                    (listed.length === 0
                        ? "does not list"
                        : `lists as ${listed.map(entry => describeLoggedStatus(entry)).join(", ")}`),
            );
        }
    }

    for (const { endpoint, cluster, attribute } of paths) {
        if (endpoint === undefined) {
            continue;
        }
        if (!logged.some(entry => pathCovers({ endpoint, cluster, attribute }, entry))) {
            throw new UnexpectedDataError(
                `chip-tool's decoded WriteResponseMessage for ${operation} lists no status for endpoint ${endpoint} ` +
                    `cluster ${hex(cluster)} attribute ${hex(attribute)}, which the device must answer as a concrete path`,
            );
        }
    }

    return logged.map(({ endpoint, cluster, attribute, status }) => ({ endpoint, cluster, attribute, status }));
}

/** Port override for one controller role, so a test can point an adapter at a stand-in server. */
function portOverrideFor(id: string) {
    const value = env[`MATTER_CHIP_TOOL_PORT_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`];
    if (value === undefined || value === "") {
        return undefined;
    }
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 0xffff) {
        throw new ImplementationError(`Invalid chip-tool port override "${value}" for controller role "${id}"`);
    }
    return port;
}

/**
 * Sends a command to a group rather than to a node. chip-tool takes the group's destination id in
 * place of a node id, and answers nothing: a groupcast is unacknowledged, so its own reply carries no
 * status and none is awaited.
 */
class ChipToolCertGroupApi implements CertGroupApi {
    readonly #adapter: ChipToolControllerAdapter;
    readonly #groupId: number;
    readonly #groups?: readonly CertControllerGroup[];

    constructor(
        adapter: ChipToolControllerAdapter,
        groupId: number,
        groups: readonly CertControllerGroup[] | undefined,
    ) {
        this.#adapter = adapter;
        this.#groupId = groupId;
        this.#groups = groups;
    }

    /**
     * chip-tool keeps its own group state, which the commands a plan's steps send to the *device* do
     * not touch: without this its group send fails in `GroupDataProviderImpl` with "item not found".
     * `groupsettings` is how its commissioner is told about a group and its key, and the three
     * commands together are what `defineKeySet` means on this controller.
     */
    async defineKeySet(keySet: GroupKeySetSpec): Promise<void> {
        const { addressPolicy } = assertDeclaredKeySet(this.#adapter.id, this.#groups, this.#groupId, keySet);

        const group = `${this.#groupId}`;
        const keySetId = `${keySet.groupKeySetId}`;

        // Each reply is checked: `execute` decodes chip-tool's answer rather than throwing on it, and a
        // provisioning step that silently did nothing surfaces much later as a groupcast that seems
        // never to have arrived
        assertCommandSucceeded(
            await this.#adapter.execute(
                // Without the flag chip-tool sends to the per-group address; 0 is `MulticastAddrPolicyEnum.IanaAddr`
                `groupsettings add-group group${group} ${group}${addressPolicy === "ianaAddr" ? " --addressPolicy 0" : ""}`,
            ),
            "groupsettings add-group",
        );
        assertCommandSucceeded(
            await this.#adapter.execute(
                // Validity 0: the key is current from now, which is what the plan's own epoch start means
                `groupsettings add-keysets ${keySetId} ${keySet.groupKeySecurityPolicy} 0 ` +
                    `hex:${Bytes.toHex(keySet.epochKey0)}`,
            ),
            "groupsettings add-keysets",
        );
        assertCommandSucceeded(
            await this.#adapter.execute(`groupsettings bind-keyset ${group} ${keySetId}`),
            "groupsettings bind-keyset",
        );
    }

    async invoke(cluster: string | number, command: string, args?: object): Promise<void> {
        declaredGroup(this.#adapter.id, this.#groups, this.#groupId);
        const { cluster: clusterModel, clusterId, command: commandModel } = commandModelFor(cluster, command);
        const fields =
            args !== undefined && Object.keys(args).length > 0
                ? stringifyChipJson(matterToChipJson(args, commandModel, clusterModel, "hex"))
                : "{}";

        const reply = await this.#adapter.execute(
            `any command-by-id ${hex(clusterId)} ${hex(commandModel.id)} ${quoteArg(fields)} ` +
                // chip-tool wants an endpoint argument even for a group command, which carries none;
                // 0 is what its own group tests pass
                // No large-payload flag: a groupcast is UDP multicast, so the TCP preference a
                // transport option expresses cannot apply to it
                `${groupDestination(this.#groupId)} 0`,
        );

        assertNoFailure(reply, `group invoke ${clusterModel.name}.${commandModel.name}`);
    }
}

class ChipToolCertNodeApi implements CertNodeApi {
    readonly #adapter: ChipToolControllerAdapter;
    readonly #nodeId: NodeId;

    constructor(adapter: ChipToolControllerAdapter, ref: CertNodeRef) {
        this.#adapter = adapter;
        this.#nodeId = NodeId(ref);
    }

    get #node() {
        return this.#nodeId.toString();
    }

    async invoke(
        cluster: string | number,
        command: string,
        args?: object,
        endpoint = 0,
        options?: TimedInteractionOptions,
    ): Promise<unknown> {
        const { cluster: clusterModel, clusterId, command: commandModel } = commandModelFor(cluster, command);
        const fields =
            args !== undefined && Object.keys(args).length > 0
                ? stringifyChipJson(matterToChipJson(args, commandModel, clusterModel, "hex"))
                : "{}";

        const reply = await this.#adapter.execute(
            `any command-by-id ${hex(clusterId)} ${hex(commandModel.id)} ${quoteArg(fields)} ` +
                `${this.#node} ${endpoint}${timedArg(options)}${largePayloadArg(this.#adapter.transport)}`,
        );

        const operation = `invoke ${clusterModel.name}.${commandModel.name}`;
        assertNoFailure(reply, operation);
        const [status] = reply.statuses;
        if (status !== undefined) {
            throw deviceStatusError(status, operation);
        }

        const [response] = reply.responses;
        if (response === undefined) {
            return undefined;
        }

        const responseModel = commandModel.responseModel;
        return responseModel === undefined
            ? response.value
            : chipJsonToMatter(response.value, responseModel, clusterModel);
    }

    icdClient(): never {
        throw refusal("icd-client", "icdClient");
    }

    async serveOtaUpdate(): Promise<never> {
        throw refusal("ota-provider", "serveOtaUpdate");
    }

    /**
     * Announcing another node is a plain `AnnounceOTAProvider` invoke, sent through chip-tool's typed
     * `otasoftwareupdaterequestor announce-otaprovider`. The provider's endpoint is the lowest one whose ServerList
     * carries the provider cluster. The VendorID is chip-tool's own: chip-tool sets its commissioner vendor id as the
     * AdminVendorId of every node it commissions, so this node's fabric entry is where it is read.
     *
     * chip-tool hosts no provider, so announcing the controller itself is refused as `ota-provider-script`.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.20.7.6
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
            endpoint: await endpointServing(this.#adapter.node(provider), provider, OtaSoftwareUpdateProvider.id),
        };
        const requestorEndpoint = await endpointServing(this, this.#node, OtaSoftwareUpdateRequestor.id);

        const reply = await this.#adapter.execute(
            `otasoftwareupdaterequestor announce-otaprovider ${NodeId(announcement.providerNodeId)} ` +
                `${announcement.vendorId} ${announcement.announcementReason} ${announcement.endpoint} ` +
                `${this.#node} ${requestorEndpoint}${largePayloadArg(this.#adapter.transport)}`,
        );

        const operation = "invoke OtaSoftwareUpdateRequestor.AnnounceOtaProvider";
        assertNoFailure(reply, operation);
        // A subscription report riding along in the reply carries attribute or event statuses, never a command's
        const status = reply.statuses.find(({ command }) => command !== undefined);
        if (status !== undefined) {
            throw deviceStatusError(status, operation);
        }

        return {
            announcement,
            exchanges: { queryImage: [], applyUpdate: [], notifyUpdateApplied: [] },
            observedMs: 0,
        };
    }

    async #adminVendorId(): Promise<number> {
        const { vendorId } = accessingFabricOf(
            await this.readAttribute(FABRICS, { fabricFiltered: true }),
            this.#nodeId,
        );
        if (typeof vendorId !== "number") {
            throw new UnexpectedDataError(
                `Node ${this.#node} reported its fabric entry for this controller without a vendor id`,
            );
        }
        return vendorId;
    }

    async scriptOtaProvider(): Promise<never> {
        throw refusal("ota-provider-script", "scriptOtaProvider");
    }

    async invokeBatch(commands: BatchCommandSpec[]): Promise<BatchCommandResult[]> {
        throw refusal("batch-invoke", `invokeBatch of ${commands.length} commands`);
    }

    async readAttribute(path: AttributePathSpec, options?: ReadAttributeOptions): Promise<unknown> {
        const reply = await this.#read([path], options);
        assertNoFailure(reply, `read ${JSON.stringify(path)}`);

        const { endpoint, cluster, attribute } = path;
        if (endpoint !== undefined && cluster !== undefined && attribute !== undefined) {
            // Matched against the requested path, not taken positionally: a live subscription's report
            // lands in a concurrent command's own results (see ChipToolClient), so index 0 is not
            // necessarily this read's answer.
            const status = statusFor(reply.statuses, { endpoint, cluster, attribute });
            if (status !== undefined) {
                throw deviceStatusError(status, "readAttribute", `readAttribute ${JSON.stringify(path)} failed`);
            }
            const value = reply.values.find(
                entry => entry.endpoint === endpoint && entry.cluster === cluster && entry.attribute === attribute,
            );
            if (value === undefined) {
                throw new InternalError(`readAttribute ${JSON.stringify(path)} returned no data`);
            }
            return decodeAttributeValue(value);
        }

        // A wildcard expansion legitimately mixes data with per-item statuses, so unlike a concrete
        // path's status those are not themselves a read failure.
        return toReadEntries(reply.values);
    }

    async readAttributes(paths: AttributePathSpec[], options?: ReadAttributeOptions): Promise<AttributeReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("readAttributes requires at least one path");
        }
        if (paths.length > MAX_PATHS_PER_COMMAND) {
            throw refusal("many-paths-per-request", `readAttributes of ${paths.length} paths`);
        }

        const reply = await this.#read(paths, options);
        assertNoFailure(reply, `read ${JSON.stringify(paths)}`);

        const refused = attributeStatusFor(reply.statuses, paths);
        if (refused !== undefined) {
            throw deviceStatusError(
                refused.status,
                "readAttributes",
                `readAttributes ${JSON.stringify(refused.path)} failed`,
            );
        }

        return toReadEntries(reply.values);
    }

    async writeAttribute(path: AttributePathSpec, value: unknown, options?: TimedInteractionOptions): Promise<void> {
        const { endpoint, cluster, attribute } = path;
        if (endpoint === undefined || cluster === undefined || attribute === undefined) {
            throw new ImplementationError("writeAttribute requires a concrete endpoint/cluster/attribute path");
        }

        const { reply } = await this.#write([{ path, value }], "writeAttribute", options);
        assertNoFailure(reply, `write ${JSON.stringify(path)}`);

        const status = statusFor(reply.statuses, { endpoint, cluster, attribute });
        if (status !== undefined) {
            throw deviceStatusError(status, "writeAttribute", `writeAttribute ${JSON.stringify(path)} failed`);
        }
    }

    async writeAttributes(entries: AttributeWriteEntry[]): Promise<AttributeWriteStatus[]> {
        if (entries.length === 0) {
            throw new ImplementationError("writeAttributes requires at least one attribute");
        }
        if (entries.length > MAX_PATHS_PER_COMMAND) {
            throw refusal("many-paths-per-request", `writeAttributes of ${entries.length} attributes`);
        }

        const paths = entries.map(({ path: { endpoint, cluster, attribute } }) => {
            if (cluster === undefined || attribute === undefined) {
                throw new ImplementationError("writeAttributes requires a concrete cluster and attribute");
            }
            return { endpoint, cluster, attribute };
        });

        const versionedWildcard = entries.find(
            ({ path, dataVersion }) => path.endpoint === undefined && dataVersion !== undefined,
        );
        if (versionedWildcard !== undefined) {
            throw new ImplementationError(
                `writeAttributes of ${JSON.stringify(versionedWildcard.path)} with a data version needs a concrete ` +
                    "endpoint: a data version applies to one cluster instance",
            );
        }

        const versioned = entries.filter(({ dataVersion }) => dataVersion !== undefined);
        if (versioned.length !== 0 && versioned.length !== entries.length) {
            throw refusal("mixed-version-write", "writeAttributes with a data version on some entries only");
        }

        const { reply, logs } = await this.#write(entries, "writeAttributes");
        const operation = `write ${JSON.stringify(entries.map(({ path }) => path))}`;
        assertNoFailure(reply, operation);

        const concretePaths = paths.flatMap(({ endpoint, cluster, attribute }) =>
            endpoint === undefined ? [] : [{ endpoint, cluster, attribute }],
        );
        if (concretePaths.length !== paths.length) {
            return loggedWriteStatuses(reply, logs, paths, operation);
        }

        return concretePaths.map(path => {
            const status = statusFor(reply.statuses, path);
            return {
                ...path,
                // Absence of a status for a concrete path is chip-tool's only signal that the device
                // accepted the write (Matter Core § 8.7.3.2 and § 8.7.3.3 require a status per concrete path).
                status:
                    status === undefined
                        ? Status.Success
                        : codeOf(status.status, `writeAttributes ${JSON.stringify(path)}`),
            };
        });
    }

    /**
     * Subscribes through `any subscribe-by-id`, which chip-tool answers once the subscription is
     * established, with the priming report's values in that command's own results. Those values are
     * this call's return value; every report after them reaches `opts.onUpdate`.
     *
     * Two properties of chip-tool's single result slot bound what a step may conclude from the
     * callbacks. A report chip-tool records between answering the previous one and this adapter's next
     * parked frame is discarded before anything sees it, and a read of a subscribed path delivers its
     * own value to `onUpdate` as well. Assert on the values, not on how many arrived: every report's
     * decoded value reaches the controller log regardless, which is lossless.
     */
    async subscribe(path: AttributePathSpec, opts: SubscribeOptions): Promise<unknown> {
        const { onUpdate } = opts;
        const reply = await this.#adapter.subscribe("subscribe", this.#node, [path], {
            ...opts,
            onUpdate: onUpdate && (entry => onUpdate(entry.value)),
        });

        const seed = reply.values.filter(entry => pathCovers(path, entry));
        if (path.endpoint !== undefined && path.cluster !== undefined && path.attribute !== undefined) {
            return seed.length === 0 ? undefined : decodeAttributeValue(seed[0]);
        }
        return toReadEntries(seed);
    }

    /** {@link subscribe} for several paths in one `any subscribe-by-id`, with the same bounds on the callbacks. */
    async subscribeAttributes(
        paths: AttributePathSpec[],
        opts: SubscribeAttributesOptions,
    ): Promise<AttributeReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("subscribeAttributes requires at least one path");
        }
        if (paths.length > MAX_PATHS_PER_COMMAND) {
            throw refusal("many-paths-per-request", `subscribeAttributes of ${paths.length} paths`);
        }

        const reply = await this.#adapter.subscribe("subscribeAttributes", this.#node, paths, opts);
        return toReadEntries(reply.values.filter(entry => paths.some(path => pathCovers(path, entry))));
    }

    /**
     * Reads through `any read-event-by-id`.
     *
     * chip-tool's reports carry no subscription id and no node id, so an event a live subscription
     * covers cannot be told from one this read asked for: a report chip-tool records into this
     * command's result slot is returned here as well as delivered to that subscription's `onUpdate`.
     * Assert on the events, not on how many arrived.
     */
    async readEvents(paths: EventPathSpec[], options?: ReadEventOptions): Promise<EventReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("readEvents requires at least one path");
        }
        if (paths.length > MAX_PATHS_PER_COMMAND) {
            throw refusal("many-paths-per-request", `readEvents of ${paths.length} paths`);
        }

        // chip-tool zips its cluster/event/endpoint id lists element-wise, as it does for attributes
        let command =
            `any read-event-by-id ${paths.map(eventClusterArg).join(",")} ${paths.map(eventArg).join(",")} ` +
            `${this.#node} ${paths.map(eventEndpointArg).join(",")}${largePayloadArg(this.#adapter.transport)}`;
        if (options?.fabricFiltered === false) {
            command += " --fabric-filtered false";
        }
        if (options?.minEventNumber !== undefined) {
            command += ` --event-min ${options.minEventNumber}`;
        }

        const reply = await this.#adapter.execute(command, { events: paths });
        assertNoFailure(reply, `readEvents ${JSON.stringify(paths)}`);

        const refused = eventStatusFor(reply.statuses, paths);
        if (refused !== undefined) {
            throw deviceStatusError(refused.status, "readEvents", `readEvents ${JSON.stringify(refused.path)} failed`);
        }

        return toEventEntries(reply.events.filter(entry => paths.some(path => eventPathCovers(path, entry))));
    }

    async observeEvents(_paths: EventPathSpec[], _opts: ObserveEventOptions): Promise<EventReadEntry[]> {
        throw refusal("sustained-subscription", "observeEvents");
    }

    /**
     * Subscribes through `any subscribe-event-by-id`; the events chip-tool recorded into the
     * establishing command's own reply are the priming report and this call's return value, and every
     * report after them reaches `opts.onUpdate` — the same single-result-slot caveats
     * {@link ChipToolCertNodeApi.subscribe} documents apply.
     *
     * A subscription is attributed by event path alone, since chip-tool's reports carry no node id:
     * two nodes of one adapter subscribed to the same path each see the other's reports.
     */
    async subscribeEvents(paths: EventPathSpec[], opts: SubscribeEventOptions): Promise<EventReadEntry[]> {
        if (paths.length === 0) {
            throw new ImplementationError("subscribeEvents requires at least one path");
        }
        if (paths.length > MAX_PATHS_PER_COMMAND) {
            throw refusal("many-paths-per-request", `subscribeEvents of ${paths.length} paths`);
        }

        const reply = await this.#adapter.subscribeEvents(this.#node, paths, opts);
        return toEventEntries(reply.events.filter(entry => paths.some(path => eventPathCovers(path, entry))));
    }

    async clientEndpoints(): Promise<ClientEndpointEntry[]> {
        throw refusal("sustained-subscription", "the endpoints the controller holds for a node");
    }

    async clientAttribute(_path: ClientAttributePath): Promise<unknown> {
        throw refusal("sustained-subscription", "the value the controller holds for an attribute");
    }

    async sessions(): Promise<never> {
        throw refusal("session-introspection", "the sessions the controller holds with a node");
    }

    async severTransportConnection(_sessionId: number): Promise<never> {
        throw refusal("session-introspection", "severing the connection beneath a session");
    }

    async openCommissioningWindow(opts: {
        timeout: number;
        enhanced: boolean;
    }): Promise<{ manualPairingCode?: string; qrPairingCode?: string }> {
        // chip-tool ignores iteration and discriminator for a basic window
        // (`OpenCommissioningWindowCommand.h`), so a basic window must not consume one
        const discriminator = opts.enhanced ? this.#adapter.mintDiscriminator() : 0;
        const reply = await this.#adapter.executeWithLogs(
            `pairing open-commissioning-window ${this.#node} ${opts.enhanced ? 1 : 0} ${opts.timeout} ` +
                `${PBKDF_ITERATIONS} ${discriminator}`,
        );
        assertCommandSucceeded(reply.reply, "openCommissioningWindow");

        if (!opts.enhanced) {
            return {};
        }

        const manualPairingCode = matchLog(reply.logs, /Manual pairing code:\s*\[([^\]]+)\]/);
        const qrPairingCode = matchLog(reply.logs, /SetupQRCode:\s*\[([^\]]+)\]/);
        if (manualPairingCode === undefined && qrPairingCode === undefined) {
            throw new InternalError(
                "chip-tool opened an enhanced commissioning window but logged neither " +
                    '"Manual pairing code: [...]" nor "SetupQRCode: [...]", so the window\'s freshly generated ' +
                    "passcode is unknown; commissioning through it would silently use the device's original " +
                    `setup code instead. Reply logs: ${JSON.stringify(reply.logs)}`,
            );
        }

        return { manualPairingCode, qrPairingCode };
    }

    async decommission(): Promise<void> {
        const reply = await this.#adapter.execute(`pairing unpair ${this.#node}`);
        assertCommandSucceeded(reply, `decommission of node ${this.#node}`);
    }

    async operationalMdnsInstanceName(): Promise<string> {
        return getOperationalDeviceQname(await this.#adapter.globalFabricId(this.#nodeId), this.#nodeId);
    }

    #read(paths: AttributePathSpec[], options?: ReadAttributeOptions) {
        if (options?.largeMessage) {
            throw refusal("tcp-transport", "a read that requires a session permitting large payloads");
        }

        // chip-tool zips the three id lists into paths when their lengths match
        // (`InteractionModelConfig::GetAttributePaths`), so equal-length lists express any path set.
        let command =
            `any read-by-id ${paths.map(clusterArg).join(",")} ${paths.map(attributeArg).join(",")} ` +
            `${this.#node} ${paths.map(endpointArg).join(",")}${largePayloadArg(this.#adapter.transport)}`;
        if (options?.fabricFiltered === false) {
            command += " --fabric-filtered false";
        }
        return this.#adapter.execute(command, { attributes: paths });
    }

    #write(entries: AttributeWriteEntry[], operation: string, options?: TimedInteractionOptions) {
        for (const entry of entries) {
            const typed = typedListWriteFor(entry.path);
            if (typed === undefined) {
                continue;
            }
            if (entries.length !== 1) {
                throw refusal(
                    "typed-list-write-with-others",
                    `${operation} of ${typed.command} with ${entries.length - 1} other entries`,
                );
            }
            return this.#writeTypedList(typed, entry, options);
        }

        const values = entries.map(({ path: { cluster, endpoint, attribute }, value }) => {
            if (cluster === undefined || attribute === undefined) {
                throw new ImplementationError(`${operation} requires a concrete cluster and attribute`);
            }
            const encoded = encodeAttributeValue(cluster, attribute, value);
            if (encoded.includes(";")) {
                throw new ImplementationError(
                    `${operation} of ${JSON.stringify(encoded)} (endpoint ${endpoint}, cluster ${cluster}, ` +
                        `attribute ${attribute}): chip-tool splits attribute values on ";", so a step writing ` +
                        "through it needs a value without one",
                );
            }
            return encoded;
        });

        let command =
            `any write-by-id ${entries.map(({ path }) => clusterArg(path)).join(",")} ` +
            `${entries.map(({ path }) => attributeArg(path)).join(",")} ${quoteArg(values.join(";"))} ` +
            `${this.#node} ${entries.map(({ path }) => endpointArg(path)).join(",")}`;

        const versions = entries.map(({ dataVersion }) => dataVersion).filter(version => version !== undefined);
        if (versions.length) {
            command += ` --data-version ${versions.join(",")}`;
        }
        command += timedArg(options);
        command += largePayloadArg(this.#adapter.transport);

        return this.#adapter.executeWithLogs(command, { attributes: entries.map(({ path }) => path) });
    }

    #writeTypedList(
        typed: TypedListWrite,
        { path, value, dataVersion }: AttributeWriteEntry,
        options?: TimedInteractionOptions,
    ) {
        const command =
            `${typed.command} ${quoteArg(encodeTypedList(typed, value))} ${this.#node} ${endpointArg(path)}` +
            (dataVersion === undefined ? "" : ` --data-version ${dataVersion}`) +
            timedArg(options) +
            largePayloadArg(this.#adapter.transport);
        return this.#adapter.executeWithLogs(command, { attributes: [path] });
    }
}

/**
 * One field of chip-tool's own `payload parse-setup-payload` output. Absent means chip-tool parsed the
 * payload into something other than what a QR code carries — a manual code's short discriminator, say —
 * which no caller can act on, so it is an error rather than a hole in the returned fields.
 */
function payloadField(logs: string[], code: string, pattern: RegExp, radix = 10): number {
    const value = matchLog(logs, pattern);
    if (value === undefined) {
        throw new InternalError(
            `chip-tool parsed onboarding payload ${code} without logging ${pattern}. Reply logs: ` +
                JSON.stringify(logs),
        );
    }
    return Number.parseInt(value, radix);
}

function matchLog(logs: string[], pattern: RegExp) {
    for (const line of logs) {
        const match = pattern.exec(line);
        if (match !== null) {
            return match[1];
        }
    }
    return undefined;
}

/**
 * Drives a `chip-tool interactive server` child process as a cert-test {@link ControllerAdapter}, so
 * every test case the suite defines gets a second, independent controller-side data point.
 *
 * Each instance owns its own chip-tool process, storage directory (hence its own CA key and fabric)
 * and commissioner name, so several controller roles in one run never share fabric state.
 *
 * Operations chip-tool cannot express throw {@link UnsupportedByControllerError} naming a capability in
 * {@link CHIP_TOOL_CAPABILITY_GAPS}, such as `batch-invoke` (chip-tool sends one command per invoke request)
 * and `many-paths-per-request`. A step that needs one declares it and is skipped before it
 * runs; a refusal that reaches the step runner is a framework error. A capability asked of the whole
 * adapter rather than of a step — `webRtcRequestor` — throws the same error from the constructor, where
 * no step is running to record anything, so a case asking for one selects its controller itself.
 *
 * While a subscription is live the adapter runs a report pump: chip-tool records nothing while its
 * result slot is disarmed, so the client keeps an async-report frame parked whenever no command needs
 * the slot, and each report is demultiplexed by path — see {@link ChipToolCertNodeApi.subscribe} for
 * what that costs.
 */
export class ChipToolControllerAdapter implements ControllerAdapter {
    readonly id: string;
    readonly log: LogFollower;

    readonly #logStream = new LineQueue();
    readonly #subscriptions = new Array<LiveSubscription>();
    readonly #eventSubscriptions = new Array<LiveEventSubscription>();
    readonly #commissionerName: ChipToolCommissionerName;
    readonly #transport?: ControllerTransport;
    readonly #groups?: readonly CertControllerGroup[];
    #storageDirectory?: string;
    #client?: ChipToolClient;
    #nextNodeId = FIRST_NODE_ID;
    #nextDiscriminator = 0;
    readonly #globalFabricIds = new Map<string, Promise<GlobalFabricId>>();
    #closed = false;

    constructor(id: string, options?: ControllerAdapterOptions) {
        if (options?.attestation) {
            throw refusal("attestation", "judging device attestation against installed revocation information", id);
        }

        if (options?.webRtcRequestor) {
            throw refusal("webrtc-requestor", "hosting a WebRTC transport requestor cluster", id);
        }

        const commissionerName = COMMISSIONER_NAMES.find(name => !claimedCommissioners.has(name));
        if (commissionerName === undefined) {
            throw new InternalError(
                `This adapter runs as one of the commissioner identities ${COMMISSIONER_NAMES.join(", ")} and all ` +
                    `are held by live adapters (${[...claimedCommissioners.values()]
                        .map(held => held.id)
                        .join(", ")}); close one before building "${id}"`,
            );
        }

        this.id = id;
        this.#transport = options?.transport;
        validateControllerGroups(id, options?.groups);
        this.#groups = options?.groups;
        this.#commissionerName = commissionerName;
        claimedCommissioners.set(commissionerName, this);
        this.log = new LogFollower(this.#logStream.follow(), id);
    }

    /**
     * The transport this adapter's test *asked* for, which each model command states per invocation.
     * Not what the sessions do: chip-tool keeps using the session commissioning established, so this
     * reads `"tcp"` while the interactions still travel over that UDP session.
     */
    get transport() {
        return this.#transport;
    }

    /** The commissioner identity this adapter's chip-tool process was launched with. */
    get commissionerName() {
        return this.#commissionerName;
    }

    /** The per-instance KVS directory chip-tool runs against, from {@link start} until {@link close}. */
    get storageDirectory() {
        return this.#storageDirectory;
    }

    async start(): Promise<void> {
        if (this.#closed) {
            throw new ImplementationError(`Controller adapter "${this.id}" was closed and cannot be restarted`);
        }
        if (this.#client !== undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was already started`);
        }

        // The commissioner name is released here rather than only in close(), so a caller that abandons
        // an adapter whose start() threw does not strand one of the three names for the whole process.
        // The storage directory is not: close() owns it, and it may hold evidence of why start() failed.
        try {
            const binaryPath = await resolveChipToolBinary();
            this.#storageDirectory = await mkdtemp(join(tmpdir(), `matter-cert-chip-tool-${this.id}-`));

            const client = new ChipToolClient({
                binaryPath,
                storageDirectory: this.#storageDirectory,
                commissionerName: this.#commissionerName,
                port: portOverrideFor(this.id),
                onLog: line => this.#logStream.push(line),
                onAsyncResult: entry => this.#onAsyncResult(entry),
            });
            this.#client = client;

            await client.start();
        } catch (e) {
            this.#releaseCommissionerName();
            throw e;
        }
    }

    async close(): Promise<void> {
        this.#closed = true;
        try {
            await this.#client?.close();
        } finally {
            this.#releaseCommissionerName();
            const storageDirectory = this.#storageDirectory;
            this.#storageDirectory = undefined;
            try {
                if (storageDirectory !== undefined) {
                    await rm(storageDirectory, { recursive: true, force: true });
                }
            } finally {
                this.#logStream.close();
            }
        }
    }

    async parseQrPayload(code: string): Promise<OnboardingPayloadFields> {
        const { reply, logs } = await this.executeWithLogs(`payload parse-setup-payload ${quoteArg(code)}`);
        assertCommandSucceeded(reply, `parse of onboarding payload ${code}`);

        return {
            version: payloadField(logs, code, /Version:\s+(\d+)/),
            // chip-tool prints 0 for an identifier the payload states nothing about
            vendorId: statedIdentifier(payloadField(logs, code, /VendorID:\s+(\d+)/)),
            productId: statedIdentifier(payloadField(logs, code, /ProductID:\s+(\d+)/)),
            flowType: payloadField(logs, code, /Custom flow:\s+(\d+)/),
            discoveryCapabilities: payloadField(logs, code, /Discovery Bitmask:\s+0x([0-9A-Fa-f]{2})/, 16),
            discriminator: payloadField(logs, code, /Long discriminator:\s+(\d+)/),
            passcode: payloadField(logs, code, /Passcode:\s+(\d+)/),
        };
    }

    async parseManualPairingCode(code: string): Promise<ManualPairingCodeFields> {
        const { reply, logs } = await this.executeWithLogs(`payload parse-setup-payload ${quoteArg(code)}`);
        assertCommandSucceeded(reply, `parse of manual pairing code ${code}`);

        const digits = code.replace(/\D/g, "");
        // Print() reports a vendor and product of 0 for a code that carries neither, which only the
        // 21-digit form does (§ 5.1.4.1 Table 64)
        const carriesIdentity = digits.length === MANUAL_CODE_LONG_LENGTH;

        return {
            shortDiscriminator: payloadField(logs, code, /Short discriminator:\s+(\d+)/),
            passcode: payloadField(logs, code, /Passcode:\s+(\d+)/),
            vendorId: carriesIdentity ? payloadField(logs, code, /VendorID:\s+(\d+)/) : undefined,
            productId: carriesIdentity ? payloadField(logs, code, /ProductID:\s+(\d+)/) : undefined,
        };
    }

    async commission(target: CommissioningTarget): Promise<CertNodeRef> {
        const nodeId = NodeId(this.#nextNodeId++);
        const node = nodeId.toString();

        if (target.giveUpAfterMs !== undefined) {
            // Said out loud because a step asking for this is asserting an outcome, and chip-tool's own give-up is
            // what decides it.
            console.warn(
                `chip-tool cannot bound discovery for node ${node}; its own policy decides when it stops looking`,
            );
        }

        let command: string;
        if (target.qrPairingCode) {
            // `pairing code` reads either payload format, a concatenated one included — and would pair
            // with whichever commissionee that names first, which is what this refuses. Everything else
            // the payload can get wrong is chip-tool's own to refuse.
            assertSingleQrPayload(target.qrPairingCode);
            command = `pairing code ${node} ${quoteArg(target.qrPairingCode)}`;
        } else if (target.manualPairingCode !== undefined) {
            command = `pairing code ${node} ${quoteArg(target.manualPairingCode)}`;
        } else if (target.passcode !== undefined && target.discriminator !== undefined) {
            command = `pairing onnetwork-long ${node} ${target.passcode} ${target.discriminator}`;
        } else {
            throw new ImplementationError(
                "commission() requires a target.qrPairingCode, a target.manualPairingCode, or both target.passcode " +
                    "and target.discriminator",
            );
        }

        const { reply, logs } = await this.executeWithLogs(command);
        if (reply.commandFailed && logs.some(line => PAYLOAD_FAILURE.test(line))) {
            const detail = logs.find(line => PAYLOAD_FAILURE.test(line))?.trim();
            throw new OnboardingPayloadRefusedError(
                `chip-tool refused the onboarding payload for node ${node}: ${detail}`,
            );
        }
        assertCommandSucceeded(reply, `commissioning of node ${node}`);

        return node;
    }

    node(ref: CertNodeRef): CertNodeApi {
        return new ChipToolCertNodeApi(this, ref);
    }

    group(groupId: number): CertGroupApi {
        return new ChipToolCertGroupApi(this, groupId, this.#groups);
    }

    /**
     * Subscribes `node` to `path` and starts forwarding its reports, returning the establishing reply
     * so the caller can take the priming values out of it.
     */
    async subscribe(
        operation: string,
        node: string,
        paths: AttributePathSpec[],
        opts: SubscribeAttributesOptions,
    ): Promise<ChipReply> {
        // chip-tool defaults keepSubscriptions to false, which has the device drop every earlier
        // subscription of this controller, and a case's steps rely on theirs staying live. The id lists
        // zip into paths as in a read.
        const reply = await this.execute(
            `any subscribe-by-id ${paths.map(clusterArg).join(",")} ${paths.map(attributeArg).join(",")} ` +
                `${opts.minIntervalFloorSeconds} ${opts.maxIntervalCeilingSeconds} ${node} ` +
                `${paths.map(endpointArg).join(",")} --keepSubscriptions true${largePayloadArg(this.#transport)}`,
            { attributes: paths },
        );
        const described = JSON.stringify(paths.length === 1 ? paths[0] : paths);
        assertNoFailure(reply, `${operation} ${described}`);

        // A concrete path's status is the device refusing this subscription itself; a wildcard's
        // statuses are per-item, as in a read, and leave the subscription established.
        const refused = attributeStatusFor(reply.statuses, paths);
        if (refused !== undefined) {
            throw deviceStatusError(refused.status, operation, `${operation} ${JSON.stringify(refused.path)} failed`);
        }

        // Registering only now is what draws the seeding boundary: the priming values chip-tool
        // recorded into this reply were dispatched while no subscription claimed these paths, so they
        // are the caller's return value and every report after them is an update.
        this.#subscriptions.push({ paths, onUpdate: opts.onUpdate });
        this.#requireClient().armReports();

        return reply;
    }

    /** {@link subscribe} for events. */
    async subscribeEvents(node: string, paths: EventPathSpec[], opts: SubscribeEventOptions): Promise<ChipReply> {
        let command =
            `any subscribe-event-by-id ${paths.map(eventClusterArg).join(",")} ${paths.map(eventArg).join(",")} ` +
            `${opts.minIntervalFloorSeconds} ${opts.maxIntervalCeilingSeconds} ${node} ` +
            `${paths.map(eventEndpointArg).join(",")} --keepSubscriptions true${largePayloadArg(this.#transport)}`;
        if (opts.urgent) {
            command += ` --is-urgent ${paths.map(() => "true").join(",")}`;
        }
        if (opts.fabricFiltered === false) {
            command += " --fabric-filtered false";
        }
        if (opts.minEventNumber !== undefined) {
            command += ` --event-min ${opts.minEventNumber}`;
        }

        const reply = await this.execute(command, { events: paths });
        assertNoFailure(reply, `subscribeEvents ${JSON.stringify(paths)}`);

        // A refused concrete path leaves the subscription established on the device, which nothing
        // here can revoke; not registering it is what keeps its reports away from the `onUpdate` of a
        // step that has already failed on this rejection. They reach the controller log instead.
        const refused = eventStatusFor(reply.statuses, paths);
        if (refused !== undefined) {
            throw deviceStatusError(
                refused.status,
                "subscribeEvents",
                `subscribeEvents ${JSON.stringify(refused.path)} failed`,
            );
        }

        this.#eventSubscriptions.push({ paths, onUpdate: opts.onUpdate });
        this.#requireClient().armReports();

        return reply;
    }

    /**
     * The compressed fabric id `node` computes for the fabric this adapter's own session runs on — the
     * same value matter.js's `Fabric` derives, so the two controllers' instance names agree.
     *
     * Read from the node rather than derived from this adapter's commissioner name: chip-tool's
     * `GetIdentity` takes the name from the command being run and falls back to `alpha`
     * (`examples/chip-tool/commands/common/CHIPCommand.cpp`), so the name a role was launched under
     * says nothing about the fabric a later command acts on. What the node reports does.
     *
     * Memoized per node: the fabric of a commissioned node cannot change, but one adapter holds
     * several nodes and each read is a separate node's answer. The in-flight promise is what's cached,
     * so two callers asking at once share one read.
     */
    globalFabricId(node: NodeId): Promise<GlobalFabricId> {
        const key = node.toString();
        const memoized = this.#globalFabricIds.get(key);
        if (memoized !== undefined) {
            return memoized;
        }

        const pending = this.#readGlobalFabricId(node).catch(e => {
            // A rejected promise must not be the cached answer for the rest of the run
            if (this.#globalFabricIds.get(key) === pending) {
                this.#globalFabricIds.delete(key);
            }
            throw e;
        });
        this.#globalFabricIds.set(key, pending);
        return pending;
    }

    async #readGlobalFabricId(node: NodeId): Promise<GlobalFabricId> {
        const fabrics = await this.node(node.toString()).readAttribute(FABRICS, { fabricFiltered: true });
        const { rootPublicKey, fabricId } = fabricIdentityOf(fabrics, node);
        return GlobalFabricId.compute(Environment.default.get(Crypto), fabricId, rootPublicKey);
    }

    #releaseCommissionerName() {
        // Identity-checked: a second close() must not release a name a later adapter has claimed
        if (claimedCommissioners.get(this.#commissionerName) === this) {
            claimedCommissioners.delete(this.#commissionerName);
        }
    }

    /**
     * Sends one chip-tool command line and interprets its `results`.
     *
     * `requested` names the paths the command itself asked about, which is what tells an entry the
     * command produced from a report that merely rode along in its reply.
     */
    async execute(command: string, requested?: RequestedPaths): Promise<ChipReply> {
        return (await this.executeWithLogs(command, requested)).reply;
    }

    /** As {@link execute}, plus the reply's own decoded log lines for a command that answers only in logs. */
    async executeWithLogs(command: string, requested?: RequestedPaths): Promise<{ reply: ChipReply; logs: string[] }> {
        const result = await this.#requireClient().execute(command);
        const reply = interpretReply(result.results, path => this.#isOwnPath(path, requested));
        this.#dispatchReports(reply.values);
        this.#dispatchEventReports(reply.events);
        return { reply, logs: result.logs };
    }

    /**
     * Whether the command that just ran could itself have produced an entry for `path`: it asked about
     * that path, or no live subscription covers it. A path the command asked about stays its own
     * however many subscriptions happen to cover it too — otherwise a step that subscribes and then
     * writes the same attribute could never see the status the device answered its write with.
     */
    #isOwnPath(path: ReportedPath, requested?: RequestedPaths) {
        if (path.event !== undefined) {
            const entry = { endpoint: path.endpoint, cluster: path.cluster, event: path.event };
            if (requested?.events?.some(candidate => eventPathCovers(candidate, entry))) {
                return true;
            }
            return !this.#eventSubscriptions.some(subscription =>
                subscription.paths.some(candidate => eventPathCovers(candidate, entry)),
            );
        }

        const entry = { endpoint: path.endpoint, cluster: path.cluster, attribute: path.attribute };
        if (requested?.attributes?.some(candidate => pathCovers(candidate, entry))) {
            return true;
        }
        return !this.#subscriptions.some(subscription =>
            subscription.paths.some(candidate => pathCovers(candidate, entry)),
        );
    }

    #requireClient() {
        if (this.#client === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#client;
    }

    /**
     * Hands every value a path of a live subscription covers to that subscription's `onUpdate`, and says
     * whether any subscription claimed one.
     *
     * Nothing here throws: these entries arrive in an unrelated command's reply or on chip-tool's own
     * schedule, so neither a value the model cannot decode nor a failing step callback may take down
     * whatever is in flight.
     */
    #dispatchReports(values: ChipAttributeValue[]) {
        let claimed = false;

        for (const entry of values) {
            const subscribers = this.#subscriptions.filter(subscription =>
                subscription.paths.some(candidate => pathCovers(candidate, entry)),
            );
            if (subscribers.length === 0) {
                continue;
            }
            claimed = true;

            let decoded: AttributeReadEntry;
            try {
                [decoded] = toReadEntries([entry]);
            } catch (e) {
                this.#logStream.push(
                    `Undecodable chip-tool report for endpoint ${entry.endpoint} cluster ${entry.cluster} ` +
                        `attribute ${entry.attribute}: ${e}`,
                );
                continue;
            }

            for (const subscriber of subscribers) {
                try {
                    subscriber.onUpdate?.(decoded);
                } catch (e) {
                    this.#logStream.push(`Subscription callback for ${JSON.stringify(subscriber.paths)} failed: ${e}`);
                }
            }
        }

        return claimed;
    }

    /** {@link #dispatchReports} for events. */
    #dispatchEventReports(events: ChipEventValue[]) {
        let claimed = false;

        for (const entry of events) {
            const subscribers = this.#eventSubscriptions.filter(subscription =>
                subscription.paths.some(path => eventPathCovers(path, entry)),
            );
            if (subscribers.length === 0) {
                continue;
            }
            claimed = true;

            let report: EventReadEntry;
            try {
                report = toEventEntries([entry])[0];
            } catch (e) {
                this.#logStream.push(
                    `Undecodable chip-tool event report for endpoint ${entry.endpoint} cluster ${entry.cluster} ` +
                        `event ${entry.event}: ${e}`,
                );
                continue;
            }

            for (const subscriber of subscribers) {
                try {
                    subscriber.onUpdate?.(report);
                } catch (e) {
                    this.#logStream.push(
                        `Event subscription callback for ${JSON.stringify(subscriber.paths)} failed: ${e}`,
                    );
                }
            }
        }

        return claimed;
    }

    /**
     * A result entry that arrived outside any command reply: a subscription report if a live
     * subscription covers its path, and otherwise evidence that belongs in the controller log.
     *
     * chip-tool sends these on its own schedule, so this runs on the WebSocket's message handler where
     * a throw would take the process down rather than fail a test.
     */
    #onAsyncResult(entry: unknown) {
        try {
            const reply = interpretReply([entry], path => this.#isOwnPath(path));
            const claimed = this.#dispatchReports(reply.values);
            if (this.#dispatchEventReports(reply.events) || claimed) {
                return;
            }
            this.#logStream.push(`Unattributed chip-tool result: ${stringifyChipJson(entry)}`);
        } catch (e) {
            this.#logStream.push(`Unusable chip-tool result: ${e}`);
        }
    }

    /**
     * A discriminator for an enhanced commissioning window, within § 5.1.1.1's 12-bit range. Successive
     * windows of one adapter differ, and different adapters start in different ranges. After 256 windows,
     * alpha and beta enter the next adapter's starting range while gamma enters an unassigned range; the
     * value wraps at 4096, and no cert test comes close to either.
     */
    mintDiscriminator() {
        return (this.#nextDiscriminator++ + DISCRIMINATOR_RANGES[this.#commissionerName] * 0x100) & 0xfff;
    }
}

/**
 * The descriptor of the fabric a fabric-filtered read of `OperationalCredentials.Fabrics` ran on: a
 * fabric-filtered read indicates only entries associated with the accessing fabric, so the accessing
 * fabric's own entry is the only one. Any other count leaves the fabric undecided, and a field read from
 * a guessed entry would be another fabric's.
 */
function accessingFabricOf(fabrics: unknown, node: NodeId): Record<string, unknown> {
    if (!Array.isArray(fabrics) || fabrics.length !== 1) {
        throw new UnexpectedDataError(
            `Node ${node} answered a fabric-filtered read of OperationalCredentials.Fabrics with something other ` +
                `than the one accessing fabric: ${stringifyChipJson({ fabrics })}`,
        );
    }

    const [entry] = fabrics;
    if (!isObject(entry)) {
        throw new UnexpectedDataError(
            `Node ${node} reported a fabric that is not a struct: ${stringifyChipJson({ entry })}`,
        );
    }

    return entry;
}

/**
 * The fields of the accessing fabric's entry that its compressed fabric id derives from. A guessed compressed id
 * would attribute another fabric's advertisement to this node.
 */
function fabricIdentityOf(fabrics: unknown, node: NodeId): { rootPublicKey: Bytes; fabricId: FabricId } {
    const entry = accessingFabricOf(fabrics, node);
    const { rootPublicKey, fabricId } = entry;
    if (!Bytes.isBytes(rootPublicKey) || (typeof fabricId !== "number" && typeof fabricId !== "bigint")) {
        throw new UnexpectedDataError(
            `Node ${node} reported a fabric without a usable rootPublicKey and fabricId: ` +
                stringifyChipJson({ entry }),
        );
    }

    return { rootPublicKey, fabricId: FabricId(fabricId) };
}
