/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffServer } from "#behaviors/on-off";
import { ServerSubscriptionConfig } from "#node/server/ServerSubscription.js";
import { Crypto, Millis, Time } from "@matter/general";
import { Specification } from "@matter/model";
import { ExchangeManager, Invoke, ProtocolMocks } from "@matter/protocol";
import {
    AttributeId,
    AttributePath,
    ClusterId,
    CommandId,
    DelayReportData,
    EndpointNumber,
    EventId,
    TypeFromSchema,
    TlvInvokeResponseData,
} from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { Identify } from "@matter/types/clusters/identify";
import { OnOff } from "@matter/types/clusters/on-off";
import { MockServerNode } from "./mock-server-node.js";
import { interaction } from "./node-helpers.js";

type Fabric = Awaited<ReturnType<MockServerNode["addFabric"]>>;

/** Time a changed attribute takes to go out without a deferral: the subscription's send delay. */
const SEND_DELAY = 50;

const onOffPath: AttributePath = {
    endpointId: EndpointNumber(1),
    clusterId: ClusterId(OnOff.id),
    attributeId: AttributeId(OnOff.attributes.onOff.id),
};

const nodeLabelPath: AttributePath = {
    endpointId: EndpointNumber(0),
    clusterId: ClusterId(BasicInformation.id),
    attributeId: AttributeId(BasicInformation.attributes.nodeLabel.id),
};

async function createNode() {
    // No randomization, so a subscription with a 10 s ceiling sends every 8 s
    return MockServerNode.createOnline(undefined, {
        network: { subscriptionOptions: ServerSubscriptionConfig.of({ randomizationWindow: Millis(0) }) },
    });
}

async function subscribe(node: MockServerNode, fabric: Fabric, path: AttributePath, maxIntervalCeilingSeconds = 60) {
    await interaction.subscribe(node, fabric, {
        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        isFabricFiltered: false,
        attributeRequests: [path],
        keepSubscriptions: true,
        minIntervalFloorSeconds: 0,
        maxIntervalCeilingSeconds,
    });
}

/**
 * Invoke OnOff "toggle" on {@link endpointId}, which changes OnOff.onOff there.
 */
async function toggle(
    node: MockServerNode,
    fabric: Fabric,
    delayReportData?: DelayReportData,
    endpointId: number | "wildcard" = 1,
) {
    let response: TypeFromSchema<typeof TlvInvokeResponseData> | undefined;
    await interaction.invoke(
        node,
        fabric,
        {
            commandPath: {
                endpointId: endpointId === "wildcard" ? undefined : EndpointNumber(endpointId),
                clusterId: ClusterId(OnOff.id),
                commandId: CommandId(OnOff.commands.toggle.id),
            },
        },
        invokeResponse => (response = invokeResponse),
        { delayReportData },
    );
    return response;
}

/**
 * The next data report the node sends.  {@link after} is the time, relative to the request, at which the node opened
 * the exchange for it; the test's own reads of the report can lag behind that in mock time.
 */
function nextReport(node: MockServerNode) {
    const start = Time.nowMs;
    const exchangeManager = node.env.get(ExchangeManager);
    const { initiateExchange } = exchangeManager;
    let after: number | undefined;
    exchangeManager.initiateExchange = (...args) => {
        after ??= Time.nowMs - start;
        return initiateExchange.apply(exchangeManager, args);
    };
    const received = interaction.receiveData(node, 1, 0).finally(() => {
        exchangeManager.initiateExchange = initiateExchange;
    });
    return {
        start,
        received,
        get after() {
            return after;
        },
    };
}

/**
 * Invoke Identify "identify" on endpoint 1, which changes no OnOff attribute.
 */
async function identify(node: MockServerNode, fabric: Fabric, delayReportData: DelayReportData) {
    await interaction.invoke(
        node,
        fabric,
        Invoke.Command({
            endpoint: EndpointNumber(1),
            cluster: Identify,
            command: "identify",
            fields: { identifyTime: 0 },
        }),
        () => {},
        { delayReportData },
    );
}

/**
 * Record the time of every report the node sends, and acknowledge each one as it is sent.
 */
