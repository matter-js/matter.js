/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AbortedError,
    Bytes,
    causedBy,
    Diagnostic,
    Duration,
    ImplementationError,
    InternalError,
    Logger,
    LogLevel,
    Millis,
    NotImplementedError,
    Seconds,
    Time,
} from "@matter/general";
import {
    AttributeId,
    camelize,
    ClusterId,
    CommandId,
    decamelize,
    EventId,
    EventNumber,
    GroupId,
    isObject,
    LogFormat,
    NodeId,
    Observable,
} from "@matter/main";
import {
    EndpointNumber,
    MATTER_EPOCH_OFFSET_S,
    MATTER_EPOCH_OFFSET_US,
    Status,
    StatusResponseError,
    VendorId,
} from "@matter/main/types";
import {
    AcceptedCommandList,
    AttributeList,
    AttributeModel,
    ClusterModel,
    ClusterRevision,
    CommandModel,
    EventModel,
    FeatureMap,
    FieldValue,
    GeneratedCommandList,
    MatterModel,
    ValueModel,
} from "@matter/model";
import {
    CommissionableDeviceIdentifiers,
    RetransmissionLimitReachedError,
    TransientPeerCommunicationError,
} from "@matter/protocol";
import { NodeNotConnectedError } from "@project-chip/matter.js/device";
import { WebSocketServer } from "ws";
import { log } from "./GenericTestApp.js";
import {
    AttributeResponseData,
    CommandHandler,
    DiscoveryResponse,
    EventResponseData,
} from "./handler/CommandHandler.js";

const logger = new Logger("ChipToolWebSocketHandler");

type AttributeDetails = { [key: string]: AttributeModel };

/** Metadata for Global attributes */
const GlobalAttributes: AttributeDetails = {
    clusterRevision: ClusterRevision,
    featureMap: FeatureMap,
    attributeList: AttributeList,
    acceptedCommandList: AcceptedCommandList,
    generatedCommandList: GeneratedCommandList,
};

/**
 * Metadata for all clusters collected in an optimized form for direct access with the incoming websocket requests.
 * All names are just lowercased to prevent differences in camelize and decamelize handling.
 */
type ClusterMapEntry = {
    clusterId: ClusterId;
    model: ClusterModel;
    commands: { [key: string]: CommandModel };
    attributes: AttributeDetails;
    events: { [key: string]: EventModel };
};
const ClusterMap: {
    [key: string]: ClusterMapEntry;
} = {};

// Remap the clusters from Model to a more optimized form for direct access
MatterModel.standard.clusters.forEach(cluster => {
    if (cluster.id === undefined) {
        return;
    }

    const aces = cluster.allAces;
    const clusterData: ClusterMapEntry = {
        clusterId: ClusterId(cluster.id),
        model: cluster,
        commands: {},
        attributes: {},
        events: {},
    };
    aces.forEach(ace => {
        const name = ace.name.toLowerCase();
        if (ace instanceof CommandModel) {
            clusterData.commands[name] = ace;
        } else if (ace instanceof AttributeModel) {
            clusterData.attributes[name] = ace;
        } else if (ace instanceof EventModel) {
            clusterData.events[name] = ace;
        }
    });
    ClusterMap[cluster.name.toLowerCase()] = clusterData;
});

/** Mapping of Loglevels between Matter,js and the testrunner understanding */
const LogLevelMap: { [key: number]: string } = {
    [LogLevel.FATAL]: "Error",
    [LogLevel.ERROR]: "Error",
    [LogLevel.WARN]: "Error",
    [LogLevel.INFO]: "Info",
    [LogLevel.NOTICE]: "Info",
    [LogLevel.DEBUG]: "Debug",
};

/** Convert stringified numbers in hex and normal style to either number or bigint. */
export function parseNumber(number: string): number | bigint {
    const parsed = number.startsWith("0x") ? BigInt(number) : parseInt(number);
    if (typeof parsed === "number" && isNaN(parsed)) {
        throw new ImplementationError(`Failed to parse number: ${number}`);
    }
    return parsed;
}

/** JSON stringify with BigInt handling if number, if bigger than max int  */
function toChipJson(object: object, spaces?: number): string {
    const replacements = new Array<{ from: string; to: string }>();
    let result = JSON.stringify(
        object,
        (_key, value) => {
            if (typeof value === "bigint") {
                if (value > Number.MAX_SAFE_INTEGER) {
                    replacements.push({ from: `":"0x${value.toString(16)}"`, to: `":${value.toString()}` });
                    return `0x${value.toString(16)}`;
                } else {
                    return Number(value);
                }
            }
            return value;
        },
        spaces,
    );
    // CHip JSON is no JS JSON, so we need to replace the hex strings with the correct full number again
    if (replacements.length > 0) {
        replacements.forEach(({ from, to }) => {
            result = result.replaceAll(from, to);
        });
    }

    return result;
}

/**
 * What a `find-commissionable-by-*` command asks discovery to look for.
 *
 * A vendor id arrives as the step wrote it and is taken unvalidated: a step naming an id the
 * specification reserves is asking this shim what discovery answers for it, and validating here would
 * throw before the command handler can answer at all.
 */
export function discoveryIdentifierFor(command: string, value: string): CommissionableDeviceIdentifiers {
    switch (command) {
        case "find-commissionable-by-long-discriminator":
            return { longDiscriminator: parseInt(value) };

        case "find-commissionable-by-short-discriminator":
            return { shortDiscriminator: parseInt(value) };

        case "find-commissionable-by-vendor-id":
            return { vendorId: VendorId(parseInt(value), false) };

        case "find-commissionable-by-device-type":
            return { deviceType: parseInt(value) };

        case "find-commissionable-by-commissioning-mode":
        case "commissionables":
            return {};

        default:
            throw new ImplementationError(`Missing find by details for discovery command "${command}"`);
    }
}

/**
 * A discovery command's answer.
 *
 * `{results: []}` is the runner's success shape, and every `DiscoveryCommands` step of the corpus
 * exists to prove a device was found, so a discovery that found nothing has to fail them instead.
 */
