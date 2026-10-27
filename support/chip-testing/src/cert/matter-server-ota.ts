/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Diagnostic,
    Duration,
    isObject,
    Logger,
    MatterError,
    Millis,
    Minutes,
    type Observable,
    Seconds,
    StandardCrypto,
    Time,
    UnexpectedDataError,
} from "@matter/general";
import { BasicInformation, OtaSoftwareUpdateRequestor } from "@matter/main/clusters";
import { BdxReceiveAcceptMessage, BdxReceiveInitMessage, FileDesignator, OtaImageWriter } from "@matter/main/protocol";
import type { NodeId } from "@matter/main/types";
import type {
    AttributePathSpec,
    AttributeReadEntry,
    BdxTransferAccept,
    BdxTransferProposal,
    CertNodeRef,
    LogFollower,
    LogLine,
    OtaBdxTransfer,
    OtaProviderExchanges,
    OtaQueryImageRequestRecord,
    OtaQueryImageResponseRecord,
    ServeOtaUpdateOptions,
} from "@matter/testing";
import { CertLogTimeoutError } from "@matter/testing";
import { decodeInteractionReport } from "../matter-server/matter-server-wire.js";
import { OTA_TEST_PAYLOAD_SIZE, otaTestPayload, otaTestSoftwareVersionString } from "../OtaTestIdentity.js";

const logger = Logger.get("MatterServerOta");

/** The whole exchange `serveOtaUpdate` drives when the caller names no budget, as the in-process adapter allows. */
const OTA_TRANSFER_TIMEOUT = Minutes(2);

/** How long to wait for the requestor's `ApplyUpdateRequest` once the download is complete. */
const OTA_APPLY_TIMEOUT = Seconds(30);

/** How long the server may take to log what it already did, once the requestor reported it. */
const LOG_LAG = Seconds(10);

/** `UpdateStateEnum` and `ChangeReasonEnum` of the requestor cluster (Core § 11.20.7.4). */
const UpdateState = OtaSoftwareUpdateRequestor.UpdateState;
const ChangeReason = OtaSoftwareUpdateRequestor.ChangeReason;

const STATE_TRANSITION = OtaSoftwareUpdateRequestor.Cluster.events.stateTransition.id;
const DOWNLOAD_ERROR = OtaSoftwareUpdateRequestor.Cluster.events.downloadError.id;

/** An OTA update the server did not serve to its end, by what the requestor or the server's own log reported. */
export class MatterServerOtaError extends MatterError {}

/** What {@link serveOtaUpdateThroughServer} needs of the adapter and of the node API it runs for. */
export interface MatterServerOtaHost {
    readonly nodeId: NodeId;

    /** The server's log, which carries the provider's own account of the update. */
    readonly log: LogFollower;

    command(command: string, args: object, timeout?: Duration): Promise<unknown>;

    /**
     * Resolves once the server's own subscription to the node is active, switching it on once; `true` where this call
     * switched it on.
     */
    enableAutoSubscription(): Promise<boolean>;

    /** Switches the server's own subscription to the node off again. */
    disableAutoSubscription(): Promise<void>;

    /** Resolves once the server forwards node events to this connection. */
    startListening(): Promise<void>;

    /** What the server pushes to this connection, `node_event` among it. */
    readonly events: Observable<[event: string, data: unknown]>;

    readAttributes(paths: AttributePathSpec[]): Promise<AttributeReadEntry[]>;

    /** The node id the server holds on the node's fabric, in the form `commission()` answers with. */
    ownNodeId(): Promise<CertNodeRef>;

    /** Stores an OTA image through the server's HTTP upload, `initiate_ota_upload` first. */
    upload(image: Uint8Array): Promise<void>;
}

/**
 * Serves the node an update one software version newer than it runs, with the server's own OTA provider, as an
 * administrator does: the image goes in through the server's upload, `update_node` starts the update, and the
 * requestor's own `StateTransition` and `DownloadError` events, which the server's subscription forwards as
 * `node_event`, say how the download went.
 *
 * The WebSocket API reports nothing of what the provider answered or what its BDX session negotiated and moved. The
 * server logs all of it through matter.js, so the record comes from its log: the provider's `QueryImage`,
 * `ApplyUpdateRequest` and `NotifyUpdateApplied` exchanges with their fields, the `ReceiveInit` and `ReceiveAccept` of
 * the BDX session, and the blocks it sent.
 */