function acknowledgeReports(node: MockServerNode) {
    const exchangeManager = node.env.get(ExchangeManager);
    const { initiateExchange } = exchangeManager;
    const sent = new Array<number>();
    const acknowledgements = new Array<Promise<void>>();
    exchangeManager.initiateExchange = (...args) => {
        sent.push(Time.nowMs);
        const exchange = initiateExchange.apply(exchangeManager, args);
        // Queued before the node waits for it, so waiting for the acknowledgement does not advance mock time
        if (exchange instanceof ProtocolMocks.Exchange) {
            acknowledgements.push(exchange.writeStatus());
        }
        return exchange;
    };
    return {
        sent,
        async acknowledge() {
            await Promise.all(acknowledgements.splice(0));
            // A report can wait on the host task queue, which mock time does not visit
            await MockTime.macrotask;
        },
    };
}

/**
 * Expect {@link report} to be sent between {@link earliest} and {@link latest} milliseconds after it was requested.
 */
async function expectReportAt(report: ReturnType<typeof nextReport>, earliest: number, latest: number) {
    await MockTime.advance(report.start + earliest - 1 - Time.nowMs);
    expect(report.after).undefined;
    await MockTime.advance(latest - earliest + 1);
    expect(report.after).not.undefined;
    expect(report.after).at.least(earliest);
    expect(report.after).at.most(latest);
    await MockTime.resolve(report.received);
}