export function discoveryResponseFor(results: DiscoveryResponse, command: string): ChipWebSocketCommandResponse {
    if (results.length === 0) {
        logger.error(`Discovery for "${command}" found no device`);
        return { results: [{ error: "FAILURE" }] };
    }
    return { results };
}

/**
 * The deadline a step declared, as a {@link Duration}, or `undefined` where it declared none.
 *
 * The runner encodes a step's `timeout:` as an argument, and real chip-tool honours it by giving up and
 * tearing its command down. Ignoring it leaves the operation running until matter.js gives up on the
 * peer instead — tens of seconds, and a property of the peer rather than of the deadline the plan set.
 */
export function stepDeadline(commandArguments: unknown): Duration | undefined {
    if (!isObject(commandArguments) || commandArguments.timeout === undefined) {
        return undefined;
    }
    const seconds = Number(commandArguments.timeout);
    if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new ImplementationError(`A step declared the unusable timeout "${commandArguments.timeout}"`);
    }
    return Seconds(seconds);
}

/**
 * The model of a cluster a step named, by the name the runner sends.
 *
 * A step naming something this shim has no model for is a fault of the step or of this shim — real
 * chip-tool refuses such a step client-side too, and no device answered anything — so it is reported as
 * ours (see {@link isOwnFailure}) rather than as an interaction status the device never sent. Left
 * unchecked, these lookups reach the runner as a `TypeError` naming nothing.
 */
export function clusterModelFor(cluster: string): ClusterMapEntry {
    const clusterData = ClusterMap[camelize(cluster).toLowerCase()];
    if (clusterData === undefined) {
        throw new ImplementationError(`No model for cluster "${cluster}", which a step named`);
    }
    return clusterData;
}

/** The model of `cluster`'s attribute `name`, global attributes included (see {@link clusterModelFor}). */
export function attributeModelFor(clusterData: ClusterMapEntry, cluster: string, name: string): AttributeModel {
    const attributeName = camelize(name);
    const attributeModel = clusterData.attributes[attributeName.toLowerCase()] ?? GlobalAttributes[attributeName];
    if (attributeModel === undefined) {
        throw new ImplementationError(`Cluster "${cluster}" has no attribute "${name}", which a step named`);
    }
    return attributeModel;
}

/** The model of `cluster`'s command `name` (see {@link clusterModelFor}). */
export function commandModelFor(clusterData: ClusterMapEntry, cluster: string, name: string): CommandModel {
    const commandModel = clusterData.commands[camelize(name).toLowerCase()];
    if (commandModel === undefined) {
        throw new ImplementationError(`Cluster "${cluster}" has no command "${name}", which a step named`);
    }
    return commandModel;
}

/** The model of `cluster`'s event `name` (see {@link clusterModelFor}). */
export function eventModelFor(clusterData: ClusterMapEntry, cluster: string, name: string): EventModel {
    const eventModel = clusterData.events[camelize(name).toLowerCase()];
    if (eventModel === undefined) {
        throw new ImplementationError(`Cluster "${cluster}" has no event "${name}", which a step named`);
    }
    return eventModel;
}

/**
 * A write payload the step handed over, as the value to write.
 *
 * A payload nothing can read is refused rather than answered: `{results: []}` is the runner's success
 * shape, so returning it would record a write the device never saw as one it accepted.
 */
export function parseWritePayload(value: string, what: string): unknown {
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new ImplementationError(`Cannot read the payload of ${what}`, { cause: error });
    }
}

/**
 * Whether `error` can only be a fault of this shim or of the step that drove it, rather than an answer
 * from the device: our own invariant, API misuse or unimplemented path (`NotImplementedError` extends
 * {@link InternalError}), a JavaScript type error from a path the request never fit, or a `SyntaxError`
 * from reading a step's own argument — `JSON.parse` in {@link parseChipJSON} and `BigInt` in
 * {@link parseNumber} both raise one, and both run inside a command handler's `try`.
 *
 * The device cannot produce any of those, so reporting them as the failure the device gave lets a step
 * that expects one pass on our bug. `RangeError` is deliberately absent: `DataReader` clamps its offset
 * rather than failing, so a truncated device message reaches `DataView` and raises one.
 *
 * Cause chains are followed, as {@link StatusResponseError.of} and {@link causedBy} do for the two
 * classifications beside this one — a wrapped {@link ImplementationError} is still ours.
 */
export function isOwnFailure(error: unknown) {
    return causedBy(error, ImplementationError, InternalError, TypeError, SyntaxError);
}

/**
 * How this shim answers a command that failed.
 *
 * A device that refuses gives a bare `FAILURE`, which steps of the corpus expect; a failure of this
 * shim's own must not be spelled the same way (see {@link isOwnFailure}) or those steps pass on our bug.
 * Every catch that answers a failure goes through here, so a handler cannot answer one way while
 * another answers the other.
 */
export function failureResponseFor(error: unknown): ChipWebSocketCommandResponse {
    return isOwnFailure(error) ? ownFailureResponse(error) : { results: [{ error: "FAILURE" }] };
}

/**
 * How this shim reports a failure of its own to the runner.
 *
 * The message is never empty: the runner drops a trailing `FAILURE` from a multi-entry result and reads
 * a falsy error as no error at all, so an error carrying no message would be recorded as a command that
 * succeeded.
 */
export function ownFailureResponse(error: unknown): ChipWebSocketCommandResponse {
    const message = error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
    return { results: [{ error: `Test harness failure — ${message || "no message"}` }, { error: "FAILURE" }] };
}

/**
 * Uses the matter.js Model to convert the response data for read, subscribe and invoke into a tag based response
 * including conversion of data types.
 */
