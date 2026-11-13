/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MdnsServer } from "#mdns/MdnsServer.js";
import {
    AAAARecord,
    ARecord,
    Bytes,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsRecordClass,
    DnsRecordType,
    MdnsSocket,
    Network,
    NetworkError,
    NetworkInterfaceDetails,
    PtrRecord,
    Seconds,
    SrvRecord,
    UdpMulticastServer,
    UdpSocket,
} from "@matter/general";

const SERVICE = "_matter._tcp.local";
const INSTANCE = `inst.${SERVICE}`;
const HOST = "AABBCCDDEE010000.local";

class TestNetwork extends Network {
    interfaces: Record<string, NetworkInterfaceDetails> = {};
    listings = 0;
    reads = 0;
    /** The next read of this interface reports no details */
    noDetailsOnNextRead?: string;
    /** Read number {@link at} waits until {@link released} resolves */
    heldRead?: { at: number; released: Promise<void> };

    getNetInterfaces() {
        this.listings++;
        return Object.keys(this.interfaces).map(name => ({ name }));
    }

    getIpMac(name: string) {
        this.reads++;
        if (this.noDetailsOnNextRead === name) {
            this.noDetailsOnNextRead = undefined;
            return undefined;
        }
        const details = this.interfaces[name];
        const copy = details && { ...details, ipV4: [...details.ipV4], ipV6: [...details.ipV6] };
        const heldRead = this.heldRead;
        if (heldRead?.at === this.reads) {
            return heldRead.released.then(() => copy);
        }
        return copy;
    }

    createUdpSocket(): Promise<UdpSocket> {
        throw new NetworkError("Not supported");
    }
}

interface Sent {
    netInterface?: string;
    message: DnsMessage;
}

const generator: MdnsServer.RecordGenerator = (_intf, addrs, hostname) => [
    PtrRecord(SERVICE, INSTANCE),
    { ...SrvRecord(INSTANCE, { priority: 0, weight: 0, port: 5540, target: hostname }), flushCache: true },
    ...addrs.ipV6.map(ip => ({ ...AAAARecord(hostname, ip), flushCache: true })),
    ...addrs.ipV4.map(ip => ({ ...ARecord(hostname, ip), flushCache: true })),
];