export async function serveOtaUpdateThroughServer(
    host: MatterServerOtaHost,
    options?: ServeOtaUpdateOptions,
): Promise<OtaBdxTransfer> {
    // The server's provider serves only a node it subscribes to itself. One this call switched on is switched off
    // again, so the later steps of the case see no re-subscriptions of it
    const switchedOn = await host.enableAutoSubscription();
    try {
        return await serveWhileSubscribed(host, options);
    } finally {
        if (switchedOn) {
            await switchOffSubscription(host);
        }
    }
}

/**
 * A failure is logged and does not fail an update that went through; the later steps of the case may then see the
 * server's re-subscriptions.
 */
async function switchOffSubscription(host: MatterServerOtaHost) {
    try {
        await host.disableAutoSubscription();
    } catch (error) {
        logger.warn(`Switching the server's subscription to node ${host.nodeId} off failed:`, error);
    }
}

async function serveWhileSubscribed(
    host: MatterServerOtaHost,
    options?: ServeOtaUpdateOptions,
): Promise<OtaBdxTransfer> {
    const { nodeId, log } = host;
    const timeout = options?.timeoutMs === undefined ? OTA_TRANSFER_TIMEOUT : Millis(options.timeoutMs);

    const identity = await identityOf(host);
    const softwareVersion = identity.softwareVersion + 1;
    const { image } = await OtaImageWriter.create(new StandardCrypto(), {
        vendorId: identity.vendorId,
        productId: identity.productId,
        softwareVersion,
        softwareVersionString: otaTestSoftwareVersionString(`server-${nodeId}`),
        minApplicableSoftwareVersion: 0,
        maxApplicableSoftwareVersion: identity.softwareVersion,
        payload: otaTestPayload(OTA_TEST_PAYLOAD_SIZE),
    });
    const fileSize = image.byteLength;
    await host.upload(Bytes.of(image));
    await host.startListening();
    const providerNodeId = await host.ownNodeId();

    await log.settled();
    const from = log.lines.length;
    const progress = new RequestorProgress(host.events, nodeId);
    const deadline = Time.nowUs + timeout;
    try {
        await host.command("update_node", { node_id: nodeId, software_version: softwareVersion }, timeout);
        await progress.downloaded(timeout, deadline);
    } finally {
        progress.close();
    }

    const session = await bdxSessionIn(log, nodeId, from);

    const expectApply = options?.expectApply ?? true;
    let applyAcknowledged = false;
    if (expectApply) {
        const applyTimeout = options?.applyTimeoutMs === undefined ? OTA_APPLY_TIMEOUT : Millis(options.applyTimeoutMs);
        const answer = await providerAnswer(log, nodeId, "applyUpdateRequest", from, applyTimeout);
        applyAcknowledged = answer !== undefined && Number(fieldsOf(answer.text, APPLY_RESPONSE_FIELDS).action) === 0;
        if (applyAcknowledged && options?.notifyAppliedTimeoutMs !== undefined) {
            await providerAnswer(log, nodeId, "notifyUpdateApplied", from, Millis(options.notifyAppliedTimeoutMs));
        }
    }

    let observed = Millis(0);
    if (options?.observeAfterMs !== undefined) {
        const observeFor = Millis(options.observeAfterMs);
        const observingSince = Time.nowUs;
        while (observed < observeFor) {
            await Time.sleep("cert OTA post-apply observation", Millis(Math.ceil(observeFor - observed)));
            observed = Millis(Time.nowUs - observingSince);
        }
    }

    await log.settled();
    return {
        providerEndpoint: providerEndpointIn(log, nodeId, from),
        providerNodeId,
        softwareVersion,
        fileSize,
        proposal: session.proposal,
        accept: session.accept,
        transferredBytes: transferredBytesOf(linesFrom(log, from), session.exchange),
        applyAcknowledged,
        observedMs: observed,
        exchanges: providerExchangesOf(linesFrom(log, from), nodeId),
    };
}

