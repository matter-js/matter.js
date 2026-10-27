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
    DEFAULT_MDNS_TTL,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsRecord,
    DnsRecordClass,
    DnsRecordType,
    INTERFACE_CHECK_INTERVAL,
    MdnsSocket,
    Network,
    NetworkError,
    NetworkInterfaceDetails,
    PtrRecord,
    SrvRecord,
    UdpMulticastServer,
    UdpSocket,
} from "@matter/general";

const SERVICE = "_matter._tcp.local";
const INSTANCE = `inst.${SERVICE}`;
const HOST = "AABBCCDDEE010000.local";
const OTHER_HOST = "AABBCCDDEE020000.local";
const TTL = DEFAULT_MDNS_TTL;

class TestNetwork extends Network {
    interfaces: Record<string, NetworkInterfaceDetails> = {};
    reads = new Array<string>();
    readsAsync = false;
    heldReads?: Array<{ name: string; release(): void }>;
    holdRead?: { at: number; hold(release: () => void): void };

    listings = 0;
    failListingsFrom?: number;

    getNetInterfaces() {
        this.listings++;
        if (this.failListingsFrom !== undefined && this.listings >= this.failListingsFrom) {
            throw new NetworkError("Interfaces cannot be listed");
        }
        return Object.keys(this.interfaces).map(name => ({ name }));
    }

    getIpMac(name: string) {
        this.reads.push(name);
        const details = this.interfaces[name];
        const holdRead = this.holdRead;
        if (holdRead?.at === this.reads.length) {
            return new Promise<NetworkInterfaceDetails | undefined>(resolve => holdRead.hold(() => resolve(details)));
        }
        const heldReads = this.heldReads;
        if (heldReads !== undefined) {
            return new Promise<NetworkInterfaceDetails | undefined>(resolve =>
                heldReads.push({ name, release: () => resolve(details) }),
            );
        }
        if (this.readsAsync) {
            return Promise.resolve().then(() => details);
        }
        return details;
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
    let failSends: boolean;

    function createServer(pinnedInterface?: string) {
        const udp = {
            netInterface: pinnedInterface,
            onMessage(listener: (message: Bytes, remoteIp: string, netInterface: string) => void) {
                receive = listener;
            },
            async send(message: Bytes, netInterface?: string, _unicastTarget?: string) {
                if (failSends) {
                    throw new NetworkError("Send failed");
                }
                sent.push({ netInterface, message: DnsCodec.decode(message)! });
            },
            async close() {},
            get network(): Network {
                return network;
            },
        } as UdpMulticastServer;
        server = new MdnsServer(new MdnsSocket(udp));
    }

    async function settle() {
        for (let i = 0; i < 20; i++) {
            await MockTime.yield();
        }
    }

    /** Query the host addresses on {@link netInterface} and return the AAAA and A values answered. */
    async function queryAddresses(netInterface = "eth0") {
        await MockTime.advance(1_000);
        sent.length = 0;
        receive(
            DnsCodec.encode({
                messageType: DnsMessageType.Query,
                queries: [{ name: HOST, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
            }),
            "fe80::99",
            netInterface,
        );
        await settle();
        return addressValues(sent.flatMap(({ message }) => message.answers));
    }

    function addressValues(records: DnsRecord[]) {
        return records
            .filter(({ recordType }) => recordType === DnsRecordType.AAAA || recordType === DnsRecordType.A)
            .map(({ value }) => String(value))
            .sort();
    }

    function updates() {
        return sent.map(({ netInterface, message }) => ({
            netInterface,
            records: message.answers.map(({ name, recordType, value, ttl, flushCache }) => ({
                name,
                recordType,
                value: typeof value === "string" ? value : JSON.stringify(value),
                ttl,
                flushCache,
            })),
        }));
    }

    async function change(actor: () => void) {
        actor();
        sent.length = 0;
        await network.checkInterfaces();
    }

    beforeEach(async () => {
        network = new TestNetwork();
        network.interfaces = {
            eth0: { mac: "aa:bb:cc:dd:ee:01", ipV4: ["10.0.0.2"], ipV6: ["2001:db8:1::10", "fe80::10"] },
        };
        sent = [];
        failSends = false;
        createServer();
        await server.setRecordsGenerator("matter", generator);
        await network.checkInterfaces();
        await queryAddresses();
    });

    afterEach(async () => {
        await server.close();
        await network.close();
    });

    it("answers with the new addresses after a change", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));

        expect(await queryAddresses()).deep.equals(["10.0.0.2", "2001:db8:2::10", "fe80::10"]);
    });

