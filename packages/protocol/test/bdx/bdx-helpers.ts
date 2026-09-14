import { BdxSessionConfiguration } from "#bdx/BdxSessionConfiguration.js";
import { BdxClient, BdxMessage, BdxMessenger, BdxProtocol, BdxStatusMessage, ScopedStorage } from "#bdx/index.js";
import { Message } from "#codec/MessageCodec.js";
import type { ExchangeLogContext, ExchangeSendOptions } from "#protocol/MessageExchange.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SecureSession } from "#session/index.js";
import {
    Bytes,
    createPromise,
    Diagnostic,
    ImplementationError,
    Logger,
    LogFormat,
    LogLevel,
    MaybePromise,
    MemoryBlobStorageDriver,
} from "@matter/general";
import { BDX_PROTOCOL_ID, BdxMessageType, SecureMessageType } from "@matter/types";

type MessageRecords = { type: BdxMessageType | SecureMessageType.StatusReport; data: any };

/**
 * One log call captured by {@link captureLogs}: the facility name, the exact arguments passed to it, and `text` — the
 * line as {@link LogFormat.formats.plain} renders it, including the timestamp, level and facility prefix.
 */
export type CapturedLogLine = { facility: string; values: unknown[]; text: string };

let capturing = false;

/**
 * Runs `fn` with the default log destination lowered to debug level, recording every log call it receives instead of
 * writing it. Used to assert on the text a certification test would read from a BDX transfer's log.
 *
 * If `fn` fails the captured lines are written to the restored destination before the failure propagates, so the
 * transfer that failed is still diagnosable.
 */
export async function captureLogs(fn: () => Promise<void>): Promise<CapturedLogLine[]> {
    if (capturing) {
        throw new ImplementationError("Log capture is already active; a nested capture cannot restore the destination");
    }
    capturing = true;

    const dest = Logger.destinations.default;
    const original = { ...dest };
    const captured = new Array<CapturedLogLine>();
    const messages = new Array<Diagnostic.Message>();
    const format = LogFormat.formats.plain;

    dest.level = LogLevel.DEBUG;
    dest.add = message => {
        messages.push(message);
        captured.push({ facility: message.facility, values: message.values, text: format(message) });
    };

    let failure: unknown;
    let failed = false;
    try {
        await fn();
    } catch (error) {
        failed = true;
        failure = error;
    } finally {
        Object.assign(dest, original);
        capturing = false;
    }

    if (failed) {
        for (const message of messages) {
            dest.add(message);
        }
        throw failure;
    }

    return captured;
}

export async function bdxTransfer(params: {
    prepare: (
        clientStorage: ScopedStorage,
        serverStorage: ScopedStorage,
        messenger: BdxMessenger,
    ) => MaybePromise<{
        bdxClient: BdxClient;
        expectedInitialMessageType: BdxMessageType;
        serverLimits?: BdxSessionConfiguration.Config;
    }>;
    validate: (
        clientStorage: ScopedStorage,
        serverStorage: ScopedStorage,
        meta: {
            clientExchangeData: MessageRecords[];
            serverExchangeData: MessageRecords[];
            clientSent: SentMessageLog[];
            serverSent: SentMessageLog[];
            clientError?: any;
            serverError?: any;
        },
    ) => MaybePromise<void>;
    clientExchangeManipulator?: (message: Message) => Message;
    serverExchangeManipulator?: (message: Message) => Message;
}) {
    // Create two exchanges, one for sending and one for receiving.
    const sendingExchange = createExchange(1);
    const receivingExchange = createExchange(1);
    const clientExchangeData = new Array<MessageRecords>();
    const serverExchangeData = new Array<MessageRecords>();

    // Create a blob storage driver for BDX transfers
    const blobDriver = new MemoryBlobStorageDriver();
    blobDriver.initialize();
    const clientStorage = new ScopedStorage(blobDriver, ["Client"], "ota");
    const serverStorage = new ScopedStorage(blobDriver, ["Server"], "ota");

    // Prepare the test data and create Client
    const { bdxClient, expectedInitialMessageType, serverLimits } = await params.prepare(
        clientStorage,
        serverStorage,
        new BdxMessenger(sendingExchange),
    );

    const { promise, resolver } = createPromise<Message>();

    sendingExchange.readReady.on(async () => {
        let message = await sendingExchange.read();
        clientExchangeData.push(parseMessage(message));
        if (params.clientExchangeManipulator) {
            message = params.clientExchangeManipulator(message);
        }
        await receivingExchange.write(message);
        if (clientExchangeData.length === 1) {
            // We catch the first message because this is used to initialize the Server Bdx Protocol
            resolver(message);
        }
    });

    receivingExchange.readReady.on(async () => {
        let message = await receivingExchange.read();
        serverExchangeData.push(parseMessage(message));
        if (params.serverExchangeManipulator) {
            message = params.serverExchangeManipulator(message);
        }
        await sendingExchange.write(message);
    });

    const bdxFinished = bdxClient.processTransfer();

    const message = await promise;
    expect(clientExchangeData[0].type).equals(expectedInitialMessageType);

    const bdxProtocol = new BdxProtocol();
    bdxProtocol.enablePeerForScope(
        (receivingExchange.session as SecureSession).peerAddress,
        serverStorage,
        serverLimits,
    );

    let serverError: unknown;
    try {
        // Simulate that the initial message receives on the server side
        await bdxProtocol.onNewExchange(receivingExchange, message);
    } catch (err) {
        serverError = err;
    }

    let clientError: unknown;
    try {
        // Wait until the transfer has finished
        await bdxFinished;
    } catch (err) {
        clientError = err;
    }
    await MockTime.resolve(
        Promise.resolve(
            params.validate(clientStorage, serverStorage, {
                clientExchangeData,
                serverExchangeData,
                clientSent: sendingExchange.sent,
                serverSent: receivingExchange.sent,
                clientError,
                serverError,
            }),
        ),
    );

    // Clean up exchanges and sessions to prevent lingering timers
    await sendingExchange.destroy();
    await receivingExchange.destroy();
    await sendingExchange.session[Symbol.asyncDispose]();
    await receivingExchange.session[Symbol.asyncDispose]();
}

function parseMessage(message: Message): MessageRecords {
    if (message.payloadHeader.messageType === SecureMessageType.StatusReport) {
        return {
            type: SecureMessageType.StatusReport,
            data: BdxStatusMessage.decode(message.payload),
        };
    }
    const { kind: type, message: data } = BdxMessage.decode(message.payloadHeader.messageType, message.payload);
    return { type, data };
}

/**
 * One message a BDX flow sent, named by type and carrying the fields BDX asked the exchange to log with it.
 *
 * The mock channel never reaches {@link MessageChannel.send}, where an outbound message is rendered, so what the
 * flow asked to be logged is only observable here.
 */
export type SentMessageLog = { type: BdxMessageType; logContext?: ExchangeLogContext };

class RecordingExchange extends ProtocolMocks.Exchange {
    readonly sent = new Array<SentMessageLog>();

    override async send(messageType: number, payload: Bytes, options?: ExchangeSendOptions) {
        this.sent.push({ type: messageType as BdxMessageType, logContext: options?.logContext });
        return super.send(messageType, payload, options);
    }
}

function createExchange(index: number) {
    return new RecordingExchange({
        index,
        fabricIndex: index,
        maxPayloadSize: 1024,
        protocolId: BDX_PROTOCOL_ID,
    });
}
