/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { INTERFACE_CHECK_INTERVAL, Network, NetworkError, NetworkInterfaceDetails } from "#net/Network.js";
import { UdpSocket } from "#net/udp/UdpSocket.js";
import { observant } from "#util/Observable.js";

class TestNetwork extends Network {
    interfaces: Record<string, NetworkInterfaceDetails> = {};
    listings = 0;
    failNextListing = false;
    listedWithoutDetails = new Array<string>();

    getNetInterfaces() {
        this.listings++;
        if (this.failNextListing) {
            this.failNextListing = false;
            throw new NetworkError("Interfaces cannot be listed");
        }
        return [...Object.keys(this.interfaces), ...this.listedWithoutDetails].map(name => ({ name }));
    }

    getIpMac(name: string) {
        return this.interfaces[name];
    }

    createUdpSocket(): Promise<UdpSocket> {
        throw new NetworkError("Not supported");
    }
}

describe("Network interface changes", () => {
    before(() => MockTime.enable());

    let network: TestNetwork;
    let emitted: string[][];
    const record = (names: string[]) => {
        emitted.push(names);
    };

    beforeEach(() => {
        network = new TestNetwork();
        network.interfaces = {
            eth0: { mac: "aa:bb:cc:dd:ee:01", ipV4: ["10.0.0.2"], ipV6: ["2001:db8:1::10", "fe80::1"] },
            docker0: { mac: "aa:bb:cc:dd:ee:02", ipV4: ["172.17.0.1"], ipV6: [] },
        };
        emitted = [];
    });

    afterEach(async () => {
        await network.close();
    });

    it("does not emit for the first snapshot", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        expect(emitted).deep.equals([]);
    });

    it("emits the names of changed interfaces", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        network.interfaces.eth0 = { ...network.interfaces.eth0, ipV6: ["2001:db8:2::10", "fe80::1"] };
        network.interfaces.wlan0 = { mac: "aa:bb:cc:dd:ee:03", ipV4: [], ipV6: ["fe80::3"] };
        delete network.interfaces.docker0;
        await network.checkInterfaces();

        expect(emitted).deep.equals([["docker0", "eth0", "wlan0"]]);
    });

    it("treats reordering and duplicates as no change", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        network.interfaces.eth0 = {
            ...network.interfaces.eth0,
            ipV6: ["fe80::1", "2001:db8:1::10", "fe80::1"],
        };
        await network.checkInterfaces();

        expect(emitted).deep.equals([]);
    });

    it("treats a MAC change as a change", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        network.interfaces.docker0 = { ...network.interfaces.docker0, mac: "aa:bb:cc:dd:ee:09" };
        await network.checkInterfaces();

        expect(emitted).deep.equals([["docker0"]]);
    });

    it("keeps copies of the details it compares", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        network.interfaces.eth0.ipV4.push("10.0.0.3");
        await network.checkInterfaces();

        expect(emitted).deep.equals([["eth0"]]);
    });

    it("polls only while observed", async () => {
        await MockTime.advance(INTERFACE_CHECK_INTERVAL);
        expect(network.listings).equals(0);

        network.interfacesChanged.on(record);
        await network.checkInterfaces(); // joins the check started by observing
        expect(network.listings).equals(1);

        network.interfaces.eth0 = { ...network.interfaces.eth0, ipV4: ["10.0.0.5"] };
        await MockTime.advance(INTERFACE_CHECK_INTERVAL);
        expect(network.listings).equals(2);
        expect(emitted).deep.equals([["eth0"]]);

        network.interfacesChanged.off(record);
        await MockTime.advance(INTERFACE_CHECK_INTERVAL);
        expect(network.listings).equals(2);
    });

    it("does not poll for an observer that is not observant", async () => {
        network.interfacesChanged.on(Object.assign((names: string[]) => record(names), { [observant]: false }));
        await MockTime.advance(INTERFACE_CHECK_INTERVAL);

        expect(network.listings).equals(0);
    });

    it("closes only after a running check reached its observers", async () => {
        let release!: () => void;
        const held = new Promise<void>(resolve => (release = resolve));
        network.interfacesChanged.on(async names => {
            record(names);
            await held;
        });
        await network.checkInterfaces();

        network.interfaces.eth0 = { ...network.interfaces.eth0, ipV4: ["10.0.0.3"] };
        const check = network.checkInterfaces();
        let isClosed = false;
        const closing = network.close().then(() => (isClosed = true));
        await MockTime.yield3();
        expect(emitted).deep.equals([["eth0"]]);
        expect(isClosed).equals(false);

        release();
        await check;
        await closing;
        expect(isClosed).equals(true);
    });

    it("shares one run between overlapping checks", async () => {
        await Promise.all([network.checkInterfaces(), network.checkInterfaces()]);

        expect(network.listings).equals(1);
    });

    it("keeps the previous snapshot when a check fails", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        network.failNextListing = true;
        await expect(network.checkInterfaces()).rejectedWith(NetworkError);
        expect(emitted).deep.equals([]);

        network.interfaces.docker0 = { ...network.interfaces.docker0, ipV4: [] };
        await network.checkInterfaces();
        expect(emitted).deep.equals([["docker0"]]);
    });

    it("starts from the current state when observed again after a running check", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();
        const running = network.checkInterfaces();
        network.interfacesChanged.off(record);
        await running;

        network.interfaces.eth0 = { ...network.interfaces.eth0, ipV4: ["10.0.0.9"] };
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        expect(emitted).deep.equals([]);
    });

    it("starts from the current state when observed after an unobserved check", async () => {
        await network.checkInterfaces();

        network.interfaces.eth0 = { ...network.interfaces.eth0, ipV4: ["10.0.0.9"] };
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        expect(emitted).deep.equals([]);
    });

    it("does not poll after close when observed again", async () => {
        await network.close();
        network.interfacesChanged.on(record);

        await MockTime.advance(INTERFACE_CHECK_INTERVAL * 2);
        expect(network.listings).equals(0);
    });

    it("treats an interface without details as absent", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        network.listedWithoutDetails.push("eth0");
        delete network.interfaces.eth0;
        await network.checkInterfaces();

        expect(emitted).deep.equals([["eth0"]]);
    });

    it("keeps polling after a failed periodic check", async () => {
        network.interfacesChanged.on(record);
        await network.checkInterfaces();

        network.failNextListing = true;
        await MockTime.advance(INTERFACE_CHECK_INTERVAL);
        network.interfaces.docker0 = { ...network.interfaces.docker0, ipV4: [] };
        await MockTime.advance(INTERFACE_CHECK_INTERVAL);

        expect(emitted).deep.equals([["docker0"]]);
    });

    it("stops polling when closed", async () => {
        network.interfacesChanged.on(record);
        await network.close();

        await MockTime.advance(INTERFACE_CHECK_INTERVAL);
        expect(network.listings).equals(1);
    });
});