function convertMatterToWebSocketTagBased(value: unknown, model: ValueModel, clusterModel: ClusterModel): unknown {
    if (value === null) {
        return null;
    }
    if (Array.isArray(value) && model.type === "list") {
        return value.map(v => convertMatterToWebSocketTagBased(v, model.members.at(0)!, clusterModel));
    }
    if (isObject(value) && model.metabase?.name === "struct") {
        const valueKeys = Object.keys(value);
        const result: { [key: string]: any } = {};
        for (const member of model.members) {
            const name = member.propertyName;
            if (member.name !== undefined && member.id !== undefined && valueKeys.includes(name)) {
                result[member.id] = convertMatterToWebSocketTagBased(value[name], member, clusterModel);
            }
        }
        return result;
    }
    if (isObject(value) && model.metabase?.metatype === "bitmap") {
        let numberValue = 0;

        for (const member of clusterModel.scope.membersOf(model)) {
            const memberValue =
                member.name !== undefined && value[member.propertyName]
                    ? value[member.propertyName]
                    : member.description !== undefined && value[camelize(member.description)]
                      ? value[camelize(member.description)]
                      : undefined;

            if (!memberValue) {
                continue;
            }
            if (typeof memberValue !== "boolean" && typeof memberValue !== "number") {
                throw new ImplementationError(`Invalid bitmap value ${JSON.stringify(memberValue)}`);
            }

            const constraintValue = FieldValue.countValue(member.constraint.value);
            if (constraintValue !== undefined) {
                numberValue |= 1 << constraintValue;
            } else {
                const minBit = FieldValue.countValue(member.constraint.min) ?? 0;
                numberValue |= (typeof memberValue === "boolean" ? 1 : memberValue) << minBit;
            }
        }

        return numberValue;
    }

    if (Bytes.isBytes(value) && model.metabase?.metatype === "bytes") {
        value = `base64:${Bytes.toBase64(value)}`;
    }

    if (model.metabase?.metatype === "integer") {
        // Convert Epoch timestamps to Unix timestamps we use internally
        if (model.type === "epoch-s" && typeof value === "number") {
            value -= MATTER_EPOCH_OFFSET_S;
        } else if (model.type === "epoch-us" && (typeof value === "number" || typeof value === "bigint")) {
            value = BigInt(value) - MATTER_EPOCH_OFFSET_US;
        }
        return value;
    }

    return value;
}

/** Chip JSON-like data strings can contain long numbers that are not supported by JSON.parse */
function parseChipJSON(json: string) {
    json = json.replace(/: (\d{15,})[,}]/g, (match, number) => {
        const num = BigInt(number);
        if (num > Number.MAX_SAFE_INTEGER) {
            return match.replace(number, `"0x${num.toString(16)}"`);
        }
        return match;
    });

    return JSON.parse(json);
}

/**
 * Use the matter.js model to convert the incoming data for write and invoke commands into the
 * expected format.
 *
 * Exported only as a test seam (see `resetControllerAdapterFactoryForTesting` in
 * `packages/testing/src/chip/cert/controller-adapter.ts` for the same pattern); no production
 * caller outside this module should import it.
 */
export function convertWebsocketDataToMatter(value: any, model: ValueModel): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === "null" || value === null) {
        return null;
    }

    if (model.type === "list") {
        if (typeof value === "string") {
            value = parseChipJSON(value);
        }
        if (Array.isArray(value)) {
            return value.map(v => convertWebsocketDataToMatter(v, model.members.at(0)!));
        }
    }

    if (model.metabase?.name === "struct") {
        if (typeof value === "string") {
            value = parseChipJSON(value);
        }
        if (typeof value === "object") {
            const members = model.members.reduce(
                (acc, member) => {
                    if (member.name !== undefined) {
                        acc[member.name.toLowerCase()] = member;
                    }
                    return acc;
                },
                {} as { [key: string]: ValueModel },
            );
            const valueKeys = Object.keys(value);
            const result: { [key: string]: unknown } = {};
            valueKeys.forEach(key => {
                const member = members[camelize(key).toLowerCase()];
                if (member !== undefined) {
                    result[member.propertyName] = convertWebsocketDataToMatter(value[key], member);
                }
            });
            return result;
        }
    }

    if (
        (typeof value === "number" || typeof value === "bigint") &&
        (model.metabase?.metatype === "integer" || model.metabase?.metatype === "enum")
    ) {
        // Convert Epoch timestamps to Unix timestamps we use internally
        if (model.type === "epoch-s" && typeof value === "number") {
            value += MATTER_EPOCH_OFFSET_S;
        } else if (model.type === "epoch-us") {
            value = BigInt(value) + MATTER_EPOCH_OFFSET_US;
        }
        return value;
    }

    if (typeof value === "string") {
        if (model.metabase?.metatype === "bytes") {
            // chip-tool's own JSON encoder (`TlvJson.cpp`, `kTLVType_ByteString` case) writes the
            // `base64:` header only inside `if (encodedLen)`: `Base64Encode` of a zero-length span
            // returns 0, so a zero-length octet string comes back as `""` with no prefix at all.
            if (value === "") {
                return Bytes.fromHex("");
            }
            if (value.startsWith("base64:")) {
                return Bytes.fromBase64(value.slice(7));
            }
            if (value.startsWith("hex:")) {
                return Bytes.fromHex(value.slice(4));
            }
        }

        if (model.metabase?.metatype === "bitmap") {
            const numberValue = parseInt(value);
            if (isNaN(numberValue)) {
                throw new ImplementationError(`Invalid bitmap value ${value}`);
            }
            const bitmapValue: { [key: string]: boolean } = {};
            model.members.forEach(member => {
                if (
                    member.constraint !== undefined &&
                    member.name !== undefined &&
                    numberValue & (1 << parseInt(member.constraint as unknown as string))
                ) {
                    bitmapValue[member.propertyName] = true;
                }
            });
            return bitmapValue;
        }

        if (
            ((model.metabase?.metatype === "integer" || model.metabase?.metatype === "enum") &&
                value.startsWith("0x") &&
                value.match(/^0x[\da-fA-F]+$/)) ||
            value.match(/^-?[1-9]\d*$/) ||
            value === "0"
        ) {
            let numberValue = parseNumber(value);
            if (model.type === "epoch-s" && typeof numberValue === "number") {
                numberValue += MATTER_EPOCH_OFFSET_S;
            } else if (model.type === "epoch-us") {
                numberValue = BigInt(value) + MATTER_EPOCH_OFFSET_US;
            }
            return numberValue;
        }

        if (model.metabase?.metatype === "boolean") {
            return value === "true" || value === "1" || value === "True";
        }

        if (model.metabase?.metatype === "string") {
            return value;
        }
    }

    logger.warn("UNHANDLED value ...", value, model.type, model.metatype, model.metabase?.metatype);

    return value;
}

