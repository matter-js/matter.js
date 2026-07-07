/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Environment, MockNetwork, Network, NetworkSimulator } from "@matter/general";
import { connectDtls } from "../src/dtls/channel/connectDtls.js";
import { DtlsError } from "../src/dtls/channel/DtlsChannel.js";

const SERVER_IP = "10.10.10.2";
const CLIENT_IP = "10.10.10.1";

const DEFAULT_PASSWORD = Bytes.of(Bytes.fromHex("4a3070000000000a"));

function mockEnvironment(simulator: NetworkSimulator, mac: string, ip: string): Environment {
    const environment = new Environment("test", Environment.default);
    environment.set(Network, new MockNetwork(simulator, mac, [ip]));
    return environment;
}

describe("connectDtls", () => {
    before(MockTime.enable);

    it("rejects and tears down the transport when the handshake gives up", async () => {
        const simulator = new NetworkSimulator();
        // Reachable host but nothing listening on the port: the mock network drops the datagrams.
        new MockNetwork(simulator, "00:11:22:33:44:02", [SERVER_IP]);

        let caught: unknown;
        const connectPromise = connectDtls({
            address: SERVER_IP,
            port: 49191,
            password: DEFAULT_PASSWORD,
            type: "udp4",
            initialRetransmitMs: 10,
            maxRetransmitMs: 20,
            maxRetransmits: 2,
            connectTimeoutMs: 1000,
            environment: mockEnvironment(simulator, "00:11:22:33:44:01", CLIENT_IP),
        }).catch(e => {
            caught = e;
        });

        await MockTime.macrotask;
        await MockTime.macrotask;
        await MockTime.advance(10 + 20 + 20 + 1);
        await connectPromise;

        expect(caught).to.be.instanceOf(DtlsError);
        expect((caught as Error).message).to.match(/gave up|timed out/);
    });
});
