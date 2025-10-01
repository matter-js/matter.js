/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationBehavior } from "#behaviors/basic-information";
import { GeneralCommissioning } from "#clusters/general-commissioning";
import { Crypto, InternalError } from "#general";
import { CommissioningServer, InteractionServer } from "#index.js";
import { Specification } from "#model";
import {
    ChannelManager,
    Fabric,
    FabricManager,
    InteractionServerMessenger,
    Message,
    MessageType,
    SessionType,
    TestFabric,
    TlvCertSigningRequest,
} from "#protocol";
import {
    AttributeReport,
    EventReport,
    NodeId,
    TlvDataReport,
    TlvInvokeRequest,
    TlvInvokeResponseData,
    TlvInvokeResponseForSend,
    TlvReadRequest,
    TlvSubscribeRequest,
    TlvWriteRequest,
    TypeFromSchema,
    VendorId,
} from "#types";
import { X509Base } from "@matter/protocol";
import { MockServerNode } from "./mock-server-node.js";

export const FAILSAFE_LENGTH_S = 60;

export async function testFactoryReset(
    mode: "online" | "offline-after-commission" | "offline" | "offline-during-reset",
) {
    let node: MockServerNode;
    if (mode !== "offline") {
        ({ node } = await CommissioningHelper().commission());
    } else {
        node = await MockServerNode.createOnline(undefined, { online: false });
    }

    const changes = new Array<string>();
    const expectedChanges = new Array<string>();

    node.lifecycle.online.on(() => void changes.push("online"));
    node.lifecycle.offline.on(() => void changes.push("offline"));

    if (mode === "offline-after-commission") {
        await node.cancel();
    }
    if (mode !== "offline") {
        expectedChanges.push("offline");
    }

    // We want to confirm unique ID is reset but the ID is not random in testing.  So set to something known we can
    // compare after reset
    const oldUniqueId = "asdf";
    await node.set({ basicInformation: { uniqueId: oldUniqueId } });

    const erasePromise = node.erase();

    let offlinePromise: Promise<void> | undefined;
    if (mode === "offline-during-reset") {
        // Wait a tick to ensure erase has started
        await MockTime.yield();
        offlinePromise = node.cancel();
        expect(node.lifecycle.shouldBeOffline).equals(true);
    } else if (mode !== "offline-after-commission" && mode !== "offline") {
        expectedChanges.push("online");
    }

    await MockTime.resolve(erasePromise, { macrotasks: true });

    if (offlinePromise) {
        await offlinePromise;
    }

    // Confirm previous online state is resumed
    expect(node.lifecycle.isOnline).equals(mode === "online");

    // Confirm basic state information is present
    expect(node.stateOf(BasicInformationBehavior).vendorName).equals("Matter.js Test Vendor");

    // Confirm unique ID did not persist
    expect(node.state.basicInformation.uniqueId).not.equals(oldUniqueId);

    // Confirm pairing codes are available
    const pairingCodes = node.stateOf(CommissioningServer).pairingCodes;
    expect(typeof pairingCodes).equals("object");
    expect(typeof pairingCodes.manualPairingCode).equals("string");

    expect(changes).deep.equals(expectedChanges);

    await node.close();
}

export function CommissioningHelper() {
    return {
        fabricNumber: undefined as number | undefined,

        async almostCommission(node?: MockServerNode, index = 1) {
            const authority = await TestFabric.Authority({ index });

            // This is the controller's version of the fabric
            const controllerFabric = await authority.createFabric();

            if (!node) {
                node = await MockServerNode.createOnline();
            }

            this.fabricNumber = index;

            const exchange = await node.createExchange();

            const context = { exchange, command: true };

            await node.online(context, async agent => {
                await agent.generalCommissioning.armFailSafe({
                    expiryLengthSeconds: FAILSAFE_LENGTH_S,
                    breadcrumb: 4,
                });
            });

            await node.online(context, async agent => {
                await agent.generalCommissioning.setRegulatoryConfig({
                    newRegulatoryConfig: 2,
                    countryCode: "XX",
                    breadcrumb: 5,
                });
            });

            await node.online(context, async agent => {
                await agent.operationalCredentials.certificateChainRequest({ certificateType: 2 });
            });

            await node.online(context, async agent => {
                await agent.operationalCredentials.certificateChainRequest({ certificateType: 1 });
            });

            const crypto = node.env.get(Crypto);

            await node.online(context, async agent => {
                await agent.operationalCredentials.attestationRequest({
                    attestationNonce: crypto.randomBytes(32),
                });
            });

            const { nocsrElements } = await node.online(context, agent =>
                agent.operationalCredentials.csrRequest({ csrNonce: crypto.randomBytes(32) }),
            );

            await node.online(context, async agent => {
                await agent.operationalCredentials.addTrustedRootCertificate({
                    rootCaCertificate: authority.ca.rootCert,
                });
            });

            const { certSigningRequest } = TlvCertSigningRequest.decode(nocsrElements);
            const peerPublicKey = await X509Base.getPublicKeyFromCsr(crypto, certSigningRequest);
            const noc = await authority.ca.generateNoc(
                peerPublicKey,
                controllerFabric.fabricId,
                controllerFabric.nodeId,
            );

            await node.online(context, async agent => {
                const result = await agent.operationalCredentials.addNoc({
                    nocValue: noc,
                    icacValue: controllerFabric.intermediateCACert,
                    ipkValue: controllerFabric.identityProtectionKey,
                    caseAdminSubject: NodeId((index + 1) * 100),
                    adminVendorId: VendorId(65521),
                });
                expect(result.statusCode).deep.equals(0);
            });

            return { node, context, controllerFabric };
        },

        async commission(existingNode?: MockServerNode, index = 1) {
            const { node, controllerFabric } = await this.almostCommission(existingNode, index);

            const deviceFabric = node.env
                .get(FabricManager)
                .fabrics.find(fabric =>
                    fabric.matchesFabricIdAndRootPublicKey(controllerFabric.fabricId, controllerFabric.rootPublicKey),
                );
            if (deviceFabric === undefined) {
                throw new InternalError("Fabric is not present on device after commissioning");
            }

            // Do not reuse session from initial commissioning because we must now move from CASE to PASE
            const contextOptions = {
                exchange: await node.createExchange({
                    fabric: deviceFabric,
                    peerNodeId: NodeId(index),
                }),
                command: true,
            };

            await node.online(contextOptions, async agent => {
                // Use MockTime.resolve to wait for broadcaster cleanup
                const result = await MockTime.resolve(agent.generalCommissioning.commissioningComplete());
                expect(result).deep.equals({
                    errorCode: GeneralCommissioning.CommissioningError.Ok,
                    debugText: "",
                });
            });

            if (!node.lifecycle.isCommissioned) {
                await node.lifecycle.commissioned;
            }

            return { node, contextOptions, fabric: deviceFabric };
        },
    };
}

