import {
    BdxBlockAckEofMessage,
    BdxBlockAckMessage,
    BdxBlockEofMessage,
    BdxBlockMessage,
    BdxBlockQueryMessage,
    BdxBlockQueryWithSkipMessage,
    BdxClient,
    BdxMessenger,
    BdxProtocol,
    BdxReceiveAcceptMessage,
    BdxReceiveInitMessage,
    BdxSendAcceptMessage,
    BdxSendInitMessage,
    BdxSession,
    BdxStatusMessage,
} from "#bdx/index.js";
import { Message } from "#codec/MessageCodec.js";
import { MaybePromise, StorageBackendMemory, StorageManager } from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { BdxMessageTypes, FabricIndex, NodeId, SecureMessageType } from "#types";
import { createPromise, StorageContext } from "@matter/general";
import { createSession, MockExchange } from "./bdx-mock-exchange.js";

type MessageRecords = { type: BdxMessageTypes | SecureMessageType.StatusReport; data: any };

export async function bdxTransfer(params: {
    prepare: (
        clientStorage: StorageContext,
        serverStorage: StorageContext,
        messenger: BdxMessenger,
    ) => MaybePromise<{
        bdxClient: BdxClient;
        expectedInitialMessageType: BdxMessageTypes;
        serverLimits?: BdxSession.Config;
    }>;
    validate: (
        clientStorage: StorageContext,
        serverStorage: StorageContext,
        meta: {
            clientExchangeData: MessageRecords[];
            serverExchangeData: MessageRecords[];
            clientError?: any;
            serverError?: any;
        },
    ) => MaybePromise<void>;
    clientExchangeManipulator?: (message: Message) => Message;
    serverExchangeManipulator?: (message: Message) => Message;
}) {
    // Create two exchanges, one for sending and one for receiving.
    const sendingExchange = new MockExchange(PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }), {
        id: 1,
        session: await createSession({ sessionId: 1 }),
    });
    const receivingExchange = new MockExchange(PeerAddress({ fabricIndex: FabricIndex(2), nodeId: NodeId(2) }), {
        id: 2,
        session: await createSession({ sessionId: 2 }),
    });
    const clientExchangeData = new Array<MessageRecords>();
    const serverExchangeData = new Array<MessageRecords>();

    // Create a storage manager with an in-memory backend.
    const storage = new StorageManager(new StorageBackendMemory());
    storage.close = () => {};
    await storage.initialize();
    const clientStorage = storage.createContext("Client");
    const serverStorage = storage.createContext("Server");

    // Prepare the test data and create Client
    const { bdxClient, expectedInitialMessageType, serverLimits } = await params.prepare(
        clientStorage,
        serverStorage,
        new BdxMessenger(sendingExchange),
    );

    const { promise, resolver } = createPromise<Message>();

    sendingExchange.newData.on(async () => {
        let message = await sendingExchange.read();
        clientExchangeData.push(parseMessage(message));
        if (params.clientExchangeManipulator) {
            message = params.clientExchangeManipulator(message);
        }
        if (clientExchangeData.length === 1) {
            // We catch the first message because this is used to initialize the Server Bdx Protocol
            resolver(message);
        } else {
            await receivingExchange.write(message);
        }
    });

    receivingExchange.newData.on(async () => {
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

    const bdxProtocol = new BdxProtocol(serverStorage, serverLimits);

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
    await params.validate(clientStorage, serverStorage, {
        clientExchangeData,
        serverExchangeData,
        clientError,
        serverError,
    });
}

function parseMessage(message: Message): MessageRecords {
    switch (message.payloadHeader.messageType) {
        case BdxMessageTypes.SendInit:
            return {
                type: BdxMessageTypes.SendInit,
                data: BdxSendInitMessage.decode(message.payload),
            };
        case BdxMessageTypes.ReceiveInit:
            return {
                type: BdxMessageTypes.ReceiveInit,
                data: BdxReceiveInitMessage.decode(message.payload),
            };
        case BdxMessageTypes.SendAccept:
            return {
                type: BdxMessageTypes.SendAccept,
                data: BdxSendAcceptMessage.decode(message.payload),
            };
        case BdxMessageTypes.ReceiveAccept:
            return {
                type: BdxMessageTypes.ReceiveAccept,
                data: BdxReceiveAcceptMessage.decode(message.payload),
            };
        case BdxMessageTypes.BlockQuery:
            return {
                type: BdxMessageTypes.BlockQuery,
                data: BdxBlockQueryMessage.decode(message.payload),
            };
        case BdxMessageTypes.Block:
            return {
                type: BdxMessageTypes.Block,
                data: BdxBlockMessage.decode(message.payload),
            };
        case BdxMessageTypes.BlockEof:
            return {
                type: BdxMessageTypes.BlockEof,
                data: BdxBlockEofMessage.decode(message.payload),
            };
        case BdxMessageTypes.BlockAck:
            return {
                type: BdxMessageTypes.BlockAck,
                data: BdxBlockAckMessage.decode(message.payload),
            };
        case BdxMessageTypes.BlockAckEof:
            return {
                type: BdxMessageTypes.BlockAckEof,
                data: BdxBlockAckEofMessage.decode(message.payload),
            };
        case BdxMessageTypes.BlockQueryWithSkip:
            return {
                type: BdxMessageTypes.BlockQueryWithSkip,
                data: BdxBlockQueryWithSkipMessage.decode(message.payload),
            };
        case SecureMessageType.StatusReport:
            return {
                type: SecureMessageType.StatusReport,
                data: BdxStatusMessage.decode(message.payload),
            };
    }
    throw new Error(`Unknown message type: ${message.payloadHeader.messageType}`);
}
