/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Load node.js extensions
import "@matter/nodejs";

// Load node.js WS extension
import "@matter/nodejs-ws";

import { asError, Bytes, Environment, StorageBackendMemory, StorageService } from "#general";
import { Endpoint, RemoteRequest, RemoteResponse, ServerNode, WebSocketServer } from "#node";
import { OnOffServer } from "@matter/node/behaviors/on-off";
import { OnOffLightDevice } from "@matter/node/devices/on-off-light";
import { WebSocketStreams } from "@matter/nodejs-ws";
import { MdnsService } from "@matter/protocol";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ErrorEvent, WebSocket } from "ws";
import { Val } from "../../protocol/src/action/Val.js";

let tempFileNum = 0;

let environment: Environment;

describe("WebSocket", () => {
    beforeEach(async () => {
        environment = new Environment("test", Environment.default);
        const storage = environment.get(StorageService);
        storage.factory = () => new StorageBackendMemory();
        storage.resolve = (...paths) => resolve(...paths);
    });

    afterEach(async () => {
        await Environment.default.close(MdnsService);
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe("responds with errors", () => {
        it("non-object", async () => {
            await using cx = await setup();

            await cx.send("asdf" as any);

            await cx.receiveError("invalid-action", "Request is not an object");
        });

        it("for missing opcode", async () => {
            await using cx = await setup();

            await cx.send({ id: "1234" } as any);

            await cx.receiveError("invalid-action", 'Request does not specify opcode in "method" property', "1234");
        });

        it("for invalid opcode", async () => {
            await using cx = await setup();

            await cx.send({ id: "1234", method: "foo" } as any);

            await cx.receiveError("invalid-action", 'Unsupported request method "foo"', "1234");
        });

        it("for missing path", async () => {
            await using cx = await setup();

            await cx.send({ id: "1234", method: "read" } as any);

            await cx.receiveError("invalid-action", 'Request does not specify resource in "target" property', "1234");
        });

        it("for unknown path", async () => {
            await using cx = await setup();

            await cx.send({ id: "1234", method: "read", target: "ur mom" });

            await cx.receiveError("not-found", 'Target "ur mom" not found', "1234");
        });
    });

    it("connects and reads attributes and full state", async () => {
        await using cx = await setup();

        await cx.send({
            id: "a",
            method: "read",
            target: "parts/light/onOff/onOff",
        });

        await cx.receiveValue(false, "a");

        await cx.send({
            id: "b",
            method: "read",
            target: "parts/light/onOff",
        });

        await cx.receiveValue(
            {
                acceptedCommandList: [0, 64, 65, 66, 1, 2],
                attributeList: [0, 65533, 65532, 65531, 65529, 65528, 16384, 16385, 16386, 16387],
                clusterRevision: 6,
                featureMap: {
                    deadFrontBehavior: false,
                    lighting: true,
                    offOnly: false,
                },
                generatedCommandList: [],
                globalSceneControl: true,
                offWaitTime: 0,
                onOff: false,
                onTime: 0,
                startUpOnOff: null,
            },
            "b",
        );
    });

    it("writes", async () => {
        await using cx = await setup();

        await cx.send({
            id: "a",
            method: "read",
            target: "parts/light/onOff/offWaitTime",
        });

        await cx.receiveValue(0, "a");

        await cx.send({
            id: "b",
            method: "write",
            target: "parts/light/onOff/offWaitTime",
            value: 200,
        });

        await cx.receiveOk("b");

        await cx.send({
            id: "c",
            method: "read",
            target: "parts/light/onOff/offWaitTime",
        });

        await cx.receiveValue(200, "c");
    });

    it("invokes", async () => {
        await using cx = await setup();

        await cx.send({
            id: "a",
            method: "read",
            target: "parts/light/onOff/onOff",
        });

        await cx.receiveValue(false, "a");

        await cx.send({
            id: "b",
            method: "invoke",
            target: "parts/light/onOff/toggle",
        });

        await cx.receiveOk("b");

        await cx.send({
            id: "c",
            method: "read",
            target: "parts/light/onOff/onOff",
        });

        await cx.receiveValue(true, "c");
    });

    it("subscribes", async () => {
        await using cx = await setup();

        await cx.send({
            id: "a",
            method: "subscribe",
            target: "changes",
        });

        await cx.receiveOk("a");

        await cx.receiveUpdate("test", 0, "parts", "a");
        await cx.receiveUpdate("test", 0, "index", "a");
        await cx.receiveUpdate("test", 0, "basicInformation", "a");
        await cx.receiveUpdate("test", 0, "accessControl", "a");
        await cx.receiveUpdate("test", 0, "groupKeyManagement", "a");
        await cx.receiveUpdate("test", 0, "generalCommissioning", "a");
        await cx.receiveUpdate("test", 0, "administratorCommissioning", "a");
        await cx.receiveUpdate("test", 0, "operationalCredentials", "a");
        await cx.receiveUpdate("test", 0, "generalDiagnostics", "a");
        await cx.receiveUpdate("test", 0, "commissioning", "a");
        await cx.receiveUpdate("test", 0, "network", "a");
        await cx.receiveUpdate("test", 0, "productDescription", "a");
        await cx.receiveUpdate("test", 0, "subscriptions", "a");
        await cx.receiveUpdate("test", 0, "sessions", "a");
        await cx.receiveUpdate("test", 0, "events", "a");
        await cx.receiveUpdate("test", 0, "controller", "a");
        await cx.receiveUpdate("test", 0, "websocket", "a");
        await cx.receiveUpdate("test", 0, "descriptor", "a");
        await cx.receiveUpdate("test", 1, "identify", "a");
        await cx.receiveUpdate("test", 1, "groups", "a");
        await cx.receiveUpdate("test", 1, "onOff", "a");
        await cx.receiveUpdate("test", 1, "descriptor", "a");
        await cx.receiveUpdate("test", 0, "controller", "a");
        await cx.receiveUpdate("test", 0, "commissioning", "a");

        await cx.send({
            id: "b",
            method: "invoke",
            target: "parts/light/onOff/toggle",
        });

        await cx.receiveOk("b");

        await cx.receiveUpdate("test", 1, "onOff", "a", { onOff: true });

        await cx.send({
            id: "c",
            method: "invoke",
            target: "parts/light/onOff/toggle",
        });

        await cx.receiveOk("c");

        await cx.receiveUpdate("test", 1, "onOff", "a", { onOff: false });
    });

    it("handles client shutdown cleanly", async () => {
        await using cx = await setup();

        await cx.send({
            id: "a",
            method: "read",
            target: "parts/light/onOff/onOff",
        });

        await cx.receiveValue(false, "a");

        await cx.client.writable.close();
    });
});

async function setup() {
    const socketPath = join(tmpdir(), `${process.pid}-${tempFileNum++}.sock`);

    const node = new ServerNode(ServerNode.RootEndpoint.with(WebSocketServer), {
        id: "test",
        environment: environment,

        websocket: {
            address: `ws+unix://${encodeURIComponent(socketPath)}/`,
        },

        parts: [new Endpoint(OnOffLightDevice.with(OnOffServer.with("Lighting")), { id: "light" })],
    });

    await node.start();

    const ws = new WebSocket(`ws+unix://${socketPath}:/`);

    await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onError);

        function off() {
            ws.removeEventListener("open", onOpen);
            ws.removeEventListener("error", onError);
        }

        function onOpen() {
            off();
            resolve();
        }

        function onError(e: ErrorEvent) {
            off();
            reject(asError(e.error));
        }
    });

    const client = WebSocketStreams(ws);

    return {
        node,
        client,

        async [Symbol.asyncDispose]() {
            if (ws.readyState !== WebSocket.CLOSED) {
                await client.writable.close();
            }
            await node.close();
        },

        async send(message: RemoteRequest) {
            const writer = client.writable.getWriter();
            try {
                await writer.write(JSON.stringify(message));
            } finally {
                writer.releaseLock();
            }
        },

        async receive() {
            const reader = client.readable.getReader();
            try {
                const result = await reader.read();

                expect(result.done).false;
                expect(result.value).not.undefined;

                return JSON.parse(Bytes.toString(result.value!)) as RemoteResponse;
            } finally {
                reader.releaseLock();
            }
        },

        async receiveKind<T extends RemoteResponse["kind"]>(kind: T, id?: string) {
            const response = await this.receive();
            expect(response.id).equals(id);
            expect(response.kind).equals(kind);
            return response as RemoteResponse & { kind: T };
        },

        async receiveOk(id?: string) {
            return this.receiveKind("ok", id);
        },

        async receiveError(code: string, message: string, id?: string) {
            const response = await this.receiveKind("error", id);
            expect(response.code).equals(code);
            expect(response.message).equals(message);
            return response;
        },

        async receiveValue(value: unknown, id?: string) {
            const response = await this.receiveKind("value", id);
            expect(response.value).deep.equals(value);
            return response;
        },

        async receiveUpdate(node: string, endpoint: number, cluster: string, id?: string, changes?: Val.Struct) {
            const actual = await this.receiveKind("update", id);
            expect(actual.node).equals(node);
            expect(actual.endpoint).equals(endpoint);
            expect(actual.behavior).equals(cluster);

            if (changes !== undefined) {
                expect(actual.changes).deep.equals(changes);
            }
        },
    };
}
