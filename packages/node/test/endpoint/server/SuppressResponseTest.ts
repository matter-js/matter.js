/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionServer } from "#node/server/InteractionServer.js";
import { Bytes, Diagnostic, InternalError, LogDestination, LogFormat, Logger } from "@matter/general";
import { Specification } from "@matter/model";
import { MockServerNode } from "@matter/node/testing";
import {
    InteractionRecipient,
    InteractionServerMessenger,
    InvokeRequest,
    Message,
    MessageExchange,
    MessageType,
    SessionType,
    WriteRequest,
} from "@matter/protocol";
import {
    AttributeId,
    ClusterId,
    CommandId,
    EndpointNumber,
    INTERACTION_PROTOCOL_ID,
    Status,
    TlvBoolean,
    TlvField,
    TlvInvokeRequest,
    TlvNoArguments,
    TlvObject,
    TlvStatusResponse,
    TlvString,
    TlvUInt8,
    TlvWriteRequest,
} from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { createDummyMessageExchange } from "./InteractionTestUtils.js";

const NODE_LABEL_WRITE = {
    path: {
        endpointId: EndpointNumber(0),
        clusterId: ClusterId(BasicInformation.id),
        attributeId: AttributeId(BasicInformation.attributes.nodeLabel.id),
    },
    data: TlvString.encodeTlv("written"),
};

const ON_OFF_INVOKE = {
    commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(1) },
    commandFields: TlvNoArguments.encodeTlv(undefined),
};

const ONLY_SUPPRESS_RESPONSE = TlvObject({ suppressResponse: TlvField(0, TlvBoolean) }).encode({
    suppressResponse: true,
});

const UNREADABLE_SUPPRESS_RESPONSE = TlvObject({ suppressResponse: TlvField(0, TlvUInt8) }).encode({
    suppressResponse: 1,
});

function writeRequest(overrides: Partial<WriteRequest>): Bytes {
    return TlvWriteRequest.encode({ timedRequest: false, writeRequests: [NODE_LABEL_WRITE], ...overrides });
}

function nodeLabelWrite(label: string) {
    return { ...NODE_LABEL_WRITE, data: TlvString.encodeTlv(label) };
}

/** Fails every invoke with an error that is not a {@link StatusResponseError}. */
class FailingRecipient implements InteractionRecipient {
    async handleInvokeRequest(
        _exchange: MessageExchange,
        _request: InvokeRequest,
        _messenger: InteractionServerMessenger,
    ) {
        throw new InternalError("invoke fails");
    }

    async handleReadRequest(): Promise<never> {
        throw new InternalError("unexpected read");
    }

    async handleWriteRequest() {
        throw new InternalError("unexpected write");
    }

    async handleSubscribeRequest() {
        throw new InternalError("unexpected subscribe");
    }

    handleTimedRequest() {
        throw new InternalError("unexpected timed request");
    }
}

/** Answers an invoke with one InvokeResponse chunk, which the peer acknowledges, and then fails. */
class ChunkThenFailRecipient extends FailingRecipient {
    chunkAcknowledged?: boolean;

    override async handleInvokeRequest(
        _exchange: MessageExchange,
        _request: InvokeRequest,
        messenger: InteractionServerMessenger,
    ) {
        this.chunkAcknowledged = await messenger.sendInvokeResponseChunk({
            suppressResponse: false,
            invokeResponses: [],
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        });
        throw new InternalError("fails after the first chunk");
    }
}

/** The "Status response" log lines {@link run} produces, in plain format. */
async function statusLogOf(run: () => Promise<unknown>) {
    const lines = new Array<string>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            const line = LogFormat.formats.plain(message);
            if (line.includes("Status response")) {
                lines.push(line);
            }
        },
    });
    try {
        await run();
    } finally {
        delete Logger.destinations.capture;
    }
    return lines;
}

function invokeRequest(overrides: Partial<InvokeRequest>): Bytes {
    return TlvInvokeRequest.encode({
        suppressResponse: true,
        timedRequest: false,
        invokeRequests: [ON_OFF_INVOKE],
        ...overrides,
    });
}

function requestMessage(messageType: MessageType, payload: Bytes): Message {
    return {
        packetHeader: {
            sessionId: 1,
            sessionType: SessionType.Unicast,
            hasPrivacyEnhancements: false,
            isControlMessage: false,
            hasMessageExtensions: false,
            messageId: 123,
        },
        payloadHeader: {
            exchangeId: 1,
            protocolId: INTERACTION_PROTOCOL_ID,
            messageType,
            isInitiatorMessage: true,
            requiresAck: true,
            hasSecuredExtension: false,
        },
        payload,
    };
}

