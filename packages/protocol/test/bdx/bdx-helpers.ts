import { BdxSessionConfiguration } from "#bdx/BdxSessionConfiguration.js";
import { BdxClient, BdxMessage, BdxMessenger, BdxProtocol, BdxStatusMessage, ScopedStorage } from "#bdx/index.js";
import { Message } from "#codec/MessageCodec.js";
import { MaybePromise, StorageBackendMemory, StorageManager } from "#general";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SecureSession } from "#session/index.js";
import { BDX_PROTOCOL_ID, BdxMessageType, SecureMessageType } from "#types";
import { createPromise } from "@matter/general";

type MessageRecords = { type: BdxMessageType | SecureMessageType.StatusReport; data: any };

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

    // Create a storage manager with an in-memory backend.
    const storage = new StorageManager(new StorageBackendMemory());
    storage.close = () => {};
    await storage.initialize();
    const clientStorage = new ScopedStorage(storage.createContext("Client"), "ota");
    const serverStorage = new ScopedStorage(storage.createContext("Server"), "ota");

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
                clientError,
                serverError,
            }),
        ),
    );
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

function createExchange(index: number) {
    return new ProtocolMocks.Exchange({
        index,
        fabricIndex: index,
        maxPayloadSize: 1024,
        protocolId: BDX_PROTOCOL_ID,
    });
}