/** Vendor, product and software version the node reports, which the provider checks an image against. */
async function identityOf(host: MatterServerOtaHost) {
    const attributes = BasicInformation.Cluster.attributes;
    const entries = await host.readAttributes([
        { endpoint: 0, cluster: BasicInformation.Cluster.id, attribute: attributes.vendorId.id },
        { endpoint: 0, cluster: BasicInformation.Cluster.id, attribute: attributes.productId.id },
        { endpoint: 0, cluster: BasicInformation.Cluster.id, attribute: attributes.softwareVersion.id },
    ]);
    const valueOf = (attribute: number) => entries.find(entry => entry.attribute === attribute)?.value;
    const vendorId = valueOf(attributes.vendorId.id);
    const productId = valueOf(attributes.productId.id);
    const softwareVersion = valueOf(attributes.softwareVersion.id);
    if (typeof vendorId !== "number" || typeof productId !== "number" || typeof softwareVersion !== "number") {
        throw new UnexpectedDataError(
            `Node ${host.nodeId} reported no vendor, product and software version: ${Diagnostic.json(entries)}`,
        );
    }
    return { vendorId, productId, softwareVersion };
}

/**
 * The requestor's own account of the download: its `StateTransition` out of `Downloading`, or a `DownloadError`, as
 * the server's subscription forwards them.
 */
class RequestorProgress {
    readonly #events: Observable<[event: string, data: unknown]>;
    readonly #nodeId: NodeId;
    readonly #listener: (event: string, data: unknown) => void;
    #outcome?: { error?: MatterServerOtaError };
    #wake?: () => void;

    constructor(events: Observable<[event: string, data: unknown]>, nodeId: NodeId) {
        this.#events = events;
        this.#nodeId = nodeId;
        this.#listener = (event, data) => this.#onEvent(event, data);
        events.on(this.#listener);
    }

    /** Waits until `deadline` on the monotonic clock; `timeout` is the whole budget it ends, for the message. */
    async downloaded(timeout: Duration, deadline: number) {
        while (this.#outcome === undefined) {
            const remaining = deadline - Time.nowUs;
            if (remaining <= 0) {
                throw new MatterServerOtaError(
                    `Node ${this.#nodeId} reported no end of its download within ${Duration.format(timeout)}`,
                );
            }
            await new Promise<void>(resolve => {
                const timer = Time.getTimer("matterjs-server OTA progress", Millis(remaining), () => resolve()).start();
                this.#wake = () => {
                    timer.stop();
                    resolve();
                };
            });
        }
        if (this.#outcome.error !== undefined) {
            throw this.#outcome.error;
        }
    }

    close() {
        this.#events.off(this.#listener);
    }

    #onEvent(event: string, data: unknown) {
        if (
            event !== "node_event" ||
            !isObject(data) ||
            (typeof data.node_id !== "number" && typeof data.node_id !== "bigint") ||
            BigInt(data.node_id) !== BigInt(this.#nodeId)
        ) {
            return;
        }
        if (data.cluster_id !== OtaSoftwareUpdateRequestor.Cluster.id) {
            return;
        }
        const [decoded] = decodeInteractionReport({ attributes: {}, events: [data] }).events;
        if (decoded.result.kind !== "value" || !isObject(decoded.result.value)) {
            return;
        }
        const value = decoded.result.value;

        if (decoded.event === DOWNLOAD_ERROR) {
            this.#settle(
                new MatterServerOtaError(`Node ${this.#nodeId} reported a download error: ${Diagnostic.json(value)}`),
            );
            return;
        }
        if (decoded.event !== STATE_TRANSITION || value.previousState !== UpdateState.Downloading) {
            return;
        }
        if (value.newState === UpdateState.Downloading) {
            return;
        }
        this.#settle(
            value.reason === ChangeReason.Success
                ? undefined
                : new MatterServerOtaError(
                      `Node ${this.#nodeId} left Downloading for state ${value.newState} with reason ${value.reason}`,
                  ),
        );
    }

    #settle(error?: MatterServerOtaError) {
        this.#outcome ??= { error };
        this.#wake?.();
    }
}

function* linesFrom(log: LogFollower, from: number): Generator<LogLine> {
    for (let index = from, line = log.at(index); line !== undefined; line = log.at(++index)) {
        if (!line.synthetic) {
            yield line;
        }
    }
}

