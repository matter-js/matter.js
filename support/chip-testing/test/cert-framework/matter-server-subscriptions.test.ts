/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    ClosedError,
    Diagnostic,
    isObject,
    LogDestination,
    Logger,
    LogLevel,
    MockWsConnection,
    UnexpectedDataError,
} from "@matter/general";
import { NodeId } from "@matter/main/types";
import { expect } from "chai";
import { MatterServerClient } from "../../src/matter-server/matter-server-client.js";
import {
    MatterServerSubscriptionEndedError,
    type MatterServerSubscriptionListener,
    MatterServerSubscriptions,
} from "../../src/matter-server/matter-server-subscriptions.js";
import type { WireInteractionReport } from "../../src/matter-server/matter-server-wire.js";
import { waitFor } from "./fake-chip-tool.js";
import { FAKE_SERVER_INFO, FakeMatterServer, type FakeServerRequest } from "./fake-matter-server.js";

async function rejectionOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (e) {
        return e;
    }
    expect.fail("expected a rejection");
}

async function warningsDuring(action: () => Promise<void>) {
    const warnings = new Array<string>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.level >= LogLevel.WARN) {
                warnings.push(String(message.values[0]));
            }
        },
    });
    try {
        await action();
    } finally {
        delete Logger.destinations.capture;
    }
    return warnings;
}

function onOff(report: WireInteractionReport) {
    const entry = report.attributes.find(
        ({ endpoint, cluster, attribute }) => endpoint === 1 && cluster === 6 && attribute === 0,
    );
    return entry?.result.kind === "value" ? entry.result.value : undefined;
}

/** A listener that records what reaches it. */
function recorder() {
    const seen = new Array<unknown>();
    const ended = new Array<Error>();
    const listener: MatterServerSubscriptionListener = {
        report: report => seen.push(onOff(report)),
        ended: cause => ended.push(cause),
    };
    return { seen, ended, listener };
}

