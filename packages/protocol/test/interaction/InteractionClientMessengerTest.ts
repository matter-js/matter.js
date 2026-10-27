/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionClientMessenger, MessageType } from "#interaction/InteractionMessenger.js";
import { ExchangeReceiveOptions, ExchangeSendOptions, MessageExchange } from "#protocol/MessageExchange.js";
import { AbortedError, Bytes, DataReadQueue, MatterFlowError } from "@matter/general";
import { Specification } from "@matter/model";
import {
    AttributeData,
    AttributeId,
    ClusterId,
    EndpointNumber,
    ReadRequest,
    ReceivedStatusResponse,
    ReceivedStatusResponseError,
    Status,
    SubscribeRequest,
    TlvArray,
    TlvBoolean,
    TlvByteString,
    TlvDataReport,
    TlvReadRequest,
    TlvStatusResponse,
    TlvSubscribeRequest,
    TlvSubscribeResponse,
    TlvWriteRequest,
    TlvWriteResponse,
    UnknownStatusResponseError,
    WriteRequest,
} from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { createDummyMessageExchange } from "./interaction-utils.js";

function handleReadRequest(exchange: MessageExchange, messageType: number, payload: Bytes) {
    expect(payload.byteLength < exchange.maxPayloadSize).to.be.true;
    expect(messageType).to.equal(MessageType.ReadRequest);
    return {
        response: {
            payload: TlvDataReport.encode({
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                suppressResponse: true,
            }),
            messageType: MessageType.ReportData,
        },
        request: TlvReadRequest.decode(payload),
    };
}

function handleSubscribeRequest(
    exchange: MessageExchange,
    messageType: number,
    payload: Bytes,
): {
    response?: { payload: Bytes; messageType: number };
    request?: SubscribeRequest;
    subscriptionFinalized?: boolean;
} {
    expect(payload.byteLength < exchange.maxPayloadSize).to.be.true;
    if (messageType === MessageType.SubscribeRequest) {
        return {
            response: {
                payload: TlvDataReport.encode({
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    suppressResponse: false,
                    subscriptionId: 1,
                }),
                messageType: MessageType.ReportData,
            },
            request: TlvSubscribeRequest.decode(payload),
        };
    } else if (messageType === MessageType.StatusResponse) {
        const status = TlvStatusResponse.decode(payload).status;
        expect(status).to.equal(Status.Success);
        return {
            response: {
                payload: TlvSubscribeResponse.encode({
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    subscriptionId: 1,
                    maxInterval: 10,
                }),
                messageType: MessageType.SubscribeResponse,
            },
            subscriptionFinalized: true,
        };
    }
    return {};
}

