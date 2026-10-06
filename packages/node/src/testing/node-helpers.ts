/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { BasicInformationBehavior } from "#behaviors/basic-information";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import {
    ClientEndpointInitializer,
    ClientNode,
    CommissioningServer,
    Endpoint,
    InteractionServer,
    NetworkClient,
    ServerNode,
} from "#index.js";
import { Bytes, Crypto, type Environment, InternalError, Millis, Seconds } from "@matter/general";
import { Specification } from "@matter/model";
import {
    Certificate,
    Fabric,
    FabricManager,
    InteractionServerMessenger,
    InvokeResponseForSend,
    Message,
    Val,
    MessageType,
    SessionType,
    SustainedSubscription,
    TestFabric,
    TlvCertSigningRequest,
    WriteResponse,
} from "@matter/protocol";
import {
    AttributeReport,
    DelayReportData,
    EventReport,
    FabricId,
    FabricIndex,
    NodeId,
    Status,
    TlvDataReport,
    TlvInvokeRequest,
    TlvInvokeResponseData,
    TlvReadRequest,
    TlvSubscribeRequest,
    TlvWriteRequest,
    TypeFromSchema,
    VendorId,
} from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { MockServerNode } from "./mock-server-node.js";

/**
 * Wait until the given nodes have no activity in flight.
 *
 * Work a node performs in reaction to an event registers as activity only once the reactor runs, so a node can look
 * idle with work imminent.  This yields task turns until every node reports itself idle, and never advances mock time
 * — a test that needs a timer to fire advances the clock itself, and doing so here would change what it observes.
 */
export async function settled(...nodes: Array<{ env: Environment }>) {
    const activities = nodes.map(node => node.env.get(NodeActivity));

    let transitions = 0;
    const observer = () => {
        transitions++;
    };
    for (const activity of activities) {
        activity.inactive.on(observer);
    }

    try {
        for (let turn = 0; turn < 1000; turn++) {
            const before = transitions;

            await MockTime.macrotask;

            // Idle alone is not quiescence: one reactor may have closed while scheduling another for the next turn.
            // A turn in which nothing started or finished means nothing is waiting to run
            if (transitions === before && activities.every(activity => activity.inactive.value)) {
                return;
            }
        }
    } finally {
        for (const activity of activities) {
            activity.inactive.off(observer);
        }
    }

    throw new InternalError("Nodes did not settle; work is blocked on time that the test must advance itself");
}

/**
 * Fail-safe length in seconds that {@link CommissioningHelper} arms during commissioning.
 */
export const FAILSAFE_LENGTH_S = 60;

/**
 * Runs a factory reset on a node and checks the outcome with `expect`: previous online state resumed, basic information
 * present, unique id regenerated, pairing codes available, and the expected online/offline transitions seen.  Closes the
 * node at the end.  `mode` sets the starting state: `online` and `offline-after-commission` commission a node first;
 * `offline` uses an uncommissioned node that is never started; `offline-during-reset` stops the node while erase runs.
 */
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
        await node.stop();
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
        offlinePromise = node.stop();
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

/**
 * Returns helpers that commission a {@link MockServerNode} by invoking the commissioning commands directly on it, without a
 * real controller.  `fabricNumber` holds the fabric index last used.
 */
