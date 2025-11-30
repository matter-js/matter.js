/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Diagnostic, Logger, LogLevel, Millis } from "@matter/general";
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
    StatusCode,
    StatusResponseError,
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
import { CommissionableDeviceIdentifiers, RetransmissionLimitReachedError } from "@matter/protocol";
import { WebSocketServer } from "ws";
import { log } from "./GenericTestApp.js";
import { AttributeResponseData, EventResponseData } from "./handler/CommandHandler.js";
import { LegacyControllerCommandHandler } from "./handler/LegacyControllerCommandHandler.js";

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
    [LogLevel.FATAL]: "Fatal",
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
        throw new Error(`Failed to parse number: ${number}`);
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
 * Uses the matter.js Model to convert the response data for read, subscribe and invoke into a tag based response
 * including conversion of data types.
 */
function convertMatterToWebSocketTagBased(value: unknown, model: ValueModel, clusterModel: ClusterModel): unknown {
    if (value === null) {
        return null;
    }
    if (Array.isArray(value) && model.type === "list") {
        return value.map(v => convertMatterToWebSocketTagBased(v, model.members[0], clusterModel));
    }
    if (isObject(value) && model.metabase?.name === "struct") {
        const valueKeys = Object.keys(value);
        const result: { [key: string]: any } = {};
        for (const member of model.members) {
            const name = camelize(member.name);
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
                member.name !== undefined && value[camelize(member.name)]
                    ? value[camelize(member.name)]
                    : member.description !== undefined && value[camelize(member.description)]
                      ? value[camelize(member.description)]
                      : undefined;

            if (!memberValue) {
                continue;
            }
            if (typeof memberValue !== "boolean" && typeof memberValue !== "number") {
                throw new Error("Invalid bitmap value", memberValue);
            }

            const constraintValue = FieldValue.numericValue(member.constraint.value);
            if (constraintValue !== undefined) {
                numberValue |= 1 << constraintValue;
            } else {
                const minBit = FieldValue.numericValue(member.constraint.min) ?? 0;
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

/** Use the matter.js model to convert the incoming data for write and invoke commands into the expected format. */
function convertWebsocketDataToMatter(value: any, model: ValueModel): any {
    logger.warn(
        "convertWebsocketDataToMatter",
        Diagnostic.json(value),
        model.type,
        model.metatype,
        model.metabase?.metatype,
    );
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
            return value.map(v => convertWebsocketDataToMatter(v, model.members[0]));
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
                    result[camelize(member.name)] = convertWebsocketDataToMatter(value[key], member);
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
        if (model.metabase?.metatype === "bytes" && value.startsWith("hex:")) {
            return Bytes.fromHex(value.slice(4));
        }

        if (model.metabase?.metatype === "bitmap") {
            const numberValue = parseInt(value);
            if (isNaN(numberValue)) {
                throw new Error("Invalid bitmap value");
            }
            const bitmapValue: { [key: string]: boolean } = {};
            model.members.forEach(member => {
                if (
                    member.constraint !== undefined &&
                    member.name !== undefined &&
                    numberValue & (1 << parseInt(member.constraint as unknown as string))
                ) {
                    bitmapValue[camelize(member.name)] = true;
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
    #commandHandlers?: Map<string, LegacyControllerCommandHandler>;
    #startRecording?: () => void;
    #stopRecording?: () => { module: string; category: string; message: string }[];
    readonly #subscriptionData = new Array<AttributeResponseData | EventResponseData>();
    #subscriptionUpdated?: Observable<[void]>; // Tests basically just have one subscription, so this is fine

    constructor(wsPort: number) {
        this.#wsPort = wsPort;
    }

    initialize(commandHandlers: Map<string, LegacyControllerCommandHandler>) {
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
            throw new Error(`Unknown controller: ${controllerName}`);
        }
        // Do start the controllers just if needed
        if (!handler.started) {
            await handler.start();
        }
        return handler;
    }

    start() {
        this.#wsServer = new WebSocketServer({ host: "127.0.0.1", port: this.#wsPort }, () => {
            logger.info(`WebSocketServer started on port ${this.#wsPort}`);
            log.directive("== WebSocket Server Ready"); // Testrunner uses this to detect that WS server has been started
        });

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
            result = { results: [{ error: (error as Error).message }, { error: "FAILURE" }] };
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
            throw new Error("Command handlers not initialized");
        }

        logger.info("Received Text based command:", data);

        // Empty data means we return the subscription data
        if (data === "") {
            if (!this.#subscriptionUpdated) {
                throw new Error("No subscription active");
            }
            if (this.#subscriptionData.length === 0) {
                // If no data are there we wait for next subscription update
                await this.#subscriptionUpdated;
            }
            const data = [...this.#subscriptionData];
            this.#subscriptionData.length = 0;
            logger.info("Subscription-Data returns", data.length, "entries");
            return { results: data };
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
                            return { results: [{ error: "FAILURE" }] };
                        }
                    default:
                        throw new Error(`Unknown pairing text command: ${commandData[1]}`);
                }
            }
        }
        throw new Error(`Unknown text command: ${commandData[0]}`);
    }

    /** Handles an incoming JSON based command */
    async #handleJsonCommand(incoming: IncomingChipWebSocketCommand): Promise<ChipWebSocketCommandResponse> {
        if (!this.#commandHandlers) {
            throw new Error("Command handlers not initialized");
        }

        // Arguments is a base64 encoded stringified JSON
        let commandArguments: any;
        const { arguments: base64Arguments } = incoming;
        if (base64Arguments) {
            if (base64Arguments.startsWith("base64:")) {
                try {
                    commandArguments = JSON.parse(Buffer.from(base64Arguments.substring(7), "base64").toString("utf8"));
                } catch (error) {
                    throw new Error(`Failed to parse base64 arguments: ${error}`);
                }
            } else {
                throw new Error(`Unknown argument encoding: ${base64Arguments}`);
            }
        }

        const data: ChipWebSocketCommand = {
            ...incoming,
            arguments: commandArguments,
        };
        logger.info("Received JSON", toChipJson(data));

        const { cluster } = data;

        // Handles the commands from special testing clusters, else cluster commands
        switch (cluster) {
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
            throw new Error(`Unknown delay command: ${command}`);
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
                    return { results: [{ error: "FAILURE" }] };
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
                    return { results: [{ error: "FAILURE" }] };
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
        throw new Error(`Unknown pairing command: ${command}`);
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
                throw new Error(`Unknown any command: ${command}`);
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
                            error: decamelize(StatusCode[firstStatus.status], "_").toUpperCase(),
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
            throw new Error("Missing attribute name or value");
        }

        let parsedValue: any = value;
        try {
            parsedValue = JSON.parse(value);
        } catch (err) {
            logger.error("Error parsing data for write-by-id", err);
            return { results: [] };
        }

        const nodeId = NodeId(parseNumber(destinationId));
        try {
            await handler.handleWriteAttributeById({
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

        let findBy: CommissionableDeviceIdentifiers | undefined;
        switch (command) {
            case "find-commissionable-by-long-discriminator": {
                findBy = { longDiscriminator: parseInt(value) };
                break;
            }
            case "find-commissionable-by-short-discriminator": {
                findBy = { shortDiscriminator: parseInt(value) };
                break;
            }

            case "find-commissionable-by-vendor-id": {
                findBy = { vendorId: parseInt(value) };
                break;
            }
            case "find-commissionable-by-device-type": {
                findBy = { deviceType: parseInt(value) };
                break;
            }
            case "find-commissionable-by-commissioning-mode":
            case "commissionables": {
                findBy = {};
            }
        }
        if (findBy === undefined) {
            throw new Error("Missing find by details");
        }

        try {
            const results = await (
                await this.#commandHandlerFor(commissionerName)
            ).handleDiscovery({
                findBy,
            });
            return { results };
        } catch (error) {
            logger.error("Error on discovery", error);
            return { results: [{ error: "FAILURE" }] };
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

        const clusterData = ClusterMap[camelize(cluster).toLowerCase()];

        if (commandSpecifier === undefined) {
            throw new Error("Missing attribute name");
        }
        const attributeName = camelize(commandSpecifier);
        const attributeModel = clusterData.attributes[attributeName.toLowerCase()] ?? GlobalAttributes[attributeName];

        try {
            const { values, status } = await handler.handleReadAttribute({
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
                            { error: decamelize(StatusCode[firstStatus.status], "_").toUpperCase() },
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

        const clusterData = ClusterMap[camelize(cluster).toLowerCase()];

        if (commandSpecifier === undefined) {
            throw new Error("Missing event name");
        }
        const eventName = camelize(commandSpecifier);

        const eventModel = clusterData.events[eventName.toLowerCase()];
        try {
            const { values, status } = await handler.handleReadEvent({
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
                            { error: decamelize(StatusCode[firstStatus.status], "_").toUpperCase() },
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

        const clusterData = ClusterMap[camelize(cluster).toLowerCase()];

        if (commandSpecifier === undefined) {
            throw new Error("Missing attribute name");
        }
        const attributeName = camelize(commandSpecifier);
        if (attributeName === undefined) {
            throw new Error("Missing attribute name");
        }
        const attributeModel = clusterData.attributes[attributeName.toLowerCase()] ?? GlobalAttributes[attributeName];
        try {
            const { values, updated } = await handler.handleSubscribeAttribute({
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

        const clusterData = ClusterMap[camelize(cluster).toLowerCase()];

        if (commandSpecifier === undefined) {
            throw new Error("Missing event name");
        }
        const eventName = camelize(commandSpecifier);

        const eventModel = clusterData.events[eventName.toLowerCase()];
        try {
            const { values, updated } = await handler.handleSubscribeEvent({
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

        const clusterData = ClusterMap[camelize(cluster).toLowerCase()];

        if (commandSpecifier === undefined) {
            throw new Error("Missing attribute name");
        }
        const attributeName = camelize(commandSpecifier);
        if (value === undefined) {
            throw new Error("Missing attribute name or value");
        }
        const attributeModel = clusterData.attributes[attributeName.toLowerCase()] ?? GlobalAttributes[attributeName];
        let parsedValue: any = value;
        if (
            typeof value === "string" &&
            ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}")))
        ) {
            try {
                parsedValue = JSON.parse(value);
            } catch (err) {
                logger.error("Error on parsing value for write", err);
                return { results: [] };
            }
        }
        const matterValue = convertWebsocketDataToMatter(parsedValue, attributeModel);
        const nodeId = NodeId(parseNumber(destinationId));
        try {
            await handler.handleWriteAttribute({
                nodeId,
                endpointId: GroupId.isGroupNodeId(nodeId) ? undefined : EndpointNumber(parseInt(endpointId)),
                clusterId: clusterData.clusterId,
                attributeName: camelize(attributeModel.name),
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

        const clusterData = ClusterMap[camelize(cluster).toLowerCase()];

        const commandData = {} as any;
        Object.keys(commandArguments).forEach(key => {
            if (
                key !== "destination-id" &&
                key !== "commissioner-name" &&
                key !== "endpoint-id-ignored-for-group-commands" &&
                key !== "timedInteractionTimeoutMs"
            ) {
                commandData[camelize(key)] = commandArguments[key];
            }
        });
        const commandName = camelize(command);
        const commandModel = clusterData.commands[commandName.toLowerCase()];
        const nodeId = NodeId(parseNumber(destinationId));
        const isGroupNode = GroupId.isGroupNodeId(nodeId);
        try {
            const result = await handler.handleInvoke({
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
        if (error instanceof StatusResponseError) {
            return {
                results: [
                    { error: decamelize(StatusCode[error.code], "_").toUpperCase(), clusterError: error.clusterCode },
                    { error: "FAILURE" },
                ],
            };
        }
        if (error instanceof RetransmissionLimitReachedError) {
            // Needed because Chip tests expect a failure and not an automatic reconnection
            await (await this.#commandHandlerFor(commissionerName)).disconnectNode(NodeId(parseNumber(destinationId)));
        }
        logger.error(
            `Error for command "${command}" and cluster "${cluster}" and specifier "${commandSpecifier}"`,
            error,
        );
        return { results: [{ error: "FAILURE" }] };
    }

    close() {
        this.#wsServer?.close();
    }
}
