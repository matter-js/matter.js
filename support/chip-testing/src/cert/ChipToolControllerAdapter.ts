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
import { OperationalCredentials } from "@matter/main/clusters";
import { getOperationalDeviceQname } from "@matter/main/protocol";
import { FabricId, GlobalFabricId, NodeId, Status, StatusResponseError } from "@matter/main/types";
import { ClusterModel, CommandModel, ValueModel } from "@matter/model";
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
    EventPathSpec,
    EventReadEntry,
    ReadAttributeOptions,
    ReadEventOptions,
    SubscribeEventOptions,
    SubscribeOptions,
    TimedInteractionOptions,
} from "@matter/testing";
import type { PicsValues } from "@matter/testing";
import { LineQueue, LogFollower, UnsupportedByControllerError } from "@matter/testing";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import type { ChipToolCommissionerName } from "../chip-tool/chip-tool-client.js";
import { ChipToolClient, resolveChipToolBinary } from "../chip-tool/chip-tool-client.js";
import { chipJsonToMatter, matterToChipJson, stringifyChipJson } from "../chip-tool/json-codec.js";
import { certClusterModelFor, findCertCluster } from "./custom-clusters.js";
import { singleQrPayload } from "./onboarding-payload.js";
import { timedInteractionTimeoutOf } from "./timed-interaction.js";

/** Name {@link UnsupportedByControllerError} reports for this adapter. */
const CONTROLLER = "chip-tool";

/**
 * What this controller claims about itself, overlaying the device's PICS for a run (see
 * `controllerPicsOverridesFor`). Only what differs from the CHIP PICS file, which describes a device.
 */
export const CHIP_TOOL_CONTROLLER_PICS: PicsValues = {
    // command-by-id sends one command path per invoke and no CommandRef.
    "MCORE.IDM.C.InvokeRequest.BatchCommands": 0,

    "MCORE.ROLE.COMMISSIONER": 1,

    // `pairing code` takes either onboarding payload, the scanned `MT:…` form included.
    "MCORE.DD.QR_COMMISSIONING": 1,
    "MCORE.DD.MANUAL_PC_COMMISSIONING": 1,
    "MCORE.DD.SCAN_QR_CODE": 1,

    // A concatenated payload names several commissionees and is refused; the caller is told to split it.
    "MCORE.DD.CTRL_CONCATENATED_QR_CODE_1": 0,
};

const WILDCARD_CLUSTER = 0xffffffff;
const WILDCARD_ATTRIBUTE = 0xffffffff;
const WILDCARD_EVENT = 0xffffffff;
const WILDCARD_ENDPOINT = 0xffff;

/**
 * chip-tool's `kMaxAllowedPaths` (`src/app/tests/suites/commands/interaction_model/InteractionModel.h`).
 * chip-tool checks it in `InteractionModelConfig::GetAttributePaths`, which its read and write paths
 * reach only with a live `DeviceProxy` in hand, so this guard is what keeps an over-long id list from
 * costing a CASE session first.
 */
const MAX_PATHS_PER_COMMAND = 64;

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