export namespace interaction {
    const BarelyMockedMessenger = {
        sendStatus: _code => {},
        sendDataReport: async _options => {},
        send: async (_type, _message) => {},
        close: async () => {},
    } as InteractionServerMessenger;

    export const BarelyMockedMessage = {
        packetHeader: { sessionType: SessionType.Unicast },
    } as Message;

    export const BarelyMockedGroupMessage = {
        packetHeader: { sessionType: SessionType.Group },
    } as Message;

    export async function connect(node: MockServerNode, fabric: Fabric) {
        const exchange = await node.createExchange({ fabric });

        const interactionServer = node.env.get(InteractionServer);

        return { exchange, interactionServer };
    }

    export async function write(
        node: MockServerNode,
        fabric: Fabric,
        request: TypeFromSchema<typeof TlvWriteRequest>["writeRequests"][number],
    ) {
        const { exchange, interactionServer } = await connect(node, fabric);

        await interactionServer.handleWriteRequest(
            exchange,
            {
                suppressResponse: true,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                timedRequest: false,
                writeRequests: [request],
            },
            BarelyMockedMessage,
        );
    }

    export async function read(
        node: MockServerNode,
        fabric: Fabric,
        isFabricFiltered: boolean,
        request: Exclude<TypeFromSchema<typeof TlvReadRequest>["attributeRequests"], undefined>[number],
    ) {
        const { exchange, interactionServer } = await connect(node, fabric);

        const result = await interactionServer.handleReadRequest(
            exchange,
            {
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                attributeRequests: [request],
                isFabricFiltered: isFabricFiltered,
            },
            BarelyMockedMessage,
        );

        const data = await result.payload?.next();
        return typeof data?.value === "object" && "attributeData" in data.value
            ? data.value.attributeData?.payload
            : undefined;
    }

    export async function invoke(
        node: MockServerNode,
        fabric: Fabric,
        request: TypeFromSchema<typeof TlvInvokeRequest>["invokeRequests"][number],
        responder: (value: TypeFromSchema<typeof TlvInvokeResponseData>) => void,
    ) {
        const { exchange, interactionServer } = await connect(node, fabric);

        await interactionServer.handleInvokeRequest(
            exchange,
            {
                invokeRequests: [request],
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                suppressResponse: false,
                timedRequest: false,
            },
            {
                ...BarelyMockedMessenger,
                send: async (_type, message) => {
                    const response = TlvInvokeResponseForSend.decode(message).invokeResponses[0];
                    responder(TlvInvokeResponseData.decodeTlv(response));
                },
            } as InteractionServerMessenger,
            BarelyMockedMessage,
        );
    }

    export async function subscribe(
        node: MockServerNode,
        fabric: Fabric,
        request: TypeFromSchema<typeof TlvSubscribeRequest>,
    ) {
        const { exchange, interactionServer } = await connect(node, fabric);

        const channels = node.env.get(ChannelManager);
        channels.getChannel = () => exchange.channel;

        await interactionServer.handleSubscribeRequest(exchange, request, BarelyMockedMessenger, BarelyMockedMessage);
    }

    export function receiveDataReport(node: MockServerNode) {
        return node.handleExchange().then(async exchange => {
            const {
                payloadHeader: { messageType },
                payload,
            } = await exchange.read();
            expect(messageType).equals(MessageType.ReportData);
            await exchange.writeStatus();
            return TlvDataReport.decode(payload, false);
        });
    }

    export async function receiveData(node: MockServerNode, minAttributeCount: number, minEventCount: number) {
        const attributes = Array<AttributeReport>();
        const events = Array<EventReport>();

        while (
            (minAttributeCount > 0 && attributes.length < minAttributeCount) ||
            (minEventCount > 0 && events.length < minEventCount)
        ) {
            const { attributeReports, eventReports } = await receiveDataReport(node);
            if (attributeReports) {
                attributes.push(...attributeReports);
            }
            if (eventReports) {
                events.push(...eventReports);
            }
        }

        return { attributes, events };
    }
}