describe("MatterServerSubscriptions", () => {
    let server: FakeMatterServer;
    let client: MatterServerClient;
    let subscriptions: MatterServerSubscriptions;
    let pending: FakeServerRequest[];

    beforeEach(async () => {
        server = await FakeMatterServer.start();
        pending = [];
        server.reply = request => {
            if (request.command === "unsubscribe" || request.command === "barrier") {
                return { result: null };
            }
            pending.push(request);
            return undefined;
        };
        client = await MatterServerClient.connect(server.url);
        subscriptions = new MatterServerSubscriptions(client);
    });

    afterEach(async () => {
        await subscriptions.closeAll();
        await client.close();
        await server.close();
        expect(server.failures).deep.equals([]);
    });

    /** The socket keeps frame order, so once the answer arrives every frame the server sent before it was handled. */
    async function barrier() {
        await client.command("barrier");
    }

    function report(id: number, onOffValue: boolean) {
        server.pushEvent("subscription_report", {
            node_id: 5,
            subscription_id: id,
            attributes: { "1/6/0": onOffValue },
            events: [],
        });
    }

    function primed(id: number, onOffValue: boolean) {
        return { result: { subscription_id: id, attributes: { "1/6/0": onOffValue }, events: [] } };
    }

    async function subscribeRequest(count = 1) {
        await waitFor(() => pending.length >= count, `${count} subscribe request(s)`);
        return pending[count - 1];
    }

    async function opened(id: number, onOffValue = true, count = 1) {
        const opening = subscriptions.open(NodeId(5n), {}, "test");
        server.respond((await subscribeRequest(count)).messageId, primed(id, onOffValue));
        return opening;
    }

    const unsubscribed = () =>
        server.requests.filter(({ command }) => command === "unsubscribe").map(({ args }) => args);

    it("takes the priming report from the subscribe response", async () => {
        const subscription = await opened(7, true);

        expect(subscription.id).equals(7);
        expect(onOff(subscription.priming)).equals(true);
    });

    it("tracks a subscription before the report the server sends right after the response", async () => {
        const opening = subscriptions.open(NodeId(5n), {}, "test");
        const request = await subscribeRequest();
        server.respond(request.messageId, primed(7, true));
        report(7, false);
        const subscription = await opening;
        await barrier();

        const { seen, listener } = recorder();
        subscription.listen(listener);
        expect(seen).deep.equals([false]);
    });

    it("drops a report for a subscription it does not track", async () => {
        report(7, false);
        await barrier();
        const subscription = await opened(7);
        await barrier();

        const { seen, listener } = recorder();
        subscription.listen(listener);
        expect(seen).deep.equals([]);
    });

    it("holds the reports after the priming report until a listener is attached", async () => {
        const subscription = await opened(7);
        report(7, false);
        report(7, true);
        await barrier();

        const { seen, listener } = recorder();
        subscription.listen(listener);
        expect(seen).deep.equals([false, true]);

        report(7, false);
        await waitFor(() => seen.length === 3, "a third report");
        expect(seen).deep.equals([false, true, false]);
    });

    it("fails and ends a subscription whose priming report does not have the documented shape", async () => {
        const opening = subscriptions.open(NodeId(5n), {}, "test");
        server.respond((await subscribeRequest()).messageId, { result: { subscription_id: 7, attributes: {} } });

        expect(await rejectionOf(opening)).instanceOf(UnexpectedDataError);
        expect(unsubscribed()).deep.equals([{ node_id: 5, subscription_id: 7 }]);
    });

    it("fails a subscribe answered without a subscription id, and ends nothing", async () => {
        const opening = subscriptions.open(NodeId(5n), {}, "test");
        server.respond((await subscribeRequest()).messageId, { result: { attributes: {}, events: [] } });

        expect(await rejectionOf(opening)).instanceOf(UnexpectedDataError);
        expect(unsubscribed()).deep.equals([]);
    });

    it("tells the listener when the server ends the subscription, and does not end it again", async () => {
        const subscription = await opened(7);
        const { ended, listener } = recorder();
        subscription.listen(listener);

        server.pushEvent("subscription_ended", { node_id: 5, subscription_id: 7 });
        await waitFor(() => ended.length === 1, "the end");
        expect(ended[0]).instanceOf(MatterServerSubscriptionEndedError);

        await subscription.close();
        expect(unsubscribed()).deep.equals([]);
    });

    it("hands an end that arrived before the listener to it once attached", async () => {
        const subscription = await opened(7);
        report(7, false);
        server.pushEvent("subscription_ended", { node_id: 5, subscription_id: 7 });
        await barrier();

        const { seen, ended, listener } = recorder();
        subscription.listen(listener);
        expect(seen).deep.equals([false]);
        expect(ended).to.have.lengthOf(1);
    });

    it("tells the listener when the connection drops, and ends nothing", async () => {
        const subscription = await opened(7);
        const { ended, listener } = recorder();
        subscription.listen(listener);

        server.dropClients();
        await waitFor(() => ended.length === 1, "the end");

        expect(ended[0]).instanceOf(ClosedError);
        expect(unsubscribed()).deep.equals([]);
    });

    it("ends every subscription when the subscriptions close", async () => {
        await opened(7);
        await opened(8, true, 2);
        await subscriptions.closeAll();

        expect(unsubscribed()).deep.equals([
            { node_id: 5, subscription_id: 7 },
            { node_id: 5, subscription_id: 8 },
        ]);
    });

    it("refuses and ends a subscription the server answers after the subscriptions closed", async () => {
        const outcome = rejectionOf(subscriptions.open(NodeId(5n), {}, "test"));
        const request = await subscribeRequest();
        await subscriptions.closeAll();
        server.respond(request.messageId, primed(7, true));

        expect(await outcome).instanceOf(ClosedError);
        expect(unsubscribed()).deep.equals([{ node_id: 5, subscription_id: 7 }]);
    });

    it("ends a subscription with a later report that does not have the documented shape, and delivers nothing after", async () => {
        const subscription = await opened(7);
        const { seen, ended, listener } = recorder();
        subscription.listen(listener);

        server.pushEvent("subscription_report", { node_id: 5, subscription_id: 7, attributes: {} });
        report(7, false);
        await waitFor(() => ended.length === 1, "the end");
        await barrier();

        expect(ended[0]).instanceOf(UnexpectedDataError);
        expect(seen).deep.equals([]);
        await waitFor(() => unsubscribed().length === 1, "unsubscribe");
        expect(unsubscribed()).deep.equals([{ node_id: 5, subscription_id: 7 }]);
    });

    it("ends a subscription whose listener throws, in place of the reports still held", async () => {
        const subscription = await opened(7);
        report(7, false);
        report(7, true);
        server.pushEvent("subscription_ended", { node_id: 5, subscription_id: 7 });
        await barrier();

        const failure = new UnexpectedDataError("listener failure");
        const seen = new Array<unknown>();
        const ended = new Array<Error>();
        subscription.listen({
            report: next => {
                seen.push(onOff(next));
                throw failure;
            },
            ended: cause => ended.push(cause),
        });

        expect(seen).deep.equals([false]);
        expect(ended).deep.equals([failure]);
    });

    it("hands the reports held before an unusable one on, then the end", async () => {
        const subscription = await opened(7);
        report(7, false);
        server.pushEvent("subscription_report", { node_id: 5, subscription_id: 7, attributes: {} });
        await barrier();

        const { seen, ended, listener } = recorder();
        subscription.listen(listener);
        expect(seen).deep.equals([false]);
        expect(ended).lengthOf(1);
        expect(ended[0]).instanceOf(UnexpectedDataError);
    });

    it("waits in closeAll for the unsubscribe of a subscription it ended", async () => {
        const subscription = await opened(7);
        const { ended, listener } = recorder();
        subscription.listen(listener);
        server.reply = request => {
            if (request.command === "barrier") {
                return { result: null };
            }
            pending.push(request);
            return undefined;
        };

        server.pushEvent("subscription_report", { node_id: 5, subscription_id: 7, attributes: {} });
        await waitFor(() => ended.length === 1, "the end");
        const unsubscribe = await subscribeRequest(2);
        let closed = false;
        const closing = subscriptions.closeAll().then(() => (closed = true));
        await barrier();
        expect(closed).equals(false);

        server.respond(unsubscribe.messageId, { result: null });
        await closing;
        expect(unsubscribe.command).equals("unsubscribe");
    });

    for (const [missing, data] of [
        ["subscription id", { node_id: 5 }],
        ["node id", { subscription_id: 7 }],
    ] as const) {
        it(`ignores a subscription event without a ${missing}, and says so`, async () => {
            const subscription = await opened(7);
            const { seen, listener } = recorder();
            subscription.listen(listener);
            const warnings = await warningsDuring(async () => {
                server.pushEvent("subscription_report", { ...data, attributes: { "1/6/0": false }, events: [] });
                await barrier();
            });

            expect(warnings.some(warning => warning.includes("without a node and subscription id"))).equals(true);
            expect(seen).deep.equals([]);
            expect(subscription.id).equals(7);
        });
    }

    describe("with the same subscription id on two nodes", () => {
        async function openOn(node: bigint, id: number, count: number) {
            const opening = subscriptions.open(NodeId(node), {}, `node ${node}`);
            server.respond((await subscribeRequest(count)).messageId, primed(id, true));
            const subscription = await opening;
            const recorded = recorder();
            subscription.listen(recorded.listener);
            return { subscription, ...recorded };
        }

        function reportFor(node: number, id: number, onOffValue: boolean) {
            server.pushEvent("subscription_report", {
                node_id: node,
                subscription_id: id,
                attributes: { "1/6/0": onOffValue },
                events: [],
            });
        }

        it("sends the node with subscribe and routes each report to the subscription of its node", async () => {
            const first = await openOn(5n, 7, 1);
            const second = await openOn(6n, 7, 2);
            expect(pending.map(({ args }) => (args as { node_id: unknown }).node_id)).deep.equals([5, 6]);

            reportFor(6, 7, false);
            reportFor(5, 7, true);
            await barrier();

            expect(first.seen).deep.equals([true]);
            expect(second.seen).deep.equals([false]);
        });

        it("ends only the subscription of the node the server names, and unsubscribes by node", async () => {
            const first = await openOn(5n, 7, 1);
            const second = await openOn(6n, 7, 2);

            server.pushEvent("subscription_ended", { node_id: 6, subscription_id: 7 });
            await waitFor(() => second.ended.length === 1, "the end");
            expect(first.ended).deep.equals([]);

            await first.subscription.close();
            await second.subscription.close();
            expect(unsubscribed()).deep.equals([{ node_id: 5, subscription_id: 7 }]);
        });

        it("drops a report for a node and id it does not track", async () => {
            const first = await openOn(5n, 7, 1);

            reportFor(6, 7, false);
            reportFor(5, 8, false);
            await barrier();

            expect(first.seen).deep.equals([]);
            expect(first.ended).deep.equals([]);
        });
    });

    it("ends a subscription once, however often it is closed", async () => {
        const subscription = await opened(7);

        await subscription.close();
        await subscription.close();
        await subscriptions.closeAll();
        expect(unsubscribed()).deep.equals([{ node_id: 5, subscription_id: 7 }]);
    });
});