    it("does not read the interfaces to answer a query", async () => {
        network.reads.length = 0;

        await queryAddresses();
        await queryAddresses();

        expect(network.reads).deep.equals([]);
    });

    it("withdraws removed addresses and announces the current set twice", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));

        const update = {
            netInterface: "eth0",
            records: [
                { name: HOST, recordType: DnsRecordType.AAAA, value: "2001:db8:1::10", ttl: 0, flushCache: false },
                { name: HOST, recordType: DnsRecordType.AAAA, value: "2001:db8:2::10", ttl: TTL, flushCache: true },
                { name: HOST, recordType: DnsRecordType.AAAA, value: "fe80::10", ttl: TTL, flushCache: true },
            ],
        };
        expect(updates()).deep.equals([update]);

        sent.length = 0;
        await MockTime.advance(999);
        expect(updates()).deep.equals([]);
        await MockTime.advance(1);
        expect(updates()).deep.equals([update]);

        sent.length = 0;
        await MockTime.advance(5_000);
        expect(updates()).deep.equals([]);
    });

    it("updates a quiet network on the periodic check", async () => {
        network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"];
        sent.length = 0;

        await MockTime.advance(INTERFACE_CHECK_INTERVAL);

        expect(addressValues(sent[0]?.message.answers ?? [])).deep.equals([
            "2001:db8:1::10",
            "2001:db8:2::10",
            "fe80::10",
        ]);
    });

    it("only says goodbye to a record set that lost all members", async () => {
        await change(() => (network.interfaces.eth0.ipV4 = []));

        expect(updates()).deep.equals([
            {
                netInterface: "eth0",
                records: [{ name: HOST, recordType: DnsRecordType.A, value: "10.0.0.2", ttl: 0, flushCache: false }],
            },
        ]);
    });

    it("merges a second change before the repeat", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));
        await MockTime.advance(500);
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:3::10", "fe80::10"]));

        sent.length = 0;
        await MockTime.advance(1_000);

        expect(updates()).deep.equals([
            {
                netInterface: "eth0",
                records: [
                    { name: HOST, recordType: DnsRecordType.AAAA, value: "2001:db8:1::10", ttl: 0, flushCache: false },
                    { name: HOST, recordType: DnsRecordType.AAAA, value: "2001:db8:2::10", ttl: 0, flushCache: false },
                    {
                        name: HOST,
                        recordType: DnsRecordType.AAAA,
                        value: "2001:db8:3::10",
                        ttl: TTL,
                        flushCache: true,
                    },
                    { name: HOST, recordType: DnsRecordType.AAAA, value: "fe80::10", ttl: TTL, flushCache: true },
                ],
            },
        ]);
    });

    it("does not say goodbye to an address that came back", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["fe80::10"]));
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:1::10", "fe80::10"]));

        sent.length = 0;
        await MockTime.advance(1_000);

        expect(updates().flatMap(({ records }) => records.filter(({ ttl }) => ttl === 0))).deep.equals([]);
    });

    it("sends nothing on an interface that vanished", async () => {
        network.interfaces.eth1 = { mac: "aa:bb:cc:dd:ee:02", ipV4: ["10.1.0.2"], ipV6: [] };
        await network.checkInterfaces();
        await queryAddresses("eth1");

        await change(() => delete network.interfaces.eth1);
        await MockTime.advance(1_000);

        expect(sent.filter(({ netInterface }) => netInterface === "eth1")).deep.equals([]);
    });

    it("announces a new interface completely, twice", async () => {
        await change(
            () => (network.interfaces.wlan0 = { mac: "aa:bb:cc:dd:ee:03", ipV4: [], ipV6: ["2001:db8:1::30"] }),
        );
        const first = updates();
        sent.length = 0;
        await MockTime.advance(1_000);

        expect(first).deep.equals([
            {
                netInterface: "wlan0",
                records: [
                    { name: SERVICE, recordType: DnsRecordType.PTR, value: INSTANCE, ttl: TTL, flushCache: false },
                    {
                        name: INSTANCE,
                        recordType: DnsRecordType.SRV,
                        value: JSON.stringify({ priority: 0, weight: 0, port: 5540, target: HOST }),
                        ttl: TTL,
                        flushCache: true,
                    },
                    { name: HOST, recordType: DnsRecordType.AAAA, value: "2001:db8:1::30", ttl: TTL, flushCache: true },
                ],
            },
        ]);
        expect(updates()).deep.equals(first);
    });

    it("ignores an interface it does not serve", async () => {
        await server.close();
        createServer("eth0");
        await server.setRecordsGenerator("matter", generator);

        await change(() => (network.interfaces.eth1 = { mac: "aa:bb:cc:dd:ee:02", ipV4: ["10.1.0.2"], ipV6: [] }));
        await MockTime.advance(1_000);

        expect(sent).deep.equals([]);
    });

    it("moves the host name when its interface loses the MAC", async () => {
        network.interfaces.eth1 = { mac: "aa:bb:cc:dd:ee:02", ipV4: ["10.1.0.2"], ipV6: [] };
        await network.checkInterfaces();
        await MockTime.advance(1_000);

        await change(() => (network.interfaces.eth0 = { ...network.interfaces.eth0, mac: "00:00:00:00:00:00" }));

        const eth1 = updates().find(({ netInterface }) => netInterface === "eth1")?.records ?? [];
        expect(eth1).deep.equals([
            {
                name: INSTANCE,
                recordType: DnsRecordType.SRV,
                value: JSON.stringify({ priority: 0, weight: 0, port: 5540, target: HOST }),
                ttl: 0,
                flushCache: false,
            },
            { name: HOST, recordType: DnsRecordType.A, value: "10.1.0.2", ttl: 0, flushCache: false },
            {
                name: INSTANCE,
                recordType: DnsRecordType.SRV,
                value: JSON.stringify({ priority: 0, weight: 0, port: 5540, target: OTHER_HOST }),
                ttl: TTL,
                flushCache: true,
            },
            { name: OTHER_HOST, recordType: DnsRecordType.A, value: "10.1.0.2", ttl: TTL, flushCache: true },
        ]);
    });

    it("keeps the newer records when an older read finishes last", async () => {
        network.heldReads = [];
        network.interfaces.eth1 = { mac: "aa:bb:cc:dd:ee:02", ipV4: ["10.1.0.2"], ipV6: [] };
        receive(
            DnsCodec.encode({
                messageType: DnsMessageType.Query,
                queries: [{ name: HOST, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
            }),
            "fe80::99",
            "eth1",
        );
        await settle();
        const [olderRead] = network.heldReads;
        expect(olderRead?.name).equals("eth1");

        network.interfaces.eth1 = { ...network.interfaces.eth1, ipV4: ["10.1.0.3"] };
        let checked = false;
        const checking = network.checkInterfaces().then(() => (checked = true));
        while (!checked) {
            await settle();
            for (const read of network.heldReads.splice(1)) {
                read.release();
            }
        }
        await checking;
        olderRead.release();
        network.heldReads = undefined;
        await settle();

        expect(await queryAddresses("eth1")).deep.equals(["10.1.0.3"]);
    });

    it("sends nothing on a served interface that lost its details", async () => {
        await server.close();
        createServer("eth0");
        await server.setRecordsGenerator("matter", generator);
        await queryAddresses();

        await change(() => delete network.interfaces.eth0);
        await MockTime.advance(1_000);

        expect(sent).deep.equals([]);
    });

    it("reads the details again on the next query when an update fails", async () => {
        // The check of the network itself still lists the interfaces; the update after it cannot
        network.failListingsFrom = network.listings + 2;
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));
        network.failListingsFrom = undefined;

        expect(await queryAddresses()).deep.equals(["10.0.0.2", "2001:db8:2::10", "fe80::10"]);
    });

    it("reads the details once for concurrent first queries", async () => {
        network.interfaces.eth1 = { mac: "aa:bb:cc:dd:ee:02", ipV4: ["10.1.0.2"], ipV6: [] };
        network.readsAsync = true;
        network.reads.length = 0;

        for (let i = 0; i < 2; i++) {
            receive(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: HOST, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
                }),
                `fe80::9${i}`,
                "eth1",
            );
        }
        await settle();

        expect(network.reads).deep.equals(["eth1"]);
    });

    it("sends nothing when the server closes during a change", async () => {
        // Reads: the network check, the host name choice, then the rebuild of the records
        let release: (() => void) | undefined;
        network.holdRead = { at: network.reads.length + 3, hold: resume => (release = resume) };
        network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"];
        sent.length = 0;
        const checking = network.checkInterfaces();
        await settle();
        expect(release).not.undefined;

        await server.close();
        release?.();
        await checking;
        await MockTime.advance(1_000);

        expect(sent).deep.equals([]);
    });

    it("sends nothing when the records did not change", async () => {
        network.interfaces.eth1 = { mac: "aa:bb:cc:dd:ee:02", ipV4: ["10.1.0.2"], ipV6: [] };
        await network.checkInterfaces();
        await MockTime.advance(1_000);

        await change(() => (network.interfaces.eth1 = { ...network.interfaces.eth1, mac: "aa:bb:cc:dd:ee:09" }));
        await MockTime.advance(1_000);

        expect(sent).deep.equals([]);
    });

    it("sends a record that several services publish once", async () => {
        await server.setRecordsGenerator("other", (_intf, addrs, hostname) =>
            addrs.ipV6.map(ip => ({ ...AAAARecord(hostname, ip), flushCache: true })),
        );
        await queryAddresses();

        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));

        expect(addressValues(sent.flatMap(({ message }) => message.answers))).deep.equals([
            "2001:db8:1::10",
            "2001:db8:2::10",
            "fe80::10",
        ]);
    });

    it("still repeats after a failed send, and only once", async () => {
        failSends = true;
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));
        failSends = false;

        await MockTime.advance(1_000);
        expect(addressValues(sent.flatMap(({ message }) => message.answers))).includes("2001:db8:2::10");

        sent.length = 0;
        await MockTime.advance(5_000);
        expect(sent).deep.equals([]);
    });

    it("does not repeat after close", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));
        await server.close();
        sent.length = 0;

        await MockTime.advance(1_000);

        expect(sent).deep.equals([]);
    });

    it("does not check the interfaces while no services are registered", async () => {
        await server.close();
        createServer();
        expect(network.interfacesChanged.isObserved).equals(false);

        await server.setRecordsGenerator("matter", generator);
        expect(network.interfacesChanged.isObserved).equals(true);

        await server.expireAnnouncements();
        expect(network.interfacesChanged.isObserved).equals(false);
    });

    it("repeats goodbyes after the services were registered again", async () => {
        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));
        await server.setRecordsGenerator("matter", generator);

        sent.length = 0;
        await MockTime.advance(1_000);
        await settle();

        expect(updates().flatMap(({ records }) => records.filter(({ ttl }) => ttl === 0))).deep.equals([
            { name: HOST, recordType: DnsRecordType.AAAA, value: "2001:db8:1::10", ttl: 0, flushCache: false },
        ]);
    });

    it("sends no update without registered services", async () => {
        await server.expireAnnouncements();
        sent.length = 0;

        await change(() => (network.interfaces.eth0.ipV6 = ["2001:db8:2::10", "fe80::10"]));
        await MockTime.advance(1_000);

        expect(sent).deep.equals([]);
    });
});