describe("DelayReportData", () => {
    before(() => {
        MockTime.init();
    });

    describe("with the delay-report-data forward feature", () => {
        MockForwardFeatures.enable("delay-report-data");

        it("defers the next report by DelayMinMs", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });

            await expectReportAt(report, 1000, 1000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("adds a random jitter below DelayJitterWindowMs", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            // MockCrypto's randomness is constant, so this is the jitter the server picks
            const jitter = node.env.get(Crypto).randomUint32 % 500;
            expect(jitter).above(SEND_DELAY);

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 500 });

            await expectReportAt(report, 1000 + jitter, 1000 + jitter + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("defers whether or not the command succeeds", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            let failing: TypeFromSchema<typeof TlvInvokeResponseData> | undefined;
            await interaction.invoke(
                node,
                fabric,
                {
                    commandPath: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(OnOff.id),
                        commandId: CommandId(OnOff.commands.onWithTimedOff.id),
                    },
                },
                response => (failing = response),
                { delayReportData: { delayMinMs: 1000, delayJitterWindowMs: 0 } },
            );
            expect(failing?.status?.status?.status).not.equals(0);

            await MockTime.resolve(node.parts.get(1)!.setStateOf(OnOffServer, { onOff: true }), { stepMs: 1 });
            await expectReportAt(report, 1000, 1000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("keeps a deferral that ends earlier than a new one", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 2000, delayJitterWindowMs: 0 });
            await MockTime.advance(500);
            await toggle(node, fabric, { delayMinMs: 5000, delayJitterWindowMs: 0 });

            await expectReportAt(report, 2000, 2000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("shortens a deferral that ends later than a new one", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 5000, delayJitterWindowMs: 0 });
            await MockTime.advance(1000);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });

            await expectReportAt(report, 2000, 2000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("applies a new deferral after an earlier one ended", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const first = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });
            await expectReportAt(first, 1000, 1000 + SEND_DELAY);

            const second = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });
            await expectReportAt(second, 1000, 1000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("holds a report that is already waiting for its send delay", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            await MockTime.resolve(node.parts.get(1)!.setStateOf(OnOffServer, { onOff: true }), { stepMs: 1 });
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });

            await expectReportAt(report, 1000, 1000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("defers for a wildcard invoke on the endpoints it expands to", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 }, "wildcard");

            await expectReportAt(report, 1000, 1000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("defers a subscription of another fabric", async () => {
            const node = await createNode();
            const invoking = await node.addFabric();
            const subscribing = await node.addFabric();
            await subscribe(node, subscribing, onOffPath);

            const report = nextReport(node);
            await toggle(node, invoking, { delayMinMs: 1000, delayJitterWindowMs: 0 });

            await expectReportAt(report, 1000, 1000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("still reports within the send interval under a stream of deferring invokes", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            // MaxInterval 10 s, so the subscription reports every 8 s
            await subscribe(node, fabric, onOffPath, 10);
            const reports = acknowledgeReports(node);
            const start = Time.nowMs;

            while (Time.nowMs - start < 17_000) {
                await toggle(node, fabric, { delayMinMs: 60_000, delayJitterWindowMs: 0 });
                await MockTime.advance(40);
                await reports.acknowledge();
            }

            // Held by the deferral, so only the reports the send interval forces go out
            expect(reports.sent).length(2);
            let previous: number = start;
            for (const at of reports.sent) {
                expect(at - previous).at.most(8000);
                previous = at;
            }

            await MockTime.resolve(node.close());
        });

        it("still reports after the send delay under a stream of invokes without delay", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);
            const reports = acknowledgeReports(node);
            const start = Time.nowMs;

            for (let i = 0; i < 10; i++) {
                await toggle(node, fabric, { delayMinMs: 0, delayJitterWindowMs: 0 });
                await MockTime.advance(40);
                await reports.acknowledge();
            }

            expect(reports.sent.length).at.least(1);
            expect(reports.sent[0] - start).at.most(SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("reschedules a held report when a later invoke shortens the deferral", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 5000, delayJitterWindowMs: 0 });
            await MockTime.advance(1000);
            await identify(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });

            await expectReportAt(report, 2000, 2000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        // Characterization: the deferred report is followed by the regular keep-alive only
        it("sends no extra report after a deferred one", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath, 10);
            const reports = acknowledgeReports(node);

            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });
            await MockTime.advance(1000 + SEND_DELAY);
            await reports.acknowledge();
            expect(reports.sent).length(1);

            await MockTime.advance(7000);
            await reports.acknowledge();
            expect(reports.sent).length(1);

            await MockTime.resolve(node.close());
        });

        it("does not hold a report past the subscription's next scheduled report", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            // MaxInterval 10 s, so the subscription reports every 8 s
            await subscribe(node, fabric, onOffPath, 10);

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 60_000, delayJitterWindowMs: 0 });

            await expectReportAt(report, 8000 - SEND_DELAY, 8000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        // Characterization: a deferral ends by time, so the report after the deferred one is not held
        it("defers only the next report", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const deferred = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });
            await expectReportAt(deferred, 1000, 1000 + SEND_DELAY);

            const next = nextReport(node);
            await toggle(node, fabric);
            await expectReportAt(next, SEND_DELAY, SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("does not defer a subscription that selects no targeted endpoint", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, nodeLabelPath);

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });
            await MockTime.resolve(node.set({ basicInformation: { nodeLabel: "relabeled" } }), { stepMs: 1 });

            await expectReportAt(report, SEND_DELAY, SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("defers a subscription whose path selects every endpoint", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, { ...nodeLabelPath, endpointId: undefined });

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });
            await MockTime.resolve(node.set({ basicInformation: { nodeLabel: "relabeled" } }), { stepMs: 1 });

            await expectReportAt(report, 1000, 1000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("defers a subscription whose event path selects a targeted endpoint", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await interaction.subscribe(node, fabric, {
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                isFabricFiltered: false,
                attributeRequests: [nodeLabelPath],
                eventRequests: [{ endpointId: EndpointNumber(1), clusterId: ClusterId(OnOff.id), eventId: EventId(0) }],
                keepSubscriptions: true,
                minIntervalFloorSeconds: 0,
                maxIntervalCeilingSeconds: 60,
            });

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });
            await MockTime.resolve(node.set({ basicInformation: { nodeLabel: "relabeled" } }), { stepMs: 1 });

            await expectReportAt(report, 1000, 1000 + SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("does not defer when no command of the invoke can be dispatched", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            // No OnOff cluster on endpoint 0
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 }, 0);
            await MockTime.resolve(node.parts.get(1)!.setStateOf(OnOffServer, { onOff: true }), { stepMs: 1 });

            await expectReportAt(report, SEND_DELAY, SEND_DELAY);

            await MockTime.resolve(node.close());
        });

        it("does not defer a subscription of every endpoint when no command can be dispatched", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, { ...nodeLabelPath, endpointId: undefined });

            const report = nextReport(node);
            await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 }, 0);
            await MockTime.resolve(node.set({ basicInformation: { nodeLabel: "relabeled" } }), { stepMs: 1 });

            await expectReportAt(report, SEND_DELAY, SEND_DELAY);

            await MockTime.resolve(node.close());
        });
    });

    describe("while forward Matter features are off", () => {
        before(function () {
            if (Specification.ENABLE_FORWARD_MATTER_FEATURES) this.skip();
        });

        it("ignores DelayReportData", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            await subscribe(node, fabric, onOffPath);

            const report = nextReport(node);
            const response = await toggle(node, fabric, { delayMinMs: 1000, delayJitterWindowMs: 0 });
            expect(response?.status?.status?.status).equals(0);

            await expectReportAt(report, SEND_DELAY, SEND_DELAY);

            await MockTime.resolve(node.close());
        });
    });
});