describe("MatterServerSubscriptions over one delivery", () => {
    it("tracks a subscription before a report the same delivery carries right after the response", async () => {
        const { client: clientSide, server: serverSide } = MockWsConnection();
        const writer = serverSide.writable.getWriter();
        const reader = serverSide.readable.getReader();
        await writer.write(JSON.stringify(FAKE_SERVER_INFO));
        const client = await MatterServerClient.open(clientSide, "mock");
        const subscriptions = new MatterServerSubscriptions(client);
        try {
            const opening = subscriptions.open(NodeId(5n), {}, "test");
            const { value } = await reader.read();
            const request: unknown = JSON.parse(
                typeof value === "string" ? value : Bytes.toString(value ?? new Uint8Array()),
            );
            if (!isObject(request) || typeof request.message_id !== "string") {
                expect.fail("expected a subscribe request");
            }

            // Both frames are queued before the client reads either, as one TCP read hands them over
            await Promise.all([
                writer.write(
                    JSON.stringify({
                        message_id: request.message_id,
                        result: { subscription_id: 7, attributes: { "1/6/0": true }, events: [] },
                    }),
                ),
                writer.write(
                    JSON.stringify({
                        event: "subscription_report",
                        data: { node_id: 5, subscription_id: 7, attributes: { "1/6/0": false }, events: [] },
                    }),
                ),
            ]);
            const subscription = await opening;

            const { seen, listener } = recorder();
            await new Promise(resolve => setImmediate(resolve));
            subscription.listen(listener);
            expect(seen).deep.equals([false]);
        } finally {
            // The server side goes first, so nothing is left to unsubscribe from a peer that would never answer
            await writer.close();
            await client.close();
            await subscriptions.closeAll();
        }
    });
});