/**
 * `@<fabric index>:<peer node id in hex>•<session>⇵<exchange>`, which matter.js puts on every line of an exchange. The
 * session carries its transport where it is not UDP, as `•442c(tcp)`.
 */
function exchangeOf(nodeId: NodeId) {
    return String.raw`@[0-9a-f]+:${nodeId.toString(16)}•[0-9a-f]+(?:\(\w+\))?⇵[0-9a-f]+`;
}

const QUERY_REQUEST_FIELDS = [
    "vendorId",
    "productId",
    "softwareVersion",
    "protocolsSupported",
    "hardwareVersion",
    "location",
    "requestorCanConsent",
    "metadataForProvider",
];
const QUERY_RESPONSE_FIELDS = [
    "status",
    "delayedActionTime",
    "imageUri",
    "softwareVersion",
    "softwareVersionString",
    "updateToken",
    "userConsentNeeded",
    "metadataForRequestor",
];
const APPLY_REQUEST_FIELDS = ["updateToken", "newVersion"];
const APPLY_RESPONSE_FIELDS = ["action", "delayedActionTime"];
const NOTIFY_REQUEST_FIELDS = ["updateToken", "softwareVersion"];

type ProviderCommand = "queryImage" | "applyUpdateRequest" | "notifyUpdateApplied";

/**
 * A line of the provider's handling of `command` from `nodeId`: matter.js logs each request it received (`«`) and
 * each response it sent (`»`) with the command's fields, under the request's message id.
 */
function providerLinePattern(nodeId: NodeId, command: ProviderCommand, direction: "«" | "»") {
    return new RegExp(
        String.raw`ProtocolService Invoke ${direction} \S+\.otaSoftwareUpdateProvider\.${command} ` +
            String.raw`(${exchangeOf(nodeId)}✉[0-9a-f]+)(?: (.*))?$`,
    );
}

/** The provider's response to the first `command` from `nodeId` at or after `from`, waited for up to `timeout`. */
async function providerAnswer(
    log: LogFollower,
    nodeId: NodeId,
    command: ProviderCommand,
    from: number,
    timeout: Duration,
): Promise<LogLine | undefined> {
    try {
        return await log.expectPattern(providerLinePattern(nodeId, command, "»"), { from, timeoutMs: timeout });
    } catch (error) {
        if (error instanceof CertLogTimeoutError) {
            return undefined;
        }
        throw error;
    }
}

/**
 * Every OTA command the provider answered `nodeId` in `lines`, with the fields the server logged for both sides, in
 * the order it answered them.
 */
export function providerExchangesOf(lines: Iterable<LogLine>, nodeId: NodeId): OtaProviderExchanges {
    const commands: ProviderCommand[] = ["queryImage", "applyUpdateRequest", "notifyUpdateApplied"];
    const patterns = commands.map(command => ({
        command,
        request: providerLinePattern(nodeId, command, "«"),
        response: providerLinePattern(nodeId, command, "»"),
    }));
    const requests = new Map<string, { fields: string; at: number }>();
    const exchanges: OtaProviderExchanges = { queryImage: [], applyUpdate: [], notifyUpdateApplied: [] };

    for (const line of lines) {
        for (const { command, request, response } of patterns) {
            const received = request.exec(line.text);
            if (received !== null) {
                requests.set(received[1], { fields: received[2] ?? "", at: line.at.getTime() });
                if (command === "notifyUpdateApplied") {
                    const fields = fieldsOf(received[2] ?? "", NOTIFY_REQUEST_FIELDS);
                    exchanges.notifyUpdateApplied.push({
                        updateToken: fields.updateToken ?? "",
                        softwareVersion: Number(fields.softwareVersion),
                        receivedAtMs: line.at.getTime(),
                    });
                }
                break;
            }

            const answered = response.exec(line.text);
            if (answered === null) {
                continue;
            }
            const asked = requests.get(answered[1]);
            if (asked === undefined) {
                break;
            }
            if (command === "queryImage") {
                exchanges.queryImage.push({
                    request: queryRequestOf(fieldsOf(asked.fields, QUERY_REQUEST_FIELDS)),
                    response: queryResponseOf(fieldsOf(answered[2] ?? "", QUERY_RESPONSE_FIELDS)),
                    receivedAtMs: asked.at,
                });
            } else if (command === "applyUpdateRequest") {
                const request = fieldsOf(asked.fields, APPLY_REQUEST_FIELDS);
                const answer = fieldsOf(answered[2] ?? "", APPLY_RESPONSE_FIELDS);
                exchanges.applyUpdate.push({
                    request: { updateToken: request.updateToken ?? "", newVersion: Number(request.newVersion) },
                    response: { action: Number(answer.action), delayedActionTime: Number(answer.delayedActionTime) },
                    receivedAtMs: asked.at,
                });
            }
            break;
        }
    }
    return exchanges;
}

