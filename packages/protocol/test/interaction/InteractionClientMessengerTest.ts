/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#general";
import { InteractionClientMessenger, MessageType } from "#interaction/InteractionMessenger.js";
import { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import {
    EndpointNumber,
    ReadRequest,
    StatusCode,
    SubscribeRequest,
    TlvDataReport,
    TlvReadRequest,
    TlvStatusResponse,
    TlvSubscribeRequest,
    TlvSubscribeResponse,
} from "#types";
import { Specification } from "@matter/model";
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
        expect(status).to.equal(StatusCode.Success);
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
        const messenger = new InteractionClientMessenger(exchange, {} as ExchangeProvider);

        const requestData = {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            isFabricFiltered: true,
            attributeRequests: [{}],
        } as ReadRequest;

        await messenger.sendReadRequest(requestData);
        for await (const _x of messenger.readDataReports());

        expect(request).to.deep.equal(requestData);
    });

    it("reads attributes with too many dataVersionFilters", async () => {
        let request: ReadRequest | undefined = undefined;

        const exchange = await createDummyMessageExchange(false, false, (messageType, payload) => {
            const { response, request: result } = handleReadRequest(exchange, messageType, payload);
            if (result !== undefined) {
                request = result;
            }
            return response;
        });
        const messenger = new InteractionClientMessenger(exchange, {} as ExchangeProvider);

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
        const messenger = new InteractionClientMessenger(exchange, {} as ExchangeProvider);

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
        const messenger = new InteractionClientMessenger(exchange, {} as ExchangeProvider);

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
});
