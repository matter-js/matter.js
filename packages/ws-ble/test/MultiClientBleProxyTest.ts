/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError, MockWsConnection, type Observable } from "@matter/general";
import { BleProxyHandler } from "../src/BleProxyHandler.js";
import type { BleProxyConnection } from "../src/BleProxyConnection.js";
import { BleProxyCommand } from "../src/BleProxyProtocol.js";
import { BleProxyTestClient } from "./support/BleProxyTestClient.js";

const matterServiceData = Bytes.toBase64(new Uint8Array(8));

function nextEmit<Args extends unknown[]>(observable: Observable<Args>): Promise<void> {
    return new Promise<void>(resolve => observable.on(() => resolve()));
}

describe("Multi-client BLE Proxy", () => {
    before(() => MockTime.enable());

    let handler: BleProxyHandler;
    const clients = new Array<BleProxyTestClient>();
    const connectionOf = new Map<BleProxyTestClient, BleProxyConnection>();

    const addClient = async (): Promise<BleProxyTestClient> => {
        const pair = MockWsConnection();
        const connection = handler.accept(pair.server);
        const client = new BleProxyTestClient();
        await client.connect(pair.client);
        clients.push(client);
        connectionOf.set(client, connection);
        return client;
    };

    beforeEach(() => {
        handler = new BleProxyHandler();
    });

    afterEach(async () => {
        await Promise.all(clients.map(c => c.close()));
        clients.length = 0;
        connectionOf.clear();
        await handler.close();
    });

    it("accepts more than one client and reports connected", async () => {
        await addClient();
        await addClient();
        expect(handler.connected).to.be.true;
    });

    it("broadcasts start_scan to all connected clients", async () => {
        const a = await addClient();
        const b = await addClient();

        await handler.startScan({ service_uuids: ["fff6"], allow_duplicates: false });

        const [cmdA, cmdB] = await Promise.all([a.waitForCommand("start_scan"), b.waitForCommand("start_scan")]);
        expect(cmdA.command).to.equal("start_scan");
        expect(cmdB.command).to.equal("start_scan");
    });

    it("sends start_scan to a client that joins mid-scan", async () => {
        await addClient();
        await handler.startScan({ service_uuids: ["fff6"], allow_duplicates: false });

        const late = await addClient();
        const cmd = await late.waitForCommand("start_scan");
        expect(cmd.command).to.equal("start_scan");
    });

    it("stopScan reaches connected clients even after a transient scanStopped", async () => {
        const a = await addClient();

        await handler.startScan({ service_uuids: ["fff6"], allow_duplicates: false });
        await a.waitForCommand("start_scan");

        // A transient all-clients-stopped must not prevent a later stopScan() from reaching clients:
        // #scanning is empty at this point, but stopScan() sends unconditionally to all connected clients.
        const scanStoppedEmitted = nextEmit(handler.scanStopped);
        await a.sendEvent("scan_stopped", { reason: "transient" });
        await scanStoppedEmitted;

        const stopPromise = a.waitForCommand("stop_scan");
        await handler.stopScan();
        const cmd = await stopPromise;
        expect(cmd.command).to.equal("stop_scan");
    });

    it("emits scanStopped only once every scanning client has reported stopped", async () => {
        const a = await addClient();
        const b = await addClient();

        await handler.startScan({ service_uuids: ["fff6"], allow_duplicates: false });
        await Promise.all([a.waitForCommand("start_scan"), b.waitForCommand("start_scan")]);

        let stopped = 0;
        handler.scanStopped.on(() => {
            stopped++;
        });

        const aEventReceived = nextEmit(connectionOf.get(a)!.eventReceived);
        await a.sendEvent("scan_stopped", { reason: "a done" });
        await aEventReceived;
        expect(stopped).to.equal(0);

        const bEventReceived = nextEmit(connectionOf.get(b)!.eventReceived);
        await b.sendEvent("scan_stopped", { reason: "b done" });
        await bEventReceived;
        expect(stopped).to.equal(1);
    });

    it("returns the same promise from every concurrent close() call", async () => {
        await addClient();

        // A second call issued before the first settles must join the same teardown, not report done early.
        const first = handler.close();
        const second = handler.close();
        expect(second).to.equal(first);

        await first;
    });

    it("rejects accept() once closed", async () => {
        await handler.close();

        const pair = MockWsConnection();
        expect(() => handler.accept(pair.server)).to.throw(ImplementationError);
    });

    it("emits scanStopped when the last scanning client disconnects", async () => {
        const a = await addClient();

        let stopped = false;
        handler.scanStopped.on(() => {
            stopped = true;
        });

        await handler.startScan({ service_uuids: ["fff6"], allow_duplicates: false });

        const scanStoppedEmitted = nextEmit(handler.scanStopped);
        await a.close();
        await scanStoppedEmitted;

        expect(stopped).to.be.true;
    });

    it("assigns ownership to the first client that discovers a peripheral", async () => {
        const a = await addClient();
        const b = await addClient();

        const address = "AA:BB:CC:DD:EE:FF";
        const discovered = {
            address,
            connectable: true,
            service_data: { fff6: matterServiceData },
        };

        // Client A sees it first, then B.
        const seenByA = nextEmit(handler.deviceDiscovered);
        await a.sendEvent("device_discovered", discovered);
        await seenByA;

        const seenByB = nextEmit(handler.deviceDiscovered);
        await b.sendEvent("device_discovered", discovered);
        await seenByB;

        const owner = handler.getOwner(address);
        expect(owner).to.not.be.undefined;

        // Route a connect through the owner; only client A should receive it.
        a.onCommand(BleProxyCommand.Connect, async () => ({ connection_handle: 1, mtu: 247 }));
        b.onCommand(BleProxyCommand.Connect, async () => ({ connection_handle: 9, mtu: 247 }));

        const aGotConnect = a.waitForCommand("connect");
        await owner!.sendCommand(BleProxyCommand.Connect, { address });

        const cmd = await aGotConnect;
        expect(cmd.command).to.equal("connect");
        expect(b.receivedCommands.find(c => c.command === "connect")).to.be.undefined;
    });

    it("reassigns ownership to another seer when the owner disconnects", async () => {
        const a = await addClient();
        const b = await addClient();

        const address = "AA:BB:CC:DD:EE:11";
        const discovered = {
            address,
            connectable: true,
            service_data: { fff6: matterServiceData },
        };

        const seenByA = nextEmit(handler.deviceDiscovered);
        await a.sendEvent("device_discovered", discovered);
        await seenByA;

        const seenByB = nextEmit(handler.deviceDiscovered);
        await b.sendEvent("device_discovered", discovered);
        await seenByB;

        expect(handler.getOwner(address)).to.not.be.undefined;

        // Drop client A (the first-seen owner). Ownership should fall to B.
        const aClosed = nextEmit(connectionOf.get(a)!.closed);
        await a.close();
        await aClosed;

        const owner = handler.getOwner(address);
        expect(owner).to.not.be.undefined;

        b.onCommand(BleProxyCommand.Connect, async () => ({ connection_handle: 2, mtu: 247 }));
        const bGotConnect = b.waitForCommand("connect");
        await owner!.sendCommand(BleProxyCommand.Connect, { address });

        const cmd = await bGotConnect;
        expect(cmd.command).to.equal("connect");
    });

    it("drops a peripheral when its last seer disconnects", async () => {
        const a = await addClient();

        const address = "AA:BB:CC:DD:EE:22";
        const seen = nextEmit(handler.deviceDiscovered);
        await a.sendEvent("device_discovered", {
            address,
            connectable: true,
            service_data: { fff6: matterServiceData },
        });
        await seen;
        expect(handler.getOwner(address)).to.not.be.undefined;

        const aClosed = nextEmit(connectionOf.get(a)!.closed);
        await a.close();
        await aClosed;
        expect(handler.getOwner(address)).to.be.undefined;
    });
});