describe("InteractionClientMessenger", () => {
    it("reads attributes", async () => {
        let request: ReadRequest | undefined = undefined;

        const exchange = await createDummyMessageExchange(false, false, (messageType, payload) => {
            const { response, request: result } = handleReadRequest(exchange, messageType, payload);
            if (result !== undefined) {
                request = result;
            }
            return response;
        });
        const messenger = new InteractionClientMessenger(exchange);

        const requestData = {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            isFabricFiltered: true,
            attributeRequests: [{}],
        } as ReadRequest;

        await messenger.sendReadRequest(requestData);
        for await (const _x of messenger.readDataReports());

        expect(request).to.deep.equal(requestData);
    });

    for (const [status, type, message] of [
        [
            Status.UnsupportedAccess,
            ReceivedStatusResponse.UnsupportedAccessError,
            "Received error status UnsupportedAccess",
        ],
        [Status.Success, ReceivedStatusResponse.SuccessError, "Received status response Success"],
        [0x7777 as Status, UnknownStatusResponseError, "Received error status unknown"],
    ] as const) {
        it(`throws a received error when the peer answers a read with a StatusResponse ${status}`, async () => {
            const exchange = await createDummyMessageExchange(false, false, messageType => {
                expect(messageType).to.equal(MessageType.ReadRequest);
                return {
                    payload: TlvStatusResponse.encode({
                        status,
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    }),
                    messageType: MessageType.StatusResponse,
                };
            });
            const messenger = new InteractionClientMessenger(exchange);

            await messenger.sendReadRequest({
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                isFabricFiltered: true,
                attributeRequests: [{}],
            });

            const error = await (async () => {
                try {
                    for await (const _report of messenger.readDataReports());
                } catch (error) {
                    return error;
                }
                expect.fail("readDataReports did not throw");
            })();

            expect(error).instanceOf(type);
            expect(error).instanceOf(ReceivedStatusResponseError);
            if (!(error instanceof Error)) {
                expect.fail(`expected an Error, got ${error}`);
            }
            expect(error.message).contains(message);
            expect(error.message).match(new RegExp(`\\(code ${status}\\)$`));
        });
    }

    it("reads attributes with too many dataVersionFilters", async () => {
        let request: ReadRequest | undefined = undefined;

        const exchange = await createDummyMessageExchange(false, false, (messageType, payload) => {
            const { response, request: result } = handleReadRequest(exchange, messageType, payload);
            if (result !== undefined) {
                request = result;
            }
            return response;
        });
        const messenger = new InteractionClientMessenger(exchange);

        const dataVersionFilters = [];
        for (let i = 0; i < 70; i++) {
            dataVersionFilters.push({
                path: { endpointId: EndpointNumber(i), clusterId: 0 },
                dataVersion: 2 ** 32 - (i + 1) * 1024,
            });
        }
        const requestData = {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            isFabricFiltered: true,
            attributeRequests: [{}],
            dataVersionFilters,
        } as ReadRequest;

        await messenger.sendReadRequest(requestData);
        for await (const _x of messenger.readDataReports());

        expect(request).to.exist;
        expect((request! as SubscribeRequest).dataVersionFilters?.length).to.equal(68);
        requestData.dataVersionFilters!.length = 68;
        expect(request).to.deep.equal(requestData);
    });

    it("subscribes attributes", async () => {
        let request: SubscribeRequest | undefined = undefined;
        let subscriptionFinalized = false;

        const exchange = await createDummyMessageExchange(false, false, (messageType, payload) => {
            const {
                response,
                request: result,
                subscriptionFinalized: isFinalized,
            } = handleSubscribeRequest(exchange, messageType, payload);
            expect(response).to.exist;
            if (result !== undefined && isFinalized === undefined) {
                expect(subscriptionFinalized).to.be.false;
                request = result;
            } else if (isFinalized !== undefined && result === undefined) {
                expect(subscriptionFinalized).to.be.false;
                subscriptionFinalized = isFinalized;
            } else {
                throw new Error("Invalid response");
            }
            return response;
        });
        const messenger = new InteractionClientMessenger(exchange);

        const requestData = {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            isFabricFiltered: true,
            keepSubscriptions: true,
            minIntervalFloorSeconds: 0,
            maxIntervalCeilingSeconds: 1,
            attributeRequests: [{}],
        } as SubscribeRequest;

        await messenger.sendSubscribeRequest(requestData);
        for await (const _x of messenger.readDataReports());

        expect(request).to.deep.equal(requestData);
        expect(subscriptionFinalized).to.be.true;
    });

    it("subscribes attributes with too many dataVersionFilters", async () => {
        let request: SubscribeRequest | undefined = undefined;
        let subscriptionFinalized = false;

        const exchange = await createDummyMessageExchange(false, false, (messageType, payload) => {
            const {
                response,
                request: result,
                subscriptionFinalized: isFinalized,
            } = handleSubscribeRequest(exchange, messageType, payload);
            expect(response).to.exist;
            if (result !== undefined && isFinalized === undefined) {
                expect(subscriptionFinalized).to.be.false;
                request = result;
            } else if (isFinalized !== undefined && result === undefined) {
                expect(subscriptionFinalized).to.be.false;
                subscriptionFinalized = isFinalized;
            } else {
                throw new Error("Invalid response");
            }
            return response;
        });
        const messenger = new InteractionClientMessenger(exchange);

        const dataVersionFilters = [];
        for (let i = 0; i < 70; i++) {
            dataVersionFilters.push({
                path: { endpointId: EndpointNumber(i), clusterId: 0 },
                dataVersion: 2 ** 32 - (i + 1) * 1024,
            });
        }
        const requestData = {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            isFabricFiltered: true,
            keepSubscriptions: true,
            minIntervalFloorSeconds: 0,
            maxIntervalCeilingSeconds: 1,
            attributeRequests: [{}],
            dataVersionFilters,
        } as SubscribeRequest;

        await messenger.sendSubscribeRequest(requestData);
        for await (const _x of messenger.readDataReports());

        expect(request).to.exist;
        expect((request as unknown as SubscribeRequest).dataVersionFilters?.length).to.equal(67);
        requestData.dataVersionFilters!.length = 67;
        expect(request).to.deep.equal(requestData);
        expect(subscriptionFinalized).to.be.true;
    });

    it("does not block report iteration on final status ack and waits on close", async () => {
        let resolveStatusSend: (() => void) | undefined;
        let exchangeClosed = false;

        const queue = new DataReadQueue<any>();
        queue.write({
            packetHeader: {},
            payloadHeader: { messageType: MessageType.ReportData },
            payload: TlvDataReport.encode({
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                suppressResponse: false,
                moreChunkedMessages: false,
                subscriptionId: 1,
            }),
        });

        const exchange = {
            maxPayloadSize: 1200,
            send: (messageType: number) => {
                if (messageType === MessageType.StatusResponse) {
                    return new Promise<void>(resolve => {
                        resolveStatusSend = resolve;
                    });
                }
            },
            nextMessage: () => queue.read(),
            close: async () => {
                exchangeClosed = true;
            },
        } as unknown as MessageExchange;

        const messenger = new InteractionClientMessenger(exchange);
        const reports = messenger.readDataReports();

        const first = await reports.next();
        expect(first.done).to.be.false;

        let iterationFinished = false;
        const donePromise = reports.next().then(result => {
            iterationFinished = true;
            return result;
        });
        await Promise.resolve();
        expect(iterationFinished).to.be.true;
        expect((await donePromise).done).to.be.true;

        let closeFinished = false;
        const closePromise = messenger.close().then(() => {
            closeFinished = true;
        });
        await Promise.resolve();
        expect(closeFinished).to.be.false;
        expect(exchangeClosed).to.be.false;

        expect(resolveStatusSend, "StatusResponse send was never initiated").to.be.a("function");
        resolveStatusSend!();
        await closePromise;

        expect(closeFinished).to.be.true;
        expect(exchangeClosed).to.be.true;
    });

    describe("abandonSubscription", () => {
        function report(fields: { suppressResponse?: boolean; moreChunkedMessages?: boolean } = {}) {
            return {
                packetHeader: {},
                payloadHeader: { messageType: MessageType.ReportData },
                payload: TlvDataReport.encode({
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    suppressResponse: false,
                    subscriptionId: 7,
                    ...fields,
                }),
            };
        }

        function subscribeResponse() {
            return {
                packetHeader: {},
                payloadHeader: { messageType: MessageType.SubscribeResponse },
                payload: TlvSubscribeResponse.encode({
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    subscriptionId: 7,
                    maxInterval: 60,
                }),
            };
        }

        /**
         * A peer that sends {@link messages} and records the statuses the client sends.  Unless {@link acks} it never
         * acks, so an MRP send waits until its abort.
         */
        function peer(...messages: unknown[]) {
            const queue = new DataReadQueue<unknown>();
            for (const message of messages) {
                queue.write(message);
            }
            const statuses = new Array<Status>();
            const sendOptions = new Array<ExchangeSendOptions | undefined>();
            let acks = true;
            const exchange = {
                maxPayloadSize: 1200,
                send: async (messageType: number, payload: Bytes, options?: ExchangeSendOptions) => {
                    if (options?.abort?.aborted) {
                        throw new AbortedError();
                    }
                    expect(messageType).equals(MessageType.StatusResponse);
                    statuses.push(TlvStatusResponse.decode(payload).status);
                    sendOptions.push(options);
                    const abort = options?.ackWaitAbort;
                    if (!acks && abort !== undefined && !abort.aborted) {
                        await new Promise(resolve => abort.addEventListener("abort", resolve, { once: true }));
                    }
                },
                nextMessage: (options?: ExchangeReceiveOptions) => queue.read(options?.abort),
                close: async () => {},
            } as unknown as MessageExchange;
            return {
                messenger: new InteractionClientMessenger(exchange),
                statuses,
                sendOptions,
                withoutAcks() {
                    acks = false;
                },
            };
        }

        it("answers a report it has not answered yet with INVALID_SUBSCRIPTION", async () => {
            const { messenger, statuses } = peer(report({ moreChunkedMessages: true }));
            await messenger.readDataReports().next();

            expect(messenger.reportAwaitsStatus).true;
            await messenger.abandonSubscription({ awaitReport: false });

            expect(statuses).deep.equals([Status.InvalidSubscription]);
            expect(messenger.reportAwaitsStatus).false;
        });

        it("answers the next report with INVALID_SUBSCRIPTION when asked to await it", async () => {
            const { messenger, statuses } = peer(report());

            await messenger.abandonSubscription({ awaitReport: true });

            expect(statuses).deep.equals([Status.InvalidSubscription]);
        });

        it("leaves a SubscribeResponse unanswered", async () => {
            const { messenger, statuses } = peer(subscribeResponse());

            await messenger.abandonSubscription({ awaitReport: true });

            expect(statuses).deep.equals([]);
        });

        it("answers a report it has not answered yet once, without retransmission, after the abort", async () => {
            const { messenger, statuses, sendOptions } = peer(report({ moreChunkedMessages: true }));
            await messenger.readDataReports().next();

            const abort = new AbortController();
            abort.abort();
            await messenger.abandonSubscription({ awaitReport: true, abort: abort.signal });

            expect(statuses).deep.equals([Status.InvalidSubscription]);
            expect(sendOptions[0]?.abort).undefined;
            expect(sendOptions[0]?.ackWaitAbort).equals(abort.signal);
        });

        it("stops waiting for the ack of its answer on abort", async () => {
            const { messenger, statuses, sendOptions, withoutAcks } = peer(report({ moreChunkedMessages: true }));
            await messenger.readDataReports().next();
            withoutAcks();

            const abort = new AbortController();
            const abandoning = messenger.abandonSubscription({ awaitReport: false, abort: abort.signal });
            await Promise.resolve();
            expect(statuses).deep.equals([Status.InvalidSubscription]);
            expect(sendOptions[0]?.ackWaitAbort).equals(abort.signal);
            abort.abort();
            await abandoning;
        });

        it("stops waiting for the next report on abort", async () => {
            const { messenger, statuses } = peer();
            const abort = new AbortController();

            const abandoning = messenger.abandonSubscription({ awaitReport: true, abort: abort.signal });
            abort.abort();
            await abandoning;

            expect(statuses).deep.equals([]);
        });

        it("answers a next report it cannot decode with INVALID_SUBSCRIPTION", async () => {
            const { messenger, statuses } = peer({
                packetHeader: {},
                payloadHeader: { messageType: MessageType.ReportData },
                payload: Bytes.fromHex("ff"),
            });

            await messenger.abandonSubscription({ awaitReport: true });

            expect(statuses).deep.equals([Status.InvalidSubscription]);
        });

        it("answers a report it cannot decode with INVALID_SUBSCRIPTION", async () => {
            const { messenger, statuses } = peer({
                packetHeader: {},
                payloadHeader: { messageType: MessageType.ReportData },
                payload: Bytes.fromHex("ff"),
            });
            await expect(messenger.readDataReports().next()).rejected;

            await messenger.abandonSubscription({ awaitReport: false });

            expect(statuses).deep.equals([Status.InvalidSubscription]);
        });

        it("sends nothing when no report waits for a status and it is not asked to await one", async () => {
            const { messenger, statuses } = peer(report());

            await messenger.abandonSubscription({ awaitReport: false });

            expect(statuses).deep.equals([]);
        });

        it("does not consider a report with SuppressResponse as waiting for a status", async () => {
            const { messenger } = peer(report({ suppressResponse: true }));
            await messenger.readDataReports().next();

            expect(messenger.reportAwaitsStatus).false;
        });

        it("does not consider a report waiting for a status once it was answered", async () => {
            const { messenger, statuses } = peer(report({ moreChunkedMessages: true }), report());
            for await (const _report of messenger.readDataReports());
            await messenger.close();

            expect(statuses).deep.equals([Status.Success, Status.Success]);
            expect(messenger.reportAwaitsStatus).false;
        });
    });

    describe("writes", () => {
        const ENTRY = Bytes.fromHex("ab".repeat(300));

        function attributeData(attributeId: number, data = TlvByteString.encodeTlv(ENTRY)): AttributeData {
            return {
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(0x1234),
                    attributeId: AttributeId(attributeId),
                },
                data,
            };
        }

        function writeRequest(writeRequests: AttributeData[], flags?: Partial<WriteRequest>): WriteRequest {
            return {
                timedRequest: false,
                writeRequests,
                moreChunkedMessages: false,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                ...flags,
            };
        }

        /** Answers each WriteRequest with a status per path, or with a StatusResponse for the chunk numbered failAt. */
        async function writeResponder(failAt?: number, statusOf = (_data: AttributeData) => Status.Success) {
            const received = new Array<{ request: WriteRequest; size: number }>();
            const exchange = await createDummyMessageExchange(false, false, (messageType, payload) => {
                expect(messageType).equals(MessageType.WriteRequest);
                const request = TlvWriteRequest.decode(payload);
                received.push({ request, size: payload.byteLength });
                if (received.length === failAt) {
                    return {
                        messageType: MessageType.StatusResponse,
                        payload: TlvStatusResponse.encode({ status: Status.Busy }),
                    };
                }
                return {
                    messageType: MessageType.WriteResponse,
                    payload: TlvWriteResponse.encode({
                        writeResponses: request.writeRequests.map(data => ({
                            path: data.path,
                            status: { status: statusOf(data) },
                        })),
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    }),
                };
            });
            return { received, messenger: new InteractionClientMessenger(exchange), exchange };
        }

        it("sends a write that fits one message unchanged, with MoreChunkedMessages encoded as false", async () => {
            const { received, messenger } = await writeResponder();
            const request = writeRequest([attributeData(1), attributeData(2)]);

            const response = await messenger.sendWriteCommand(request);

            expect(received.map(({ request }) => request)).deep.equals([request]);
            expect(response?.writeResponses.length).equals(2);
        });

        it("chunks a write that does not fit one message and merges the statuses of all chunks", async () => {
            const { received, messenger, exchange } = await writeResponder();
            const writes = Array.from({ length: 10 }, (_, i) => attributeData(i));

            const response = await messenger.sendWriteCommand(writeRequest(writes));

            expect(received.length).greaterThan(1);
            for (const { size } of received) {
                expect(size).lessThanOrEqual(exchange.maxPayloadSize);
            }
            expect(received.map(({ request }) => request.moreChunkedMessages)).deep.equals([
                ...received.slice(1).map(() => true),
                false,
            ]);
            expect(received.flatMap(({ request }) => request.writeRequests)).deep.equals(writes);
            expect(response?.writeResponses.map(({ path }) => path.attributeId)).deep.equals(
                writes.map(({ path }) => path.attributeId),
            );
        });

        /** As many boolean writes as fit one request of {@link maxPayloadSize} bytes. */
        function smallValuesFitting(maxPayloadSize: number) {
            const small = (count: number) =>
                Array.from({ length: count }, (_, i) => attributeData(i, TlvBoolean.encodeTlv(true)));
            let count = 1;
            while (TlvWriteRequest.encode(writeRequest(small(count + 1))).byteLength <= maxPayloadSize) {
                count++;
            }
            return small(count);
        }

        it("chunks a write whose statuses would not fit one WriteResponse although the request does", async () => {
            const { received, messenger, exchange } = await writeResponder();
            const worstResponseSize = (writes: AttributeData[]) =>
                TlvWriteResponse.encode({
                    writeResponses: writes.map(({ path }) => ({
                        path,
                        status: { status: Status.Failure, clusterStatus: Status.Failure },
                    })),
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                }).byteLength;
            const writes = smallValuesFitting(exchange.maxPayloadSize);
            expect(worstResponseSize(writes)).greaterThan(exchange.maxPayloadSize);

            await messenger.sendWriteCommand(writeRequest(writes));

            expect(received.length).greaterThan(1);
            for (const { request } of received) {
                expect(worstResponseSize(request.writeRequests)).lessThanOrEqual(exchange.maxPayloadSize);
            }
            expect(received.flatMap(({ request }) => request.writeRequests.map(({ path }) => path))).deep.equals(
                writes.map(({ path }) => path),
            );
        });

        it("refuses a timed write whose statuses would not fit one WriteResponse", async () => {
            const { received, messenger, exchange } = await writeResponder();
            const writes = smallValuesFitting(exchange.maxPayloadSize);

            await expect(messenger.sendWriteCommand(writeRequest(writes, { timedRequest: true }))).rejectedWith(
                MatterFlowError,
            );
            expect(received).deep.equals([]);
        });

        function sentList(received: { request: WriteRequest }[]) {
            const [first, replace, ...adds] = received.flatMap(({ request }) => request.writeRequests);
            expect(replace.path.listIndex).undefined;
            for (const add of adds) {
                expect(add.path).deep.equals({ ...replace.path, listIndex: null });
                expect(TlvByteString.decodeTlv(add.data)).deep.equals(ENTRY);
            }
            return { first, replaced: TlvArray(TlvByteString).decodeTlv(replace.data), adds };
        }

        it("sends a whole list that does not fit one message as an empty REPLACE followed by ADDs", async () => {
            const { received, messenger } = await writeResponder();
            const small = attributeData(1);
            const entries = Array.from({ length: 8 }, () => ENTRY);
            const list = attributeData(2, TlvArray(TlvByteString).encodeTlv(entries));

            await messenger.sendWriteCommand(writeRequest([small, list]));

            const { first, replaced, adds } = sentList(received);
            expect(first).deep.equals(small);
            expect(replaced).deep.equals([]);
            expect(adds.length).equals(entries.length);
        });

        it("sends a whole ACL that does not fit one message as a filled REPLACE followed by ADDs", async () => {
            const { received, messenger } = await writeResponder();
            const small = attributeData(1);
            const entries = Array.from({ length: 8 }, () => ENTRY);
            const acl: AttributeData = {
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: AccessControl.id,
                    attributeId: AccessControl.attributes.acl.id,
                },
                data: TlvArray(TlvByteString).encodeTlv(entries),
            };

            await messenger.sendWriteCommand(writeRequest([small, acl]));

            const { first, replaced, adds } = sentList(received);
            expect(first).deep.equals(small);
            expect(received[0].request.writeRequests).deep.equals([small]);
            expect(replaced.length).greaterThan(0);
            expect(replaced.length + adds.length).equals(entries.length);
        });

        for (const flags of [{ timedRequest: true }, { suppressResponse: true }]) {
            it(`refuses to chunk a write with ${Object.keys(flags)[0]}`, async () => {
                const { received, messenger } = await writeResponder();
                const writes = Array.from({ length: 10 }, (_, i) => attributeData(i));

                await expect(messenger.sendWriteCommand(writeRequest(writes, flags))).rejectedWith(MatterFlowError);
                expect(received).deep.equals([]);
            });
        }

        it("refuses a whole list at a wildcard path that does not fit one message", async () => {
            const { received, messenger } = await writeResponder();
            const list = attributeData(1, TlvArray(TlvByteString).encodeTlv(Array.from({ length: 8 }, () => ENTRY)));
            const { endpointId: _endpoint, ...wildcardPath } = list.path;

            await expect(messenger.sendWriteCommand(writeRequest([{ ...list, path: wildcardPath }]))).rejectedWith(
                MatterFlowError,
            );
            expect(received).deep.equals([]);
        });

        it("refuses a single value that does not fit one message", async () => {
            const { received, messenger } = await writeResponder();
            const large = attributeData(1, TlvByteString.encodeTlv(Bytes.fromHex("ab".repeat(1300))));

            await expect(messenger.sendWriteCommand(writeRequest([large]))).rejectedWith(MatterFlowError);
            expect(received).deep.equals([]);
        });

        function versionedList(count: number) {
            const replace = { ...attributeData(1, TlvArray(TlvByteString).encodeTlv([])), dataVersion: 7 };
            const adds = Array.from({ length: count }, () => ({
                ...attributeData(1),
                path: { ...replace.path, listIndex: null },
                dataVersion: 7,
            }));
            return [replace, ...adds];
        }

        it("sends the ADDs of a versioned list write without DataVersion once its REPLACE succeeded", async () => {
            const { received, messenger } = await writeResponder();
            const small = attributeData(2);
            const [replace, ...adds] = versionedList(2);

            await messenger.sendWriteCommand(writeRequest([small, replace, ...adds]));

            expect(received.map(({ request }) => request.writeRequests)).deep.equals([
                [small, replace],
                adds.map(({ dataVersion: _version, ...add }) => add),
            ]);
            expect(received.map(({ request }) => request.moreChunkedMessages)).deep.equals([true, false]);
        });

        it("keeps the DataVersion on the ADDs of a list write whose REPLACE failed", async () => {
            const { received, messenger } = await writeResponder(undefined, ({ path }) =>
                path.listIndex === undefined ? Status.DataVersionMismatch : Status.Success,
            );
            const [replace, ...adds] = versionedList(2);

            await messenger.sendWriteCommand(writeRequest([replace, ...adds]));

            expect(received.map(({ request }) => request.writeRequests)).deep.equals([[replace], adds]);
        });

        it("keeps the DataVersion on the ADDs of a repeated list write whose second REPLACE failed", async () => {
            let replaces = 0;
            const { received, messenger } = await writeResponder(undefined, ({ path }) =>
                path.listIndex === undefined && ++replaces > 1 ? Status.DataVersionMismatch : Status.Success,
            );
            const [replace1, add1] = versionedList(1);
            const [replace2, add2] = versionedList(1);

            await messenger.sendWriteCommand(writeRequest([replace1, add1, replace2, add2]));

            const { dataVersion: _version, ...unversionedAdd1 } = add1;
            expect(received.map(({ request }) => request.writeRequests)).deep.equals([
                [replace1],
                [unversionedAdd1, replace2],
                [add2],
            ]);
        });

        it("sends a timed versioned list write that fits one message unchanged", async () => {
            const { received, messenger } = await writeResponder();
            const request = writeRequest(versionedList(2), { timedRequest: true });

            await messenger.sendWriteCommand(request);

            expect(received.map(({ request }) => request)).deep.equals([request]);
        });

        it("stops sending chunks when the peer answers a chunk with an error status", async () => {
            const { received, messenger } = await writeResponder(2);
            const writes = Array.from({ length: 10 }, (_, i) => attributeData(i));

            await expect(messenger.sendWriteCommand(writeRequest(writes))).rejectedWith(ReceivedStatusResponseError);
            expect(received.length).equals(2);
        });
    });
});
