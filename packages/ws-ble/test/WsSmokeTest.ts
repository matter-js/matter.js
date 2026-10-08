/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smoke test that runs the BLE proxy handshake and one command round-trip over a real localhost WebSocket, pinning the
 * stream adapter the mock transport in the other suites bypasses.
 */

import { Environment, InternalError, Logger, WebSocketClient } from "@matter/general";
import { BleProxyHandler } from "../src/BleProxyHandler.js";
import { BleProxyTestClient } from "./support/BleProxyTestClient.js";

const logger = Logger.get("WsSmokeTest");

// Non-literal specifiers keep node-only modules out of the browser bundle the Web test target builds.  Inlining them
// as literals breaks that build.
const NODE_HTTP = ["node", "http"].join(":");
const MATTER_NODEJS_WS = ["@matter", "nodejs-ws"].join("/");

type NodeHttp = typeof import("node:http");
type MatterNodeJsWs = typeof import("@matter/nodejs-ws");

function importModule<T>(specifier: string): Promise<T> {
    return import(specifier) as Promise<T>;
}

describe("BLE proxy over a real WebSocket", function () {
    this.timeout(10_000);

    before(function () {
        if (typeof window !== "undefined") {
            this.skip();
        }
    });

    it("completes the handshake and a start_scan round-trip", async () => {
        const [http, nodejsWs] = await Promise.all([
            importModule<NodeHttp>(NODE_HTTP),
            importModule<MatterNodeJsWs>(MATTER_NODEJS_WS),
        ]);

        const handler = new BleProxyHandler();
        const adapter = nodejsWs.factory();
        const server = http.createServer();

        server.on("upgrade", (req, socket, head) => {
            adapter
                .handle(req, socket, head)
                .then(connection => handler.accept(connection))
                .catch(error => logger.error("WebSocket upgrade failed:", error));
        });

        let client: BleProxyTestClient | undefined;
        try {
            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(0, "127.0.0.1", resolve);
            });

            const address = server.address();
            if (address === null || typeof address === "string") {
                throw new InternalError(`Expected an inet address but got ${address}`);
            }

            const connection = await Environment.default
                .get(WebSocketClient)
                .connect(`ws://127.0.0.1:${address.port}/ble`);
            client = new BleProxyTestClient();
            await client.connect(connection);

            expect(handler.connected).to.be.true;

            await handler.startScan({ service_uuids: ["fff6"], allow_duplicates: false });

            const command = await client.waitForCommand("start_scan");
            expect(command.command).to.equal("start_scan");
        } finally {
            await client?.close();
            await handler.close();
            await adapter.close();
            await new Promise<void>((resolve, reject) => {
                server.close(error => (error ? reject(error) : resolve()));
            });
        }
    });
});
