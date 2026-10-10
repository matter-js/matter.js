/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClosedError, InternalError, Millis, TimeoutError, UnexpectedDataError } from "@matter/general";
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
            await client.command("slow", undefined, Millis(30));
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(TimeoutError);
    });

    it("ignores a late reply to a timed-out command", async () => {
        client = await MatterServerClient.connect(server.url);

        const slow = client.command("slow", undefined, Millis(30)).catch(() => undefined);
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
        expect(error).instanceOf(ClosedError);
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