export function CommissioningHelper() {
    return {
        fabricNumber: undefined as number | undefined,

        /**
         * Runs the commissioning sequence up to and including AddNOC, leaving the fail-safe armed.  Creates the node with
         * {@link MockServerNode.createOnline} if none is given.  Returns the node, the exchange context used and the controller's
         * fabric.  `index` selects the fabric index and the test authority.
         */
        async almostCommission(node?: MockServerNode, index = 1) {
            const authority = await TestFabric.Authority({ index });

            // This is the controller's version of the fabric
            const controllerFabric = await authority.createFabric({
                adminFabricLabel: `mock-fabric-${index}`,
                adminVendorId: VendorId(0xfff1),
                adminFabricIndex: FabricIndex(index),
                adminFabricId: FabricId(1),
            });

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
            const peerPublicKey = await Certificate.getPublicKeyFromCsr(crypto, certSigningRequest);
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

        /**
         * Runs {@link almostCommission}, then sends CommissioningComplete on a new session in the new fabric and waits until the node
         * is commissioned.  Returns the node, the context options for further calls and the device's fabric.
         */
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
        sendStatus: (_code: Status) => {},
        sendDataReport: async (_options: unknown) => {},
        send: async (_type: number, _message: Bytes) => {},
        close: async () => {},
        sendWriteResponse: async (_response: WriteResponse) => {},
        readNextWriteRequest: async () => {
            throw new InternalError("Mock messenger received a request for another write chunk, but none is queued");
        },
        sendInvokeResponseChunk: async (_response: InvokeResponseForSend) => true,
        sendInvokeResponse: async (_response: InvokeResponseForSend) => {},
    } as unknown as InteractionServerMessenger;

    /**
     * Creates a mock messenger that captures the invoke response.
     */
    /**
     * Creates a stub messenger that records the invoke response sent through it.  `getResponse` returns it, or `undefined` if none was sent.
     */
    export function createInvokeMessenger(): {
        messenger: InteractionServerMessenger;
        getResponse: () => InvokeResponseForSend | undefined;
    } {
        let capturedResponse: InvokeResponseForSend | undefined;
        return {
            messenger: {
                ...BarelyMockedMessenger,
                sendInvokeResponse: async (response: InvokeResponseForSend) => {
                    capturedResponse = response;
                },
            } as unknown as InteractionServerMessenger,
            getResponse: () => capturedResponse,
        };
    }

    /**
     * Minimal unicast message, enough for the interaction server handlers.
     */
    export const BarelyMockedMessage = {
        packetHeader: { sessionType: SessionType.Unicast, messageId: 123 },
    } as Message;

    /**
     * Minimal group message, enough for the interaction server handlers.
     */
    export const BarelyMockedGroupMessage = {
        packetHeader: { sessionType: SessionType.Group, messageId: 123 },
    } as Message;

    /**
     * Creates a mock secure session on the node in the given fabric.  Returns its exchange and the node's interaction server.
     */
    export async function connect(node: MockServerNode, fabric: Fabric) {
        const exchange = await node.createExchange({ fabric });

        const interactionServer = node.env.get(InteractionServer);

        return { exchange, interactionServer };
    }

    /**
     * Sends a single-item write request through the node's interaction server and discards the response.
     */
    export async function write(
        node: MockServerNode,
        fabric: Fabric,
        request: TypeFromSchema<typeof TlvWriteRequest>["writeRequests"][number],
    ) {
        const { exchange, interactionServer } = await connect(node, fabric);

        const writeRequest = {
            suppressResponse: true,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            timedRequest: false,
            writeRequests: [request],
        };
        await interactionServer.handleWriteRequest(exchange, writeRequest, BarelyMockedMessenger, BarelyMockedMessage);
    }

    /**
     * Sends a single attribute read request.  Returns the payload of the first attribute data of the response, or `undefined` if the first response item is not attribute data.
     */
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

    /**
     * Sends a single-item invoke request and calls `responder` with the first decoded invoke response, if any.  `options.timed` runs it as a timed interaction.
     */
    export async function invoke(
        node: MockServerNode,
        fabric: Fabric,
        request: TypeFromSchema<typeof TlvInvokeRequest>["invokeRequests"][number],
        responder: (value: TypeFromSchema<typeof TlvInvokeResponseData>) => void,
        options?: { timed?: boolean; delayReportData?: DelayReportData },
    ) {
        const { exchange, interactionServer } = await connect(node, fabric);

        if (options?.timed) {
            exchange.startTimedInteraction(Seconds(10));
        }

        const { messenger, getResponse } = createInvokeMessenger();
        await interactionServer.handleInvokeRequest(
            exchange,
            {
                invokeRequests: [request],
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                suppressResponse: false,
                timedRequest: options?.timed ?? false,
                delayReportData: options?.delayReportData,
            },
            messenger,
            BarelyMockedMessage,
        );

        // Process the response
        const result = getResponse();
        if (result?.invokeResponses?.length) {
            const response = result.invokeResponses[0];
            responder(TlvInvokeResponseData.decodeTlv(response));
        }
    }

    /**
     * Sends a subscribe request through the node's interaction server.  The response is not captured.
     */
    export async function subscribe(
        node: MockServerNode,
        fabric: Fabric,
        request: TypeFromSchema<typeof TlvSubscribeRequest>,
    ) {
        const { exchange, interactionServer } = await connect(node, fabric);

        await interactionServer.handleSubscribeRequest(exchange, request, BarelyMockedMessenger, BarelyMockedMessage);
    }

    /**
     * Waits for the node to initiate an exchange, expects a ReportData message, acknowledges it with a status response and returns the decoded report.
     */
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

    /**
     * Collects data reports from {@link receiveDataReport} until at least the given number of attribute reports and event reports arrived.  A minimum of 0 means that kind is not waited for.
     */
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

/**
 * Seed a peer's local cache as if the device had reported {@link values}, keyed by attribute ID.
 *
 * This is the only way for a test to install cached values a write cannot produce, such as a stale value for a
 * read-only attribute.
 */
export async function seedPeerCache(
    peer: ClientNode,
    endpoint: Endpoint,
    type: ClusterBehavior.Type,
    values: Val.StructMap,
) {
    const structure = clientStructureOf(peer);

    // storeForRemote() creates structure on miss, leaving an orphan cluster and cache behind, so check first that the
    // behavior really is active — otherwise the store would have no consumer and seed nothing observable
    if (structure.endpointFor(endpoint.number) !== endpoint || !endpoint.behaviors.has(type)) {
        throw new InternalError(`${endpoint}.${type.id} is not active on ${peer.id}`);
    }

    await structure.storeForRemote(endpoint, type).externalSet(values);
}

/**
 * The client structure of a client node, for tests that feed it reports directly.
 */
export function clientStructureOf(peer: ClientNode) {
    const initializer = peer.env.get(EndpointInitializer);
    if (!(initializer instanceof ClientEndpointInitializer)) {
        throw new InternalError(`Node ${peer.id} is not a client node`);
    }

    return initializer.structure;
}

/**
 * Waits, advancing mock time, until the controller's peer `id` has an active subscription, and returns the peer.  Fails an
 * `expect` if the peer does not exist or has no subscription after about 10 s of mock time.
 */
export async function subscribedPeer(controller: ServerNode, id: string) {
    const peer = controller.peers.get(id);
    expect(peer).to.not.equal(undefined);

    // A peer that starts with its node sets activeSubscription only once it has sent its subscribe request
    const network = peer!.behaviors.internalsOf(NetworkClient);
    for (let wait = 0; network.activeSubscription === undefined && wait < 100; wait++) {
        await MockTime.resolve(MockTime.sleep("subscription pending", Millis(100)));
    }

    const subscription = network.activeSubscription as SustainedSubscription;
    expect(subscription).to.not.equal(undefined);

    await MockTime.resolve(subscription.active);

    return peer!;
}

/**
 * The messages of the error a promise rejects with and of all of its causes, including aggregated ones.  Endpoint
 * construction reports behavior failures as an aggregate.
 */
export async function causeMessagesOf(promise: Promise<unknown>) {
    const error = await promise.then(
        () => undefined,
        (e: unknown) => e ?? new InternalError("Promise rejected without a reason"),
    );
    if (error === undefined) {
        throw new InternalError("Expected the promise to reject");
    }
    const messages = new Array<string>();
    const pending: unknown[] = [error];
    while (pending.length) {
        const next = pending.shift();
        if (!(next instanceof Error)) {
            continue;
        }
        messages.push(next.message);
        if (next.cause !== undefined) {
            pending.push(next.cause);
        }
        if ("errors" in next && Array.isArray(next.errors)) {
            pending.push(...next.errors);
        }
    }
    return messages.join(" | ");
}