describe("MdnsServer interface address changes", () => {
    before(() => MockTime.enable());

    let network: TestNetwork;
    let server: MdnsServer;
    let sent: Sent[];
    let receive: (message: Bytes, remoteIp: string, netInterface: string) => void;
    let registration: MdnsServer.Registration;

    function createServer() {
        const udp = {
            netInterface: undefined,
            onMessage(listener: (message: Bytes, remoteIp: string, netInterface: string) => void) {
                receive = listener;
            },
            async send(message: Bytes, netInterface?: string): Promise<UdpMulticastServer.Reach | undefined> {
                sent.push({ netInterface, message: DnsCodec.decode(message)! });
                return netInterface === undefined ? undefined : { kind: "all" };
            },
            async close() {},
            get network(): Network {
                return network;
            },
        } as UdpMulticastServer;
        server = new MdnsServer(new MdnsSocket(udp));
    }

    async function settle() {
        await MockTime.advance(1);
        for (let i = 0; i < 20; i++) {
            await MockTime.yield();
        }
    }

    /** The address records each message carried, as `interface value ttl`. */
    function addressRecords() {
        return sent.flatMap(({ netInterface, message }) =>
            [...message.answers, ...message.additionalRecords]
                .filter(({ recordType }) => recordType === DnsRecordType.AAAA || recordType === DnsRecordType.A)
                .map(({ value, ttl }) => `${netInterface} ${String(value)} ${ttl / 1000}`),
        );
    }

    async function change(actor: () => void) {
        actor();
        sent.length = 0;
        await network.checkInterfaces();
        await settle();
    }

    beforeEach(async () => {
        network = new TestNetwork();
        network.interfaces = {
            eth0: { mac: "aa:bb:cc:dd:ee:01", ipV4: ["10.0.0.2"], ipV6: ["2001:db8:1::10"] },
        };
        sent = [];
        createServer();
        registration = await server.register("matter", generator);
        await server.broadcast();
        await network.checkInterfaces();
        await MockTime.advance(Seconds(2));
        await settle();
    });

    afterEach(async () => {
        await server.close();
        await network.close();
    });

    it("says goodbye to a lost address and announces the new one, again one second later", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10"]));

        expect(addressRecords()).deep.equals(["eth0 2001:db8:1::10 0", "eth0 2001:db8:2::10 120", "eth0 10.0.0.2 120"]);

        sent.length = 0;
        await MockTime.advance(Seconds(1));
        await settle();
        expect(addressRecords()).deep.equals(["eth0 2001:db8:2::10 120", "eth0 10.0.0.2 120"]);
    });

    it("announces an added address", async () => {
        await change(() => network.interfaces.eth0.ipV4.push("10.0.0.3"));

        expect(addressRecords()).deep.equals(["eth0 2001:db8:1::10 120", "eth0 10.0.0.2 120", "eth0 10.0.0.3 120"]);
    });

    it("reads the details again after a change, also shortly after a read reported none", async () => {
        network.noDetailsOnNextRead = "eth0";
        await registration.refresh();

        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10"]));

        expect(addressRecords()).deep.equals(["eth0 2001:db8:1::10 0", "eth0 2001:db8:2::10 120", "eth0 10.0.0.2 120"]);
    });

    it("keeps the interface check working when a generator throws after a change", async () => {
        await server.register("failing", (_intf, addrs) => {
            if (addrs.ipV6.includes("2001:db8:2::10")) {
                throw new NetworkError("Generator fails for this address");
            }
            return [];
        });

        network.interfaces.eth0.ipV6 = ["2001:db8:2::10"];
        await network.checkInterfaces();
    });

    it("answers with the new addresses after a change", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10"]));
        await MockTime.advance(Seconds(2));
        await settle();
        sent.length = 0;

        receive(
            DnsCodec.encode({
                messageType: DnsMessageType.Query,
                queries: [{ name: HOST, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.AAAA }],
            }),
            "fe80::99",
            "eth0",
        );
        await settle();

        expect(addressRecords()).deep.equals(["eth0 2001:db8:2::10 120"]);
    });

    it("publishes only on the interface that changed", async () => {
        network.interfaces.wlan0 = { mac: "aa:bb:cc:dd:ee:02", ipV4: ["10.1.0.2"], ipV6: [] };
        await network.checkInterfaces();
        await MockTime.advance(Seconds(2));
        await settle();

        await change(() => (network.interfaces.wlan0.ipV4 = ["10.1.0.3"]));

        expect(new Set(sent.map(({ netInterface }) => netInterface))).deep.equals(new Set(["wlan0"]));
    });

    it("publishes on every interface when the host name changes", async () => {
        network.interfaces.wlan0 = { mac: "aa:bb:cc:dd:ee:02", ipV4: ["10.1.0.2"], ipV6: [] };
        await network.checkInterfaces();
        await MockTime.advance(Seconds(2));
        await settle();

        await change(() => (network.interfaces.eth0.mac = "aa:bb:cc:dd:ee:09"));

        expect(new Set(sent.map(({ netInterface }) => netInterface))).deep.equals(new Set(["eth0", "wlan0"]));
    });

    it("observes interface changes only while services are registered", async () => {
        expect(network.interfacesChanged.isObserved).equals(true);

        await registration.withdraw();

        expect(network.interfacesChanged.isObserved).equals(false);
    });

    it("sends nothing after close, also not the repeat of an earlier change", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10"]));
        await server.close();
        sent.length = 0;

        expect(network.interfacesChanged.isObserved).equals(false);
        const listings = network.listings;
        await MockTime.advance(Seconds(2));
        await settle();
        expect(sent).deep.equals([]);
        expect(network.listings).equals(listings);
    });

    it("sends nothing when the server closes while it handles a change", async () => {
        network.interfaces.eth0.ipV6 = ["2001:db8:2::10"];
        sent.length = 0;
        let release!: () => void;
        // The network's own check reads eth0 first; the server's read for the change comes second
        network.heldRead = { at: network.reads + 2, released: new Promise(resolve => (release = resolve)) };
        const check = network.checkInterfaces();
        await settle();
        await server.close();
        const listings = network.listings;

        release();
        await check;
        await MockTime.advance(Seconds(2));
        await settle();
        expect(sent).deep.equals([]);
        expect(network.listings).equals(listings);
    });
});