function queryRequestOf(fields: Record<string, string | undefined>): OtaQueryImageRequestRecord {
    return {
        vendorId: Number(fields.vendorId),
        productId: Number(fields.productId),
        softwareVersion: Number(fields.softwareVersion),
        protocolsSupported: (fields.protocolsSupported?.match(/\d+/g) ?? []).map(Number),
        hardwareVersion: optionalNumber(fields.hardwareVersion),
        location: fields.location,
        requestorCanConsent: optionalBoolean(fields.requestorCanConsent),
        metadataForProvider: fields.metadataForProvider,
    };
}

function queryResponseOf(fields: Record<string, string | undefined>): OtaQueryImageResponseRecord {
    return {
        status: Number(fields.status),
        delayedActionTime: optionalNumber(fields.delayedActionTime),
        imageUri: fields.imageUri,
        softwareVersion: optionalNumber(fields.softwareVersion),
        softwareVersionString: fields.softwareVersionString,
        updateToken: fields.updateToken,
        userConsentNeeded: optionalBoolean(fields.userConsentNeeded),
        metadataForRequestor: fields.metadataForRequestor,
    };
}

function optionalNumber(value: string | undefined) {
    return value === undefined ? undefined : Number(value);
}

function optionalBoolean(value: string | undefined) {
    return value === undefined ? undefined : value === "true";
}

/**
 * The fields of matter.js's `name: value name: value …` rendering of a command, read up to the next of `names`, so a
 * value may hold spaces.
 */
export function fieldsOf(text: string, names: string[]): Record<string, string | undefined> {
    const starts = new Array<{ name: string; at: number; value: number }>();
    for (const name of names) {
        const match = new RegExp(String.raw`(?:^| )${name}: `).exec(text);
        if (match !== null) {
            starts.push({ name, at: match.index, value: match.index + match[0].length });
        }
    }
    starts.sort((a, b) => a.at - b.at);
    const fields: Record<string, string | undefined> = {};
    starts.forEach(({ name, value }, index) => {
        fields[name] = text.slice(value, starts[index + 1]?.at ?? text.length).trim();
    });
    return fields;
}

/**
 * The OTA download's BDX session in the server's log: its exchange and what it negotiated.
 *
 * The session is the one the requestor completed with a `BlockAckEof`. A requestor may abort a download and retry it on
 * a new exchange, so the first `ReceiveInit` after `from` can belong to a session that never ended.
 */
async function bdxSessionIn(log: LogFollower, nodeId: NodeId, from: number) {
    const end = await logLine(
        log,
        new RegExp(String.raw`Message « for: BDX/BlockAckEof id: (${exchangeOf(nodeId)})✉`),
        from,
        `the BlockAckEof that ends node ${nodeId}'s download`,
    );
    const [, session] = end.match;
    const sessionPattern = escaped(session);

    const init = lastLineIn(
        log,
        new RegExp(String.raw`Message « for: BDX/ReceiveInit id: ${sessionPattern}✉\S+ .* payload: ([0-9a-f]+)$`),
        from,
        end.line.index,
        `the ReceiveInit node ${nodeId} opened its download with`,
    );
    const proposal = proposalOf(Bytes.fromHex(init.match[1]));
    if (!proposal.fileDesignator.startsWith("ota/")) {
        throw new MatterServerOtaError(
            `Node ${nodeId} opened a BDX session for ${proposal.fileDesignator}, which is no OTA image`,
        );
    }

    const accept = lastLineIn(
        log,
        new RegExp(String.raw`Message » for: BDX/ReceiveAccept .*id: ${sessionPattern}✉\S+ .* payload: ([0-9a-f]+)$`),
        init.line.index + 1,
        end.line.index,
        `the ReceiveAccept the server answered node ${nodeId} with`,
    );

    return { exchange: session, proposal, accept: acceptOf(Bytes.fromHex(accept.match[1])) };
}