/** chip-tool's own name for the timed-interaction timeout, on `command-by-id` and `write-by-id` alike. */
function timedArg(options?: TimedInteractionOptions) {
    const timeout = timedInteractionTimeoutOf(options);
    return timeout === undefined ? "" : ` --timedInteractionTimeoutMs ${timeout}`;
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
 * node id (`RemoteDataModelLogger::LogAttributeAsJSON`), so the path is all there is to attribute a
 * report by: every live subscription whose path covers a report sees it.
 */
interface LiveSubscription {
    path: AttributePathSpec;
    onUpdate?: (value: unknown) => void;
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
export class ChipToolCommandError extends MatterError {}

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
        const code = codeOf(global.status, operation);
        if (code !== Status.Failure || global.clusterStatus !== undefined) {
            throw new StatusResponseError(`chip-tool ${operation} failed`, code, global.clusterStatus);
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
        throw new StatusResponseError(
            `chip-tool ${operation} failed`,
            codeOf(status.status, operation),
            status.clusterStatus,
        );
    }
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
                `${this.#node} ${endpoint}${timedArg(options)}`,
        );

        const operation = `invoke ${clusterModel.name}.${commandModel.name}`;
        assertNoFailure(reply, operation);
        const [status] = reply.statuses;
        if (status !== undefined) {
            throw StatusResponseError.create(codeOf(status.status, operation), undefined, status.clusterStatus);
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

    async invokeBatch(commands: BatchCommandSpec[]): Promise<BatchCommandResult[]> {
        throw new UnsupportedByControllerError(
            "invokeBatch",
            CONTROLLER,
            `chip-tool sends one command per invoke request (${commands.length} requested); its command-by-id ` +
                "takes a single command path and no CommandRef",
        );
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
                throw new StatusResponseError(
                    `readAttribute ${JSON.stringify(path)} failed`,
                    codeOf(status.status, "readAttribute"),
                    status.clusterStatus,
                );
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
            throw new UnsupportedByControllerError(
                "readAttributes",
                CONTROLLER,
                `${paths.length} paths exceeds chip-tool's limit of ${MAX_PATHS_PER_COMMAND} per read`,
            );
        }

        const reply = await this.#read(paths, options);
        assertNoFailure(reply, `read ${JSON.stringify(paths)}`);
        return toReadEntries(reply.values);
    }

    async writeAttribute(path: AttributePathSpec, value: unknown, options?: TimedInteractionOptions): Promise<void> {
        const { endpoint, cluster, attribute } = path;
        if (endpoint === undefined || cluster === undefined || attribute === undefined) {
            throw new ImplementationError("writeAttribute requires a concrete endpoint/cluster/attribute path");
        }

        const reply = await this.#write([{ path, value }], "writeAttribute", options);
        assertNoFailure(reply, `write ${JSON.stringify(path)}`);

        const status = statusFor(reply.statuses, { endpoint, cluster, attribute });
        if (status !== undefined) {
            throw new StatusResponseError(
                `writeAttribute ${JSON.stringify(path)} failed`,
                codeOf(status.status, "writeAttribute"),
                status.clusterStatus,
            );
        }
    }

    async writeAttributes(entries: AttributeWriteEntry[]): Promise<AttributeWriteStatus[]> {
        if (entries.length === 0) {
            throw new ImplementationError("writeAttributes requires at least one attribute");
        }
        if (entries.length > MAX_PATHS_PER_COMMAND) {
            throw new UnsupportedByControllerError(
                "writeAttributes",
                CONTROLLER,
                `${entries.length} attributes exceeds chip-tool's limit of ${MAX_PATHS_PER_COMMAND} per write`,
            );
        }

        const paths = entries.map(({ path: { endpoint, cluster, attribute } }) => {
            if (cluster === undefined || attribute === undefined) {
                throw new ImplementationError("writeAttributes requires a concrete cluster and attribute");
            }
            if (endpoint === undefined) {
                // chip-tool's WriteAttribute callback records a result only for a path the device
                // rejected, so a wildcard endpoint's successful writes are invisible and the
                // per-endpoint statuses this method contracts to return cannot be reconstructed.
                throw new UnsupportedByControllerError(
                    "writeAttributes",
                    CONTROLLER,
                    "chip-tool reports no status for a successfully written path, so a wildcard endpoint " +
                        "yields no per-endpoint statuses",
                );
            }
            return { endpoint, cluster, attribute };
        });

        const versioned = entries.filter(({ dataVersion }) => dataVersion !== undefined);
        if (versioned.length !== 0 && versioned.length !== entries.length) {
            throw new UnsupportedByControllerError(
                "writeAttributes",
                CONTROLLER,
                "chip-tool takes one data version per path or none at all, not a mix",
            );
        }

        const reply = await this.#write(entries, "writeAttributes");
        assertNoFailure(reply, `write ${JSON.stringify(entries.map(({ path }) => path))}`);

        return paths.map(path => {
            const status = statusFor(reply.statuses, path);
            return {
                ...path,
                // Absence of a status for a concrete path is chip-tool's only signal that the device
                // accepted the write (Matter Core § 8.9.2.8 requires a status per concrete path).
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
        const reply = await this.#adapter.subscribe(this.#node, path, opts);

        const seed = reply.values.filter(entry => pathCovers(path, entry));
        if (path.endpoint !== undefined && path.cluster !== undefined && path.attribute !== undefined) {
            return seed.length === 0 ? undefined : decodeAttributeValue(seed[0]);
        }
        return toReadEntries(seed);
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
            throw new UnsupportedByControllerError(
                "readEvents",
                CONTROLLER,
                `${paths.length} paths exceeds chip-tool's limit of ${MAX_PATHS_PER_COMMAND} per read`,
            );
        }

        // chip-tool zips its cluster/event/endpoint id lists element-wise, as it does for attributes
        let command =
            `any read-event-by-id ${paths.map(eventClusterArg).join(",")} ${paths.map(eventArg).join(",")} ` +
            `${this.#node} ${paths.map(eventEndpointArg).join(",")}`;
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
            throw new StatusResponseError(
                `readEvents ${JSON.stringify(refused.path)} failed`,
                codeOf(refused.status.status, "readEvents"),
                refused.status.clusterStatus,
            );
        }

        return toEventEntries(reply.events.filter(entry => paths.some(path => eventPathCovers(path, entry))));
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
            throw new UnsupportedByControllerError(
                "subscribeEvents",
                CONTROLLER,
                `${paths.length} paths exceeds chip-tool's limit of ${MAX_PATHS_PER_COMMAND} per subscription`,
            );
        }

        const reply = await this.#adapter.subscribeEvents(this.#node, paths, opts);
        return toEventEntries(reply.events.filter(entry => paths.some(path => eventPathCovers(path, entry))));
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
        // chip-tool zips the three id lists into paths when their lengths match
        // (`InteractionModelConfig::GetAttributePaths`), so equal-length lists express any path set.
        let command =
            `any read-by-id ${paths.map(clusterArg).join(",")} ${paths.map(attributeArg).join(",")} ` +
            `${this.#node} ${paths.map(endpointArg).join(",")}`;
        if (options?.fabricFiltered === false) {
            command += " --fabric-filtered false";
        }
        return this.#adapter.execute(command, { attributes: paths });
    }

    #write(entries: AttributeWriteEntry[], operation: string, options?: TimedInteractionOptions) {
        const values = entries.map(({ path: { cluster, endpoint, attribute }, value }) => {
            if (cluster === undefined || attribute === undefined) {
                throw new ImplementationError(`${operation} requires a concrete cluster and attribute`);
            }
            const encoded = encodeAttributeValue(cluster, attribute, value);
            if (encoded.includes(";")) {
                throw new UnsupportedByControllerError(
                    operation,
                    CONTROLLER,
                    `chip-tool splits attribute values on ";", which ${JSON.stringify(encoded)} contains ` +
                        `(endpoint ${endpoint}, cluster ${cluster}, attribute ${attribute})`,
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

        return this.#adapter.execute(command, { attributes: entries.map(({ path }) => path) });
    }
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
 * Operations chip-tool cannot express throw {@link UnsupportedByControllerError}, which the step
 * runner records as a skip. That covers a wildcard-endpoint `writeAttributes` (chip-tool reports no
 * status for a written path) and path counts above chip-tool's own limit.
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
    #storageDirectory?: string;
    #client?: ChipToolClient;
    #nextNodeId = FIRST_NODE_ID;
    #nextDiscriminator = 0;
    readonly #globalFabricIds = new Map<string, Promise<GlobalFabricId>>();
    #closed = false;

    constructor(id: string) {
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
        this.#commissionerName = commissionerName;
        claimedCommissioners.set(commissionerName, this);
        this.log = new LogFollower(this.#logStream.follow(), id);
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

    async commission(target: CommissioningTarget): Promise<CertNodeRef> {
        const nodeId = NodeId(this.#nextNodeId++);
        const node = nodeId.toString();

        if (target.singleHandshakeAttempt) {
            // chip-tool exposes no equivalent bound, so the outcome is whatever its own retry policy produces. Said out
            // loud because a step asking for this is asserting a refusal, and a recovered handshake would otherwise be
            // recorded against the device rather than against the option nobody honored.
            console.warn(
                `chip-tool cannot bound commissioning of node ${node} to a single handshake attempt; its own retry ` +
                    "policy decides the outcome",
            );
        }

        let command: string;
        if (target.qrPairingCode) {
            // `pairing code` reads either payload format, a concatenated one included — and would pair
            // with whichever commissionee that names first, which is what this refuses.
            singleQrPayload(target.qrPairingCode);
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

        const reply = await this.execute(command);
        assertCommandSucceeded(reply, `commissioning of node ${node}`);

        return node;
    }

    node(ref: CertNodeRef): CertNodeApi {
        return new ChipToolCertNodeApi(this, ref);
    }

    /**
     * Subscribes `node` to `path` and starts forwarding its reports, returning the establishing reply
     * so the caller can take the priming values out of it.
     */
    async subscribe(node: string, path: AttributePathSpec, opts: SubscribeOptions): Promise<ChipReply> {
        // chip-tool defaults keepSubscriptions to false, which has the device drop every earlier
        // subscription of this controller; matter.js's own cert adapter keeps them
        const reply = await this.execute(
            `any subscribe-by-id ${clusterArg(path)} ${attributeArg(path)} ` +
                `${opts.minIntervalFloorSeconds} ${opts.maxIntervalCeilingSeconds} ${node} ` +
                `${endpointArg(path)} --keepSubscriptions true`,
            { attributes: [path] },
        );
        assertNoFailure(reply, `subscribe ${JSON.stringify(path)}`);

        const { endpoint, cluster, attribute } = path;
        if (endpoint !== undefined && cluster !== undefined && attribute !== undefined) {
            // A concrete path's status is the device refusing this subscription itself; a wildcard's
            // statuses are per-item, as in a read, and leave the subscription established.
            const status = statusFor(reply.statuses, { endpoint, cluster, attribute });
            if (status !== undefined) {
                throw new StatusResponseError(
                    `subscribe ${JSON.stringify(path)} failed`,
                    codeOf(status.status, "subscribe"),
                    status.clusterStatus,
                );
            }
        }

        // Registering only now is what draws the seeding boundary: the priming values chip-tool
        // recorded into this reply were dispatched while no subscription claimed this path, so they are
        // the caller's return value and every report after them is an update.
        this.#subscriptions.push({ path, onUpdate: opts.onUpdate });
        this.#requireClient().armReports();

        return reply;
    }

    /** {@link subscribe} for events. */
    async subscribeEvents(node: string, paths: EventPathSpec[], opts: SubscribeEventOptions): Promise<ChipReply> {
        let command =
            `any subscribe-event-by-id ${paths.map(eventClusterArg).join(",")} ${paths.map(eventArg).join(",")} ` +
            `${opts.minIntervalFloorSeconds} ${opts.maxIntervalCeilingSeconds} ${node} ` +
            `${paths.map(eventEndpointArg).join(",")} --keepSubscriptions true`;
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
            throw new StatusResponseError(
                `subscribeEvents ${JSON.stringify(refused.path)} failed`,
                codeOf(refused.status.status, "subscribeEvents"),
                refused.status.clusterStatus,
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
        const fabrics = await this.node(node.toString()).readAttribute(
            {
                endpoint: 0,
                cluster: OperationalCredentials.id,
                attribute: OperationalCredentials.attributes.fabrics.id,
            },
            { fabricFiltered: true },
        );

        const { rootPublicKey, fabricId } = accessingFabricOf(fabrics, node);
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
        return !this.#subscriptions.some(subscription => pathCovers(subscription.path, entry));
    }

    #requireClient() {
        if (this.#client === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#client;
    }

    /**
     * Hands every value a live subscription's path covers to that subscription's `onUpdate`, and says
     * whether any subscription claimed one.
     *
     * Nothing here throws: these entries arrive in an unrelated command's reply or on chip-tool's own
     * schedule, so neither a value the model cannot decode nor a failing step callback may take down
     * whatever is in flight.
     */
    #dispatchReports(values: ChipAttributeValue[]) {
        let claimed = false;

        for (const entry of values) {
            const subscribers = this.#subscriptions.filter(subscription => pathCovers(subscription.path, entry));
            if (subscribers.length === 0) {
                continue;
            }
            claimed = true;

            let value;
            try {
                value = decodeAttributeValue(entry);
            } catch (e) {
                this.#logStream.push(
                    `Undecodable chip-tool report for endpoint ${entry.endpoint} cluster ${entry.cluster} ` +
                        `attribute ${entry.attribute}: ${e}`,
                );
                continue;
            }

            for (const subscriber of subscribers) {
                try {
                    subscriber.onUpdate?.(value);
                } catch (e) {
                    this.#logStream.push(`Subscription callback for ${JSON.stringify(subscriber.path)} failed: ${e}`);
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
     * windows of one adapter differ, and different adapters start in different ranges; both wrap after
     * 256 windows, which no cert test comes close to.
     */
    mintDiscriminator() {
        return (this.#nextDiscriminator++ + DISCRIMINATOR_RANGES[this.#commissionerName] * 0x100) & 0xfff;
    }
}

/**
 * The descriptor of the fabric a fabric-filtered read of `OperationalCredentials.Fabrics` ran on: a
 * fabric-filtered read indicates only entries associated with the accessing fabric, so the accessing
 * fabric's own entry is the only one. Any other count leaves the fabric undecided, and a guessed
 * compressed id would attribute another fabric's advertisement to this node.
 */
function accessingFabricOf(fabrics: unknown, node: NodeId): { rootPublicKey: Bytes; fabricId: FabricId } {
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

    const { rootPublicKey, fabricId } = entry;
    if (!Bytes.isBytes(rootPublicKey) || (typeof fabricId !== "number" && typeof fabricId !== "bigint")) {
        throw new UnexpectedDataError(
            `Node ${node} reported a fabric without a usable rootPublicKey and fabricId: ` +
                stringifyChipJson({ entry }),
        );
    }

    return { rootPublicKey, fabricId: FabricId(fabricId) };
}