/** Tweak the Logger to collect all logs and allow to grab and forward them in the response. */
function loggerSetup(): {
    startRecording: () => void;
    stopRecording: () => { module: string; category: string; message: string }[];
} {
    Logger.format = LogFormat.ANSI;

    let messageBuffer: { module: string; category: string; message: string }[] | undefined;

    const startRecording = () => {
        messageBuffer = [];
    };
    const stopRecording = () => {
        const result = messageBuffer;
        messageBuffer = undefined;
        return result ?? [];
    };

    const defaultWriter = Logger.destinations.default.write;

    function interceptingWriter(text: string, message: Diagnostic.Message) {
        if (messageBuffer) {
            messageBuffer.push({
                module: message.facility,
                category: LogLevelMap[message.level] ?? "Unknown",
                message: Buffer.from(text).toString("base64"),
            });
        }

        defaultWriter(text, message);
    }
    Logger.destinations.default.write = interceptingWriter;

    return { startRecording, stopRecording };
}

/** Internal typing for a Websocket command with already parsed argument structure. */
interface ChipWebSocketCommand {
    cluster: string;
    command: string;
    arguments?: any;
    command_specifier?: string;

    /** Aborts when the step's own `timeout` expires, absent where the step declared none. */
    abort?: AbortSignal;
}

/** Incoming Websocket command with base64 encoded arguments. */
interface IncomingChipWebSocketCommand extends ChipWebSocketCommand {
    arguments?: string;
}

/** Internal typing for a Websocket command response. */
interface ChipWebSocketCommandResponse {
    results: any[];
}

/** Outgoing Websocket command response with additional log data. */
interface OutgoingChipWebSocketCommandResponse extends ChipWebSocketCommandResponse {
    logs: { module: string; category: string; message: string }[];
}

// TODO DestinationId like 0xffffffffffff0103 will be a group one

/**
 * This class receives Chip-Tool compatible WebSocket-messages from the YAML test runner, executes the relevant actions
 * and returns a Chip-Tool compatible response. lso a lot of data conversion is done to match ensure compatibility.
 */
export class ChipToolWebSocketHandler {
    readonly #wsPort: number;
    #wsServer?: WebSocketServer;
    #commandHandlers?: Map<string, CommandHandler>;
    #startRecording?: () => void;
    #stopRecording?: () => { module: string; category: string; message: string }[];
    readonly #subscriptionData = new Array<AttributeResponseData | EventResponseData>();
    #subscriptionUpdated?: Observable<[void]>; // Tests basically just have one subscription, so this is fine

    constructor(wsPort: number) {
        this.#wsPort = wsPort;
    }

    initialize(commandHandlers: Map<string, CommandHandler>) {
        logger.info(`Initialize with Command handlers for Identities ${Array.from(commandHandlers.keys()).join(", ")}`);
        this.#commandHandlers = commandHandlers;

        // Setup the Logger
        const { startRecording, stopRecording } = loggerSetup();
        this.#startRecording = startRecording;
        this.#stopRecording = stopRecording;

        // Start collecting all logs
        this.#startRecording();
    }