/** The last line before `to` and at or after `from` that matches `pattern`. */
function lastLineIn(log: LogFollower, pattern: RegExp, from: number, to: number, what: string) {
    const found = log.lastMatchBefore(pattern, to, to - from);
    if (found === undefined) {
        throw new MatterServerOtaError(`matterjs-server logged no ${what}`);
    }
    return found;
}

async function logLine(log: LogFollower, pattern: RegExp, from: number, what: string) {
    let line: LogLine;
    try {
        line = await log.expectPattern(pattern, { from, timeoutMs: LOG_LAG });
    } catch (error) {
        if (error instanceof CertLogTimeoutError) {
            throw new MatterServerOtaError(`matterjs-server logged no ${what}`, { cause: error });
        }
        throw error;
    }
    const match = pattern.exec(line.text);
    if (match === null) {
        throw new UnexpectedDataError(`Log line ${line.index} matched ${pattern} once and not again: ${line.text}`);
    }
    return { line, match };
}

/** @see {@link MatterSpecification.v161.Core} § 11.22.5.1 */
function proposalOf(payload: Bytes): BdxTransferProposal {
    const { transferProtocol, maxBlockSize, startOffset, maxLength, fileDesignator } =
        BdxReceiveInitMessage.decode(payload);
    return {
        version: transferProtocol.version ?? 0,
        senderDrive: !!transferProtocol.senderDrive,
        receiverDrive: !!transferProtocol.receiverDrive,
        asynchronousTransfer: !!transferProtocol.asynchronousTransfer,
        maxBlockSize,
        startOffset: startOffset === undefined ? undefined : Number(startOffset),
        definiteLength: maxLength === undefined ? undefined : Number(maxLength),
        fileDesignator: new FileDesignator(fileDesignator).text,
        fileDesignatorLength: Bytes.of(fileDesignator).byteLength,
    };
}

/** @see {@link MatterSpecification.v161.Core} § 11.22.5.3 */
function acceptOf(payload: Bytes): BdxTransferAccept {
    const { transferControl, maxBlockSize, length } = BdxReceiveAcceptMessage.decode(payload);
    return {
        version: transferControl.version ?? 0,
        mode: transferControl.senderDrive ? "senderDrive" : "receiverDrive",
        asynchronousTransfer: !!transferControl.asynchronousTransfer,
        maxBlockSize,
        definiteLength: length === undefined ? undefined : Number(length),
    };
}

/** Bytes the server's blocks of `session` carried, each block counted once however often it was sent. */
export function transferredBytesOf(lines: Iterable<LogLine>, session: string) {
    const pattern = new RegExp(
        String.raw`Message » for: BDX/Block(?:Eof)? cnt: (\d+) len: (\d+) .*id: ${escaped(session)}✉`,
    );
    const blocks = new Map<number, number>();
    for (const { text } of lines) {
        const block = pattern.exec(text);
        if (block !== null) {
            blocks.set(Number(block[1]), Number(block[2]));
        }
    }
    let bytes = 0;
    for (const length of blocks.values()) {
        bytes += length;
    }
    return bytes;
}

/** The endpoint the server served the node's `QueryImage` on, from the server's log of the invoke it received. */
function providerEndpointIn(log: LogFollower, nodeId: NodeId, from: number) {
    const pattern = new RegExp(
        String.raw`InteractionServer Invoke « ${exchangeOf(nodeId)} invokes: (\d+)\.otaSoftwareUpdateProvider\.queryImage`,
    );
    for (const { text } of linesFrom(log, from)) {
        const invoke = pattern.exec(text);
        if (invoke !== null) {
            return Number(invoke[1]);
        }
    }
    throw new MatterServerOtaError(`matterjs-server logged no QueryImage from node ${nodeId} it served`);
}

function escaped(literal: string) {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
