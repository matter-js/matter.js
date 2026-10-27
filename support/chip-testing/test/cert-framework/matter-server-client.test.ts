/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ClosedError,
    Diagnostic,
    InternalError,
    LogDestination,
    Logger,
    LogLevel,
    Millis,
    MockWsConnection,
    TimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import { expect } from "chai";
import {
    MatterServerClient,
    MatterServerCommandError,
    parseBigIntAwareJson,
    toBigIntAwareJson,
} from "../../src/matter-server/matter-server-client.js";
import { startStalledServer, waitFor } from "./fake-chip-tool.js";
import { FAKE_SERVER_INFO, FakeMatterServer } from "./fake-matter-server.js";

const BIG_NODE_ID = 0xfffffffe00000001n;

async function warningsDuring(action: () => Promise<void>) {
    const lines = new Array<string>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.level === LogLevel.WARN) {
                lines.push(String(message.values[0]));
            }
        },
    });
    try {
        await action();
    } finally {
        delete Logger.destinations.capture;
    }
    return lines;
}

describe("MatterServerClient", () => {
    let server: FakeMatterServer;
    let client: MatterServerClient | undefined;

    beforeEach(async () => {
        server = await FakeMatterServer.start();
        client = undefined;
    });

    afterEach(async () => {
        await client?.close();
        await server.close();
        expect(server.failures).deep.equals([]);
    });

    it("resolves connect with server_info", async () => {
        client = await MatterServerClient.connect(server.url);

        expect(client.serverInfo).deep.equals(FAKE_SERVER_INFO);
    });

    it("rejects connect when aborted before server_info arrives", async () => {
        const controller = new AbortController();
        controller.abort();

        let error: unknown;
        try {
            await MatterServerClient.connect(server.url, controller.signal);
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(ClosedError);
    });

    it("rejects connect when aborted while the handshake is pending", async () => {
        const stalled = await startStalledServer();
        try {
            const controller = new AbortController();
            const connecting = MatterServerClient.connect(`ws://127.0.0.1:${stalled.port}`, controller.signal);
            controller.abort();

            let error: unknown;
            try {
                await connecting;
            } catch (e) {
                error = e;
            }
            expect(error).instanceOf(ClosedError);
        } finally {
            await stalled.close();
        }
    });

    it("rejects connect when no server_info arrives in time", async () => {
        const stalled = await startStalledServer();
        try {
            let error: unknown;
            try {
                await MatterServerClient.connect(`ws://127.0.0.1:${stalled.port}`, undefined, Millis(50));
            } catch (e) {
                error = e;
            }
            expect(error).instanceOf(TimeoutError);
        } finally {
            await stalled.close();
        }
    });

    it("correlates concurrent commands by message_id", async () => {
        client = await MatterServerClient.connect(server.url);

        const first = client.command("first");
        const second = client.command("second");
        await waitFor(() => server.requests.length === 2, "both requests");

        const [a, b] = server.requests;
        expect(a.messageId).not.equals(b.messageId);
        server.respond(b.messageId, { result: "reply-second" });
        server.respond(a.messageId, { result: "reply-first" });

        expect(await first).equals("reply-first");
        expect(await second).equals("reply-second");
    });

    it("sends command and args in the request", async () => {
        client = await MatterServerClient.connect(server.url);
        server.reply = () => ({ result: null });

        await client.command("get_node", { node_id: 5 });
        await client.command("get_nodes");

        expect(server.requests.map(({ command, args }) => ({ command, args }))).deep.equals([
            { command: "get_node", args: { node_id: 5 } },
            { command: "get_nodes", args: undefined },
        ]);
    });

    it("rejects with MatterServerCommandError", async () => {
        client = await MatterServerClient.connect(server.url);
        server.reply = () => ({ errorCode: 7, details: "no such node" });

        let error: unknown;
        try {
            await client.command("get_node", { node_id: 9 });
        } catch (e) {
            error = e;
        }

        if (!(error instanceof MatterServerCommandError)) {
            throw new InternalError(`Expected MatterServerCommandError, got ${error}`);
        }
        const failure = error;
        expect(failure.command).equals("get_node");
        expect(failure.errorCode).equals(7);
        expect(failure.details).equals("no such node");
    });

    it("carries the status, cluster status and reason of an error reply", async () => {
        client = await MatterServerClient.connect(server.url);
        server.reply = () => ({
            errorCode: 1,
            details: "failed",
            failure: { status: 0x81, cluster_status: 2, reason: "other" },
        });

        const error = await client.command("device_command").catch((e: unknown) => e);
        if (!(error instanceof MatterServerCommandError)) {
            expect.fail(`expected a MatterServerCommandError, got ${error}`);
        }
        expect(error.failure).deep.equals({ status: 0x81, clusterStatus: 2, reason: "other" });
    });

    it("rejects a command whose error reply carries a malformed cause field, and keeps the connection", async () => {
        const connected = await MatterServerClient.connect(server.url);
        client = connected;
        server.reply = ({ command }) => (command === "next" ? { result: "alive" } : undefined);

        for (const [index, field] of [{ status: "busy" }, { cluster_status: "2" }, { reason: 4 }].entries()) {
            const failing = connected.command("first").catch((e: unknown) => e);
            await waitFor(() => server.requests.length === index * 2 + 1, "request");
            server.sendRaw(
                JSON.stringify({ message_id: server.requests[index * 2].messageId, error_code: 1, ...field }),
            );

            expect(await failing, JSON.stringify(field)).instanceOf(UnexpectedDataError);
            expect(await connected.command("next")).equals("alive");
        }
    });

    it("emits events", async () => {
        client = await MatterServerClient.connect(server.url);
        const seen = new Array<[string, unknown]>();
        client.events.on((event, data) => void seen.push([event, data]));

        server.pushEvent("node_added", { node_id: 3 });
        await waitFor(() => seen.length === 1, "event");

        expect(seen).deep.equals([["node_added", { node_id: 3 }]]);
    });

    it("round-trips bigint node ids", async () => {
        client = await MatterServerClient.connect(server.url);
        server.reply = ({ args }) => ({ result: args });

        const echoed = await client.command("echo", {
            node_id: BIG_NODE_ID,
            small: 42,
            text: "12345678901234567890",
        });

        expect(echoed).deep.equals({ node_id: BIG_NODE_ID, small: 42, text: "12345678901234567890" });
        expect(server.requests[0].args).deep.equals({
            node_id: BIG_NODE_ID,
            small: 42,
            text: "12345678901234567890",
        });
    });

    it("keeps the connection when an events listener throws", async () => {
        client = await MatterServerClient.connect(server.url);
        client.events.on(() => {
            throw new InternalError("listener failure");
        });

        server.pushEvent("node_added", {});

        // Frames are handled in order, so a reply to a later command proves the event frame did not kill the socket
        server.reply = () => ({ result: "alive" });
        expect(await client.command("ping")).equals("alive");
    });

    it("rejects connect when server_info lacks required fields", async () => {
        const incomplete = await FakeMatterServer.start({ ...FAKE_SERVER_INFO, sdk_version: undefined });
        try {
            let error: unknown;
            try {
                await MatterServerClient.connect(incomplete.url);
            } catch (e) {
                error = e;
            }
            expect(error).instanceOf(UnexpectedDataError);
        } finally {
            await incomplete.close();
        }
    });

    it("decodes bigint in events", async () => {
        client = await MatterServerClient.connect(server.url);
        const seen = new Array<unknown>();
        client.events.on((_event, data) => void seen.push(data));

        server.pushEvent("node_removed", BIG_NODE_ID);
        await waitFor(() => seen.length === 1, "event");

        expect(seen[0]).equals(BIG_NODE_ID);
    });

    it("rejects pending commands when the socket closes", async () => {
        client = await MatterServerClient.connect(server.url);
        const pending = client.command("never_answered");
        await waitFor(() => server.requests.length === 1, "request");

        server.dropClients();

        let error: unknown;
        try {
            await pending;
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(ClosedError);
    });

    it("warns once when the server drops the connection, and not when the client closes it", async () => {
        const connected = await MatterServerClient.connect(server.url);
        client = connected;
        let lost = false;
        connected.disconnected.on(() => {
            lost = true;
        });
        const lines = await warningsDuring(async () => {
            server.dropClients();
            await waitFor(() => lost, "the client to see the dropped connection");
            await connected.close();
        });
        expect(lines.filter(line => line.includes("Connection to matterjs-server was lost"))).lengthOf(1);

        const own = await MatterServerClient.connect(server.url);
        const ownLines = await warningsDuring(() => own.close());
        expect(ownLines).deep.equals([]);
    });

    it("rejects commands issued after the socket closed", async () => {
        client = await MatterServerClient.connect(server.url);
        await client.close();

        let error: unknown;
        try {
            await client.command("late");
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(ClosedError);
    });

    it("rejects a command that is not answered within its timeout", async () => {
        client = await MatterServerClient.connect(server.url);

        let error: unknown;
        try {
            await client.command("slow", undefined, { timeout: Millis(30) });
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(TimeoutError);
    });

    it("ignores a late reply to a timed-out command", async () => {
        client = await MatterServerClient.connect(server.url);

        const slow = client.command("slow", undefined, { timeout: Millis(30) }).catch(() => undefined);
        await slow;
        server.respond(server.requests[0].messageId, { result: "late" });

        server.reply = () => ({ result: "fresh" });
        expect(await client.command("next")).equals("fresh");
    });

    it("closes the connection and rejects pending commands on a malformed frame", async () => {
        client = await MatterServerClient.connect(server.url);
        const pending = client.command("never_answered");
        await waitFor(() => server.requests.length === 1, "request");

        server.sendRaw("{not json");

        let error: unknown;
        try {
            await pending;
        } catch (e) {
            error = e;
        }
        if (!(error instanceof ClosedError)) {
            expect.fail(`expected a ClosedError, got ${error}`);
        }
        expect(error.cause).instanceOf(UnexpectedDataError);
    });

    it("accepts a reply before it handles the frame that follows it", async () => {
        client = await MatterServerClient.connect(server.url);
        const order = new Array<string>();
        client.events.on(event => void order.push(`event ${event}`));

        const command = client.command("subscribe", undefined, {
            accept: result => {
                order.push(`accept ${result}`);
                return "accepted";
            },
        });
        await waitFor(() => server.requests.length === 1, "request");
        server.respond(server.requests[0].messageId, { result: "reply" });
        server.pushEvent("subscription_report", {});

        expect(await command).equals("accepted");
        await waitFor(() => order.length === 2, "the event");
        expect(order).deep.equals(["accept reply", "event subscription_report"]);
    });

    it("rejects a command whose reply its accept refuses, and keeps the connection", async () => {
        client = await MatterServerClient.connect(server.url);
        server.reply = () => ({ result: "unusable" });

        let error: unknown;
        try {
            await client.command("subscribe", undefined, {
                accept: () => {
                    throw new UnexpectedDataError("refused");
                },
            });
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(UnexpectedDataError);
        expect(await client.command("next")).equals("unusable");
    });
});

describe("bigint-aware JSON", () => {
    it("writes bigint as plain digits", () => {
        expect(toBigIntAwareJson({ id: BIG_NODE_ID, n: 1 })).equals('{"id":18446744065119617025,"n":1}');
    });

    it("reads integers past the safe range as bigint, in either sign", () => {
        expect(
            parseBigIntAwareJson('{"a":18446744065119617025,"b":-9007199254740993,"c":9007199254740991}'),
        ).deep.equals({ a: BIG_NODE_ID, b: -9007199254740993n, c: 9007199254740991 });
    });

    it("leaves long digit runs in strings and floats alone", () => {
        expect(parseBigIntAwareJson('{"s":"18446744065119617025","f":1.8446744065119617e19}')).deep.equals({
            s: "18446744065119617025",
            f: 1.8446744065119617e19,
        });
    });
});

describe("MatterServerClient on a connection the test drives", () => {
    async function serverSide() {
        const { client: clientSide, server: peer } = MockWsConnection();
        return { clientSide, writer: peer.writable.getWriter(), reader: peer.readable.getReader() };
    }

    it("closes the connection when the first message is no server_info", async () => {
        const { clientSide, writer, reader } = await serverSide();
        await writer.write(JSON.stringify({ hello: true }));

        let error: unknown;
        try {
            await MatterServerClient.open(clientSide, "mock");
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(UnexpectedDataError);
        expect((await reader.read()).done).equals(true);
    });

    it("rejects with ClosedError a connection that closes before server_info", async () => {
        const { clientSide, writer } = await serverSide();
        await writer.close();

        let error: unknown;
        try {
            await MatterServerClient.open(clientSide, "mock");
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(ClosedError);
    });

    it("finishes close() against a server that never answers the close handshake", async function () {
        this.timeout(20_000);
        const { clientSide, writer } = await serverSide();
        await writer.write(JSON.stringify(FAKE_SERVER_INFO));
        const client = await MatterServerClient.open(clientSide, "mock");

        await client.close();
        expect(await client.command("late").catch((e: unknown) => e)).instanceOf(ClosedError);
    });
});