    /**
     * Get the command handler for the given controller name. Defaults to "alpha".
     * The Controller is started when used first time.
     */
    async #commandHandlerFor(controllerName?: string) {
        const handler = this.#commandHandlers?.get(controllerName ?? "alpha");
        if (handler === undefined) {
            throw new ImplementationError(`Unknown controller: ${controllerName}`);
        }
        // Do start the controllers just if needed
        if (!handler.started) {
            try {
                await handler.start();
            } catch (error) {
                // A controller of ours that will not come up is not the device refusing: left as it
                // arrives, a storage or socket error here answers the bare failure 40 steps of the
                // corpus expect, and they would pass on it.
                throw new InternalError(`Controller "${controllerName ?? "alpha"}" failed to start`, {
                    cause: error,
                });
            }
        }
        return handler;
    }

    /**
     * The port the server actually listens on, which is the configured one unless that was 0 — then the
     * OS picks it and only the bound socket knows. `undefined` before {@link start} resolves.
     */
    get port(): number | undefined {
        const address = this.#wsServer?.address();
        if (address === undefined || address === null || typeof address === "string") {
            return undefined;
        }
        return address.port;
    }

    /**
     * Starts listening. Resolves once the socket is bound, so a caller that reports "started" says
     * something true, and rejects where the port could not be taken rather than raising an
     * unhandled error event.
     */
    async start(): Promise<void> {
        const server = new WebSocketServer({ host: "127.0.0.1", port: this.#wsPort });
        this.#wsServer = server;

        await new Promise<void>((resolve, reject) => {
            const failed = (error: Error) => reject(error);
            server.once("listening", () => {
                server.off("error", failed);
                logger.info(`WebSocketServer started on port ${this.port}`);
                log.directive("== WebSocket Server Ready"); // Testrunner uses this to detect that WS server has been started
                resolve();
            });
            server.once("error", failed);
        });

        server.on("error", error => logger.error("Testrunner WebSocket server error", error));

        this.#wsServer.on("connection", ws => {
            logger.info("Testrunner connected to WebSocket");

            ws.on("error", (...error) => {
                logger.error("Testrunner WebSocket error", error);
            });

            ws.on("message", data => {
                const str = (data ?? "").toString();
                this.#handleWebSocketMessage(str).then(
                    result => ws.send(result),
                    error => logger.error("WebSocket Message handling error", error),
                );
            });
        });
    }

    async #handleWebSocketMessage(data: string): Promise<string> {
        let result: ChipWebSocketCommandResponse;

        try {
            if (data.startsWith("json:")) {
                const json = JSON.parse(data.substring(5)) as IncomingChipWebSocketCommand;
                result = await this.#handleJsonCommand(json);
            } else {
                result = await this.#handleTextCommand(data);
            }
        } catch (error) {
            logger.error("WebSocket Message parsing error", error);
            // Only this shim's own faults reach here — every call to the device runs inside a handler's
            // own try — and an error carrying no message would otherwise answer with an empty error
            // entry, which the runner reads as a command that succeeded.
            result = failureResponseFor(error);
        }

        // Grab logs and send response including logs
        const logs = this.#stopRecording!();
        logger.info("WebSocket response", result, `and ${logs.length} log lines`);
        const { results } = result;
        const response: OutgoingChipWebSocketCommandResponse = { results, logs };
        this.#startRecording!();

        return toChipJson(response);
    }

    /** Handles an incoming one line text command */
    async #handleTextCommand(data: string): Promise<ChipWebSocketCommandResponse> {
        if (!this.#commandHandlers) {
            throw new InternalError("Command handlers not initialized");
        }

        logger.info("Received Text based command:", data);

        // The runner sends a bare frame for a `wait-for-report` step: empty for one that waits
        // indefinitely, and the number of seconds alone for one that declared a timeout.
        if (data === "" || /^\d+$/.test(data)) {
            return await this.#awaitSubscriptionData(data === "" ? undefined : Seconds(Number(data)));
        }

        const commandData = data.split(" ");
        switch (commandData[0]) {
            case "pairing": {
                switch (commandData[1]) {
                    case "code":
                        // pairing code 0x12344321 MT:-24J042C00KA0648G00
                        try {
                            await (
                                await this.#commandHandlerFor("alpha")
                            ).handleInitialPairing({
                                nodeId: NodeId(parseNumber(commandData[2])),
                                qrCode: commandData[3],
                            });
                            return { results: [] };
                        } catch (error) {
                            logger.error("Error commissioning node", error);
                            return failureResponseFor(error);
                        }
                    default:
                        throw new NotImplementedError(`Pairing text command ${commandData[1]}`);
                }
            }
        }
        throw new NotImplementedError(`Text command ${commandData[0]}`);
    }

    /**
     * Answers a `wait-for-report` step with whatever the live subscription has reported.
     *
     * Where the step declared a deadline, the wait is bounded by it and answers the failure chip-tool
     * gives on its own timeout — a step waiting for a report the device never sends must not hold the
     * whole run until the runner gives up on the test.
     */
    async #awaitSubscriptionData(deadline?: Duration): Promise<ChipWebSocketCommandResponse> {
        if (!this.#subscriptionUpdated) {
            throw new ImplementationError("No subscription active");
        }

        if (this.#subscriptionData.length === 0) {
            if (deadline === undefined) {
                await this.#subscriptionUpdated;
            } else {
                const abort = new AbortController();
                const timer = Time.getTimer("Report timeout", deadline, () => abort.abort()).start();
                try {
                    await Promise.race([
                        this.#subscriptionUpdated,
                        new Promise<void>(resolve => abort.signal.addEventListener("abort", () => resolve())),
                    ]);
                } finally {
                    timer.stop();
                }

                if (this.#subscriptionData.length === 0) {
                    logger.error(`No subscription report within ${Duration.format(deadline)}`);
                    return { results: [{ error: "FAILURE" }] };
                }
            }
        }

        const reported = [...this.#subscriptionData];
        this.#subscriptionData.length = 0;
        logger.info("Subscription-Data returns", reported.length, "entries");
        return { results: reported };
    }

    /** Handles an incoming JSON based command */
    async #handleJsonCommand(incoming: IncomingChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        if (!this.#commandHandlers) {
            throw new InternalError("Command handlers not initialized");
        }

        // Arguments is a base64 encoded stringified JSON
        let commandArguments: any;
        const { arguments: base64Arguments } = incoming;
        if (base64Arguments) {
            if (base64Arguments.startsWith("base64:")) {
                try {
                    commandArguments = JSON.parse(Buffer.from(base64Arguments.substring(7), "base64").toString("utf8"));
                } catch (error) {
                    throw new ImplementationError("Failed to parse base64 arguments", { cause: error });
                }
            } else {
                throw new ImplementationError(`Unknown argument encoding: ${base64Arguments}`);
            }
        }

        const data: ChipWebSocketCommand = {
            ...incoming,
            arguments: commandArguments,
        };
        logger.info("Received JSON", toChipJson(data));

        const deadline = stepDeadline(commandArguments);
        if (deadline === undefined) {
            return await this.#dispatchJsonCommand(data);
        }

        // Commissioning and waiting for a commissionee run to their own conclusion, so a deadline on
        // one of those would be a promise this shim cannot keep.
        if (data.cluster === "delay" || data.cluster === "pairing") {
            throw new ImplementationError(
                `A "${data.cluster}" step declared a timeout of ${Duration.format(deadline)}, which this shim ` +
                    "cannot bound: the controller API it drives takes no abort signal",
            );
        }

        // The operation itself observes the signal, so it stops rather than running on unobserved, and
        // the abort reaches the runner as the failure chip-tool gives when its own timeout expires.
        const abort = new AbortController();
        const timer = Time.getTimer("Step timeout", deadline, () =>
            abort.abort(new AbortedError(`The step's own timeout of ${Duration.format(deadline)} expired`)),
        ).start();
        try {
            return await this.#dispatchJsonCommand({ ...data, abort: abort.signal });
        } finally {
            timer.stop();
        }
    }

    async #dispatchJsonCommand(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        // Handles the commands from special testing clusters, else cluster commands
        switch (data.cluster) {
            case "delay": {
                return await this.#handleDelayCommands(data);
            }
            case "pairing": {
                return await this.#handlePairingCommands(data);
            }
            case "any": {
                return await this.#handleAnyCommands(data);
            }
            case "discover": {
                return await this.#handleDiscoverCommands(data);
            }
            default: {
                return await this.#handleClusterCommands(data);
            }
        }
    }

    /** Handles Commands for cluster "delay" */
    async #handleDelayCommands(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            command,
            arguments: {
                nodeId,
                "commissioner-name": commissionerName,
                "expire-existing-session": expireExistingSession,
            },
        } = data;
        if (command !== "wait-for-commissionee") {
            throw new NotImplementedError(`Delay command ${command}`);
        }
        // {"cluster":"delay","command":"wait-for-commissionee","arguments":"base64( { \"nodeId\":\"305414945\" } )"}
        await (
            await this.#commandHandlerFor(commissionerName)
        ).handleDelay({
            nodeId: NodeId(parseNumber(nodeId)),
            expireExistingSession: expireExistingSession !== "false",
        });
        return { results: [] };
    }

    /** Handles Commands for cluster "pairing" */
    async #handlePairingCommands(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const { command, arguments: commandArguments } = data;
        const { "commissioner-name": commissionerName } = commandArguments;

        const handler = await this.#commandHandlerFor(commissionerName);

        switch (command) {
            case "code": {
                const { "node-id": nodeId, payload } = commandArguments;
                try {
                    await handler.handleInitialPairing({
                        nodeId: NodeId(parseNumber(nodeId)),
                        qrCode: payload,
                    });
                    return { results: [] };
                } catch (error) {
                    logger.error("Error commissioning node", error);
                    return failureResponseFor(error);
                }
            }
            case "code-paseonly": {
                const { "node-id": nodeId, payload } = commandArguments;
                try {
                    await handler.handlePaseConnection({
                        nodeId: NodeId(parseNumber(nodeId)),
                        qrCode: payload,
                    });
                    return { results: [] };
                } catch (error) {
                    logger.error("Error connecting to node via PASE", error);
                    return failureResponseFor(error);
                }
            }
            case "get-commissioner-node-id":
                return {
                    results: [
                        {
                            value: {
                                // as number because is that way
                                nodeId: Number(handler.getCommissionerNodeId()),
                            },
                        },
                    ],
                };
            case "get-commissioner-root-certificate": {
                const { RCAC } = handler.getCommissionerRootCertificate();
                return {
                    results: [
                        {
                            value: {
                                RCAC: `base64:${Bytes.toBase64(RCAC)}`,
                            },
                        },
                    ],
                };
            }
            case "issue-noc-chain": {
                const { Elements: elements, "node-id": nodeId } = commandArguments;
                const { RCAC, ICAC, NOC, IPK } = await handler.commissionerIssueNocChain({
                    elements: Bytes.fromHex(elements.substring(4)),
                    nodeId: NodeId(parseNumber(nodeId)),
                });
                return {
                    results: [
                        {
                            value: {
                                RCAC: `base64:${Bytes.toBase64(RCAC)}`,
                                ICAC: `base64:${ICAC ? Bytes.toBase64(ICAC) : ""}`,
                                NOC: `base64:${Bytes.toBase64(NOC)}`,
                                IPK: `base64:${Bytes.toBase64(IPK)}`,
                            },
                        },
                    ],
                };
            }
        }
        throw new NotImplementedError(`Pairing command ${command}`);
    }

    /** Handles Commands for cluster "any" */
    async #handleAnyCommands(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const { command } = data;
        switch (command) {
            case "command-by-id":
                return this.#handlAnyCommandById(data);

            case "read-by-id":
                return this.#handleAnyReadById(data);

            case "write-by-id":
                return this.#handleAnyWriteById(data);

            case "subscribe-by-id":
                return this.#handleAnySubscribeById(data);

            default:
                throw new NotImplementedError(`Any command ${command}`);
        }
    }

    async #handlAnyCommandById(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-id-ignored-for-group-commands": endpointId,
                "cluster-id": clusterId,
                "command-id": commandId,
                timedInteractionTimeoutMs,
                Payload: payload,
            },
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        const commandData = JSON.parse(payload ?? "{}");

        try {
            await handler.handleInvokeById({
                abort: data.abort,
                nodeId: NodeId(parseNumber(destinationId)),
                endpointId: EndpointNumber(parseInt(endpointId)),
                clusterId: ClusterId(parseInt(clusterId)),
                commandId: CommandId(parseInt(commandId)),
                data: Object.keys(commandData).length ? commandData : undefined,
                timedInteractionTimeout:
                    timedInteractionTimeoutMs !== undefined ? Millis(parseInt(timedInteractionTimeoutMs)) : undefined,
            });
            return { results: [] };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    async #handleAnyReadById(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-ids": endpointId,
                "cluster-ids": clusterId,
                "attribute-ids": attributeId,
                "fabric-filtered": fabricFiltered,
            },
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        try {
            const { values, status } = await handler.handleReadAttribute({
                abort: data.abort,
                nodeId: NodeId(parseNumber(destinationId)),
                endpointId: EndpointNumber(parseInt(endpointId)),
                clusterId: ClusterId(parseInt(clusterId)),
                attributeId: AttributeId(parseInt(attributeId)),
                fabricFiltered,
            });
            const firstStatus = status?.find(status => status.status);
            if (firstStatus && firstStatus.status) {
                return {
                    results: [
                        {
                            attributeId: firstStatus.attributeId,
                            clusterId: firstStatus.clusterId,
                            endpointId: firstStatus.endpointId,
                            error: decamelize(Status[firstStatus.status], "_").toUpperCase(),
                        },
                        { error: "FAILURE" },
                    ],
                };
            }
            return {
                results: values,
            };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    async #handleAnyWriteById(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-id-ignored-for-group-commands": endpointId,
                "attribute-values": value,
                "cluster-ids": clusterId,
                "attribute-ids": attributeId,
            },
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        if (value === undefined) {
            throw new ImplementationError("Missing attribute name or value");
        }

        // `{results: []}` is the runner's success shape, so answering it for a payload nothing can read
        // records a write the device never saw as one it accepted
        const parsedValue = parseWritePayload(value, "write-by-id");

        const nodeId = NodeId(parseNumber(destinationId));
        try {
            await handler.handleWriteAttributeById({
                abort: data.abort,
                nodeId,
                endpointId: GroupId.isGroupNodeId(nodeId) ? undefined : EndpointNumber(parseInt(endpointId)),
                clusterId: ClusterId(parseInt(clusterId)),
                attributeId: AttributeId(parseInt(attributeId)),
                value: parsedValue,
            });
            return { results: [] };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    async #handleAnySubscribeById(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-ids": endpointIds,
                "cluster-ids": clusterId,
                "attribute-ids": attributeId,
                "min-interval": minInterval,
                "max-interval": maxInterval,
            },
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        try {
            const { values, updated } = await handler.handleSubscribeAttribute({
                abort: data.abort,
                nodeId: NodeId(parseNumber(destinationId)),
                endpointId: EndpointNumber(parseInt(endpointIds)),
                clusterId: ClusterId(parseInt(clusterId)),
                attributeId: AttributeId(parseInt(attributeId)),
                minInterval: parseInt(minInterval),
                maxInterval: parseInt(maxInterval),
                changeListener: data => {
                    logger.info("Subscribe-Data Update", data);
                    this.#subscriptionData.push(data);
                },
            });
            this.#subscriptionData.length = 0;
            this.#subscriptionUpdated = updated;
            return {
                results: values.map(entry => entry),
            };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    /** Handles commands for cluster "discover" */
    async #handleDiscoverCommands(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            command,
            arguments: { value, "commissioner-name": commissionerName },
        } = data;

        const findBy = discoveryIdentifierFor(command, value);

        try {
            const results = await (
                await this.#commandHandlerFor(commissionerName)
            ).handleDiscovery({
                abort: data.abort,
                findBy,
            });
            return discoveryResponseFor(results, command);
        } catch (error) {
            logger.error("Error on discovery", error);
            return failureResponseFor(error);
        }
    }

    /** Handles commands for official clusters */
    async #handleClusterCommands(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const { command } = data;

        switch (command) {
            case "read":
                return this.#handleClusterReadAttribute(data);

            case "read-event":
                return this.#handleClusterReadEvent(data);

            case "subscribe":
                return this.#handleClusterSubscribeAttribute(data);

            case "subscribe-event":
                return this.#handleClusterSubscribeEvent(data);

            case "force-write":
            case "write":
                return this.#handleClusterWriteAttribute(data);

            default:
                return this.#handleClusterInvokeCommand(data);
        }
    }

    async #handleClusterReadAttribute(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            cluster,
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-ids": endpointIds,
                "fabric-filtered": fabricFiltered,
            },
            command_specifier: commandSpecifier,
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        const clusterData = clusterModelFor(cluster);

        if (commandSpecifier === undefined) {
            throw new ImplementationError("Missing attribute name");
        }
        const attributeModel = attributeModelFor(clusterData, cluster, commandSpecifier);

        try {
            const { values, status } = await handler.handleReadAttribute({
                abort: data.abort,
                nodeId: NodeId(parseNumber(destinationId)),
                endpointId: EndpointNumber(parseInt(endpointIds)),
                clusterId: clusterData.clusterId,
                attributeId: AttributeId(attributeModel.id),
                fabricFiltered: fabricFiltered !== "False",
            });

            if (status !== undefined && status.length > 0) {
                const firstStatus = status.find(status => status.status);
                if (firstStatus && firstStatus.status) {
                    return {
                        results: [
                            { error: decamelize(Status[firstStatus.status], "_").toUpperCase() },
                            { error: "FAILURE" },
                        ],
                    };
                }
            }
            return {
                results: values.map(data => ({
                    ...data,
                    value: convertMatterToWebSocketTagBased(data.value, attributeModel, clusterData.model),
                })),
            };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    async #handleClusterReadEvent(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            cluster,
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-ids": endpointIds,
                "event-min": eventMin,
            },
            command_specifier: commandSpecifier,
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        const clusterData = clusterModelFor(cluster);

        if (commandSpecifier === undefined) {
            throw new ImplementationError("Missing event name");
        }
        const eventModel = eventModelFor(clusterData, cluster, commandSpecifier);
        try {
            const { values, status } = await handler.handleReadEvent({
                abort: data.abort,
                nodeId: NodeId(parseNumber(destinationId)),
                endpointId: EndpointNumber(parseInt(endpointIds)),
                clusterId: clusterData.clusterId,
                eventId: EventId(eventModel.id),
                eventMin: eventMin !== undefined ? EventNumber(eventMin) : undefined,
            });
            if (status !== undefined && status.length > 0) {
                const firstStatus = status.find(status => status.status);
                if (firstStatus && firstStatus.status) {
                    return {
                        results: [
                            { error: decamelize(Status[firstStatus.status], "_").toUpperCase() },
                            { error: "FAILURE" },
                        ],
                    };
                }
            }
            return {
                results: values.map(data => ({
                    ...data,
                    value: convertMatterToWebSocketTagBased(data.value, eventModel, clusterData.model),
                })),
            };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    async #handleClusterSubscribeAttribute(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            cluster,
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-ids": endpointIds,
                "min-interval": minInterval,
                "max-interval": maxInterval,
            },
            command_specifier: commandSpecifier,
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        const clusterData = clusterModelFor(cluster);

        if (commandSpecifier === undefined) {
            throw new ImplementationError("Missing attribute name");
        }
        const attributeModel = attributeModelFor(clusterData, cluster, commandSpecifier);
        try {
            const { values, updated } = await handler.handleSubscribeAttribute({
                abort: data.abort,
                nodeId: NodeId(parseNumber(destinationId)),
                endpointId: EndpointNumber(parseInt(endpointIds)),
                clusterId: clusterData.clusterId,
                attributeId: AttributeId(attributeModel.id),
                minInterval: parseInt(minInterval),
                maxInterval: parseInt(maxInterval),
                changeListener: data => {
                    logger.info("Subscribe-Data Update", data);
                    this.#subscriptionData.push({
                        ...data,
                        value: convertMatterToWebSocketTagBased(data.value, attributeModel, clusterData.model),
                    });
                },
            });
            this.#subscriptionData.length = 0;
            this.#subscriptionUpdated = updated;
            return {
                results: values.map(entry => ({
                    ...entry,
                    value: convertMatterToWebSocketTagBased(entry.value, attributeModel, clusterData.model),
                })),
            };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    async #handleClusterSubscribeEvent(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            cluster,
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-ids": endpointIds,
                "min-interval": minInterval,
                "max-interval": maxInterval,
            },
            command_specifier: commandSpecifier,
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        const clusterData = clusterModelFor(cluster);

        if (commandSpecifier === undefined) {
            throw new ImplementationError("Missing event name");
        }
        const eventModel = eventModelFor(clusterData, cluster, commandSpecifier);
        try {
            const { values, updated } = await handler.handleSubscribeEvent({
                abort: data.abort,
                nodeId: NodeId(parseNumber(destinationId)),
                endpointId: EndpointNumber(parseInt(endpointIds)),
                clusterId: clusterData.clusterId,
                eventId: EventId(eventModel.id),
                minInterval: parseInt(minInterval),
                maxInterval: parseInt(maxInterval),
                changeListener: data => {
                    logger.info("Subscribe-Data Update", data);
                    this.#subscriptionData.push({
                        ...data,
                        value: convertMatterToWebSocketTagBased(data.value, eventModel, clusterData.model),
                    });
                },
            });
            this.#subscriptionData.length = 0;
            this.#subscriptionUpdated = updated;
            return {
                results: values.map(entry => ({
                    ...entry,
                    value: convertMatterToWebSocketTagBased(entry.value, eventModel, clusterData.model),
                })),
            };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    async #handleClusterWriteAttribute(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            cluster,
            arguments: {
                "destination-id": destinationId,
                "commissioner-name": commissionerName,
                "endpoint-id-ignored-for-group-commands": endpointId,
                "attribute-values": value,
            },
            command_specifier: commandSpecifier,
        } = data;
        const handler = await this.#commandHandlerFor(commissionerName);

        const clusterData = clusterModelFor(cluster);

        if (commandSpecifier === undefined) {
            throw new ImplementationError("Missing attribute name");
        }
        if (value === undefined) {
            throw new ImplementationError(`Missing value for the write of ${cluster}.${commandSpecifier}`);
        }
        const attributeModel = attributeModelFor(clusterData, cluster, commandSpecifier);
        let parsedValue: unknown = value;
        if (
            typeof value === "string" &&
            ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}")))
        ) {
            parsedValue = parseWritePayload(value, `write of ${cluster}.${commandSpecifier}`);
        }
        const matterValue = convertWebsocketDataToMatter(parsedValue, attributeModel);
        const nodeId = NodeId(parseNumber(destinationId));
        try {
            await handler.handleWriteAttribute({
                abort: data.abort,
                nodeId,
                endpointId: GroupId.isGroupNodeId(nodeId) ? undefined : EndpointNumber(parseInt(endpointId)),
                clusterId: clusterData.clusterId,
                attributeName: attributeModel.propertyName,
                value: matterValue,
            });
            return { results: [] };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    async #handleClusterInvokeCommand(data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const { command, cluster, arguments: commandArguments } = data;
        const {
            "destination-id": destinationId,
            "commissioner-name": commissionerName,
            "endpoint-id-ignored-for-group-commands": endpointId,
            timedInteractionTimeoutMs,
        } = commandArguments;
        const handler = await this.#commandHandlerFor(commissionerName);

        const clusterData = clusterModelFor(cluster);

        const commandData = {} as any;
        Object.keys(commandArguments).forEach(key => {
            if (
                key !== "destination-id" &&
                key !== "commissioner-name" &&
                key !== "endpoint-id-ignored-for-group-commands" &&
                key !== "timedInteractionTimeoutMs" &&
                key !== "timeout"
            ) {
                commandData[camelize(key)] = commandArguments[key];
            }
        });
        const commandModel = commandModelFor(clusterData, cluster, command);
        const nodeId = NodeId(parseNumber(destinationId));
        const isGroupNode = GroupId.isGroupNodeId(nodeId);
        try {
            const result = await handler.handleInvoke({
                abort: data.abort,
                nodeId,
                endpointId: isGroupNode ? undefined : EndpointNumber(parseInt(endpointId)),
                clusterId: clusterData.clusterId,
                commandId: CommandId(commandModel.id),
                data: convertWebsocketDataToMatter(
                    Object.keys(commandData).length ? commandData : undefined,
                    commandModel,
                ),
                timedInteractionTimeout:
                    timedInteractionTimeoutMs !== undefined ? Millis(parseInt(timedInteractionTimeoutMs)) : undefined,
                suppressResponse: isGroupNode,
            });
            if (result && commandModel.responseModel) {
                return {
                    results: [
                        {
                            clusterId: clusterData.clusterId,
                            commandId: commandModel.responseModel.id,
                            endpointId: parseInt(endpointId),
                            value: convertMatterToWebSocketTagBased(
                                result,
                                commandModel.responseModel,
                                clusterData.model,
                            ),
                        },
                    ],
                };
            }
            return { results: [] };
        } catch (error) {
            return await this.#handleError(error, data);
        }
    }

    /** Recode Errors into the expected response */
    async #handleError(error: unknown, data: ChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        const {
            command,
            cluster,
            arguments: { "destination-id": destinationId, "commissioner-name": commissionerName },
            command_specifier: commandSpecifier,
        } = data;
        const sre = StatusResponseError.of(error);
        if (sre) {
            return {
                results: [
                    { error: decamelize(Status[sre.code], "_").toUpperCase(), clusterError: sre.clusterCode },
                    { error: "FAILURE" },
                ],
            };
        }
        if (causedBy(error, TransientPeerCommunicationError, NodeNotConnectedError, RetransmissionLimitReachedError)) {
            // Needed because Chip tests expect a failure and not an automatic reconnection
            await (await this.#commandHandlerFor(commissionerName)).disconnectNode(NodeId(parseNumber(destinationId)));
        }
        logger.error(
            `Error for command "${command}" and cluster "${cluster}" and specifier "${commandSpecifier}"`,
            error,
        );
        return failureResponseFor(error);
    }

    close() {
        this.#wsServer?.close();
    }
}