/**
 * Run the server messenger on {@link requests} and collect what it sends.  The timed flags configure a Timed Request
 * that preceded the action.
 */
async function exchangeOf(
    node: MockServerNode,
    requests: Message[],
    timed: { active?: boolean; expired?: boolean } = {},
    recipient: InteractionRecipient = node.env.get(InteractionServer),
) {
    const sent = new Array<{ messageType: number; payload: Bytes }>();
    const exchange = await createDummyMessageExchange(
        node,
        { fabric: await node.addFabric() },
        timed.active ?? false,
        timed.expired ?? false,
        (messageType, payload) => {
            sent.push({ messageType, payload });
        },
        undefined,
        undefined,
        requests,
    );
    await new InteractionServerMessenger(exchange).handleRequest(recipient);

    const statuses = sent
        .filter(({ messageType }) => messageType === MessageType.StatusResponse)
        .map(({ payload }) => TlvStatusResponse.decode(payload).status);
    return { sent: sent.map(({ messageType }) => messageType), statuses };
}

describe("SuppressResponse on error paths", () => {
    let node: MockServerNode;

    before(() => {
        MockTime.init();
    });

    beforeEach(async () => {
        node = await MockServerNode.createOnline();
    });

    afterEach(async () => {
        await node.close();
    });

    it("sends nothing for a suppressed invoke with a TimedRequest mismatch", async () => {
        const result = await exchangeOf(node, [
            requestMessage(MessageType.InvokeRequest, invokeRequest({ timedRequest: true })),
        ]);

        expect(result).deep.equals({ sent: [], statuses: [] });
    });

    it("sends nothing for a suppressed invoke after the timed window expired", async () => {
        const result = await exchangeOf(
            node,
            [requestMessage(MessageType.InvokeRequest, invokeRequest({ timedRequest: true }))],
            { active: true, expired: true },
        );

        expect(result).deep.equals({ sent: [], statuses: [] });
    });

    it("sends nothing for a suppressed invoke rejected with InvalidAction", async () => {
        const tooMany = Array.from({ length: node.env.get(InteractionServer).maxPathsPerInvoke + 1 }, (_, index) => ({
            ...ON_OFF_INVOKE,
            commandPath: { ...ON_OFF_INVOKE.commandPath, endpointId: EndpointNumber(index) },
        }));
        const result = await exchangeOf(node, [
            requestMessage(MessageType.InvokeRequest, invokeRequest({ invokeRequests: tooMany })),
        ]);

        expect(result).deep.equals({ sent: [], statuses: [] });
    });

    it("sends nothing for a suppressed write with a TimedRequest mismatch", async () => {
        const result = await exchangeOf(node, [
            requestMessage(MessageType.WriteRequest, writeRequest({ suppressResponse: true, timedRequest: true })),
        ]);

        expect(result).deep.equals({ sent: [], statuses: [] });
        expect(node.state.basicInformation.nodeLabel).not.equals("written");
    });

    it("sends nothing for a suppressed write rejected with InvalidAction", async () => {
        const result = await exchangeOf(node, [
            requestMessage(
                MessageType.WriteRequest,
                writeRequest({ suppressResponse: true, moreChunkedMessages: true }),
            ),
        ]);

        expect(result).deep.equals({ sent: [], statuses: [] });
    });

    it("drops a final write chunk that sets SuppressResponse without a status", async () => {
        const result = await exchangeOf(node, [
            requestMessage(
                MessageType.WriteRequest,
                writeRequest({ moreChunkedMessages: true, writeRequests: [nodeLabelWrite("first")] }),
            ),
            requestMessage(
                MessageType.WriteRequest,
                writeRequest({ suppressResponse: true, writeRequests: [nodeLabelWrite("final")] }),
            ),
        ]);

        expect(result).deep.equals({ sent: [MessageType.WriteResponse], statuses: [] });
        expect(node.state.basicInformation.nodeLabel).equals("first");
    });

    it("sends nothing for an invoke with SuppressResponse TRUE and invalid other fields", async () => {
        const result = await exchangeOf(node, [requestMessage(MessageType.InvokeRequest, ONLY_SUPPRESS_RESPONSE)]);

        expect(result).deep.equals({ sent: [], statuses: [] });
    });

    it("sends nothing for a write with SuppressResponse TRUE and invalid other fields", async () => {
        const result = await exchangeOf(node, [requestMessage(MessageType.WriteRequest, ONLY_SUPPRESS_RESPONSE)]);

        expect(result).deep.equals({ sent: [], statuses: [] });
    });

    it("reports a failure after the peer acknowledged a response chunk of a suppressed invoke", async () => {
        const recipient = new ChunkThenFailRecipient();
        const result = await exchangeOf(
            node,
            [
                requestMessage(MessageType.InvokeRequest, invokeRequest({})),
                requestMessage(
                    MessageType.StatusResponse,
                    TlvStatusResponse.encode({
                        status: Status.Success,
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    }),
                ),
            ],
            {},
            recipient,
        );

        expect(recipient.chunkAcknowledged).equals(true);
        expect(result.sent).deep.equals([MessageType.InvokeResponse, MessageType.StatusResponse]);
        expect(result.statuses).deep.equals([Status.Failure]);
    });

    it("answers an invoke with SuppressResponse FALSE", async () => {
        const result = await exchangeOf(node, [
            requestMessage(MessageType.InvokeRequest, invokeRequest({ suppressResponse: false, timedRequest: true })),
        ]);

        expect(result.statuses).deep.equals([Status.TimedRequestMismatch]);
    });

    it("answers a write with SuppressResponse FALSE", async () => {
        const result = await exchangeOf(node, [
            requestMessage(MessageType.WriteRequest, writeRequest({ suppressResponse: false, timedRequest: true })),
        ]);

        expect(result.statuses).deep.equals([Status.TimedRequestMismatch]);
    });

    it("answers a write without SuppressResponse", async () => {
        const result = await exchangeOf(node, [
            requestMessage(MessageType.WriteRequest, writeRequest({ timedRequest: true })),
        ]);

        expect(result.statuses).deep.equals([Status.TimedRequestMismatch]);
    });

    it("answers an invoke whose SuppressResponse cannot be read", async () => {
        const result = await exchangeOf(node, [
            requestMessage(MessageType.InvokeRequest, UNREADABLE_SUPPRESS_RESPONSE),
        ]);

        expect(result.sent).deep.equals([MessageType.StatusResponse]);
    });

    it("logs a suppressed status with the suppressed mark", async () => {
        const lines = await statusLogOf(() =>
            exchangeOf(node, [requestMessage(MessageType.InvokeRequest, invokeRequest({ timedRequest: true }))]),
        );

        expect(lines).length(1);
        expect(lines[0]).match(/Status response ⊘ .*TimedRequestMismatch#201 due to error/);
    });

    it("logs a sent status with the outbound mark", async () => {
        const lines = await statusLogOf(() =>
            exchangeOf(node, [
                requestMessage(
                    MessageType.InvokeRequest,
                    invokeRequest({ suppressResponse: false, timedRequest: true }),
                ),
            ]),
        );

        expect(lines).length(1);
        expect(lines[0]).match(/Status response » .*TimedRequestMismatch#201 due to error/);
    });

    it("logs a suppressed failure of an unexpected error", async () => {
        let result: Awaited<ReturnType<typeof exchangeOf>> | undefined;
        const lines = await statusLogOf(async () => {
            result = await exchangeOf(
                node,
                [requestMessage(MessageType.InvokeRequest, invokeRequest({}))],
                {},
                new FailingRecipient(),
            );
        });

        expect(result).deep.equals({ sent: [], statuses: [] });
        expect(lines).length(1);
        expect(lines[0]).match(/Status response ⊘ .*Failure#1/);
    });

    it("answers an unexpected error with Failure and no status log line", async () => {
        let result: Awaited<ReturnType<typeof exchangeOf>> | undefined;
        const lines = await statusLogOf(async () => {
            result = await exchangeOf(
                node,
                [requestMessage(MessageType.InvokeRequest, invokeRequest({ suppressResponse: false }))],
                {},
                new FailingRecipient(),
            );
        });

        expect(result).deep.equals({ sent: [MessageType.StatusResponse], statuses: [Status.Failure] });
        expect(lines).length(0);
    });

    it("answers a write whose SuppressResponse cannot be read", async () => {
        const result = await exchangeOf(node, [requestMessage(MessageType.WriteRequest, UNREADABLE_SUPPRESS_RESPONSE)]);

        expect(result.sent).deep.equals([MessageType.StatusResponse]);
    });
});
