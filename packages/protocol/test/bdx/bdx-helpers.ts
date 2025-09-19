import { BdxSessionConfiguration } from "#bdx/BdxSessionConfiguration.js";
import { BdxClient, BdxMessage, BdxMessenger, BdxProtocol, BdxStatusMessage } from "#bdx/index.js";
import { Message } from "#codec/MessageCodec.js";
import { MaybePromise, StorageBackendMemory, StorageManager } from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { BdxMessageType, FabricIndex, NodeId, SecureMessageType } from "#types";
import { createPromise, StorageContext } from "@matter/general";
import { createSession, MockExchange } from "./bdx-mock-exchange.js";

type MessageRecords = { type: BdxMessageType | SecureMessageType.StatusReport; data: any };

export async function bdxTransfer(params: {
    prepare: (
        clientStorage: StorageContext,
        serverStorage: StorageContext,
        messenger: BdxMessenger,
    ) => MaybePromise<{
        bdxClient: BdxClient;
        expectedInitialMessageType: BdxMessageType;
        serverLimits?: BdxSessionConfiguration.Config;
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
    if (message.payloadHeader.messageType === SecureMessageType.StatusReport) {
        return {
            type: SecureMessageType.StatusReport,
            data: BdxStatusMessage.decode(message.payload),
        };
    }
    const { kind: type, message: data } = BdxMessage.decode(message.payloadHeader.messageType, message.payload);
    return { type, data };
}
