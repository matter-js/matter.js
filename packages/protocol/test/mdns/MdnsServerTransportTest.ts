/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MdnsServer } from "#mdns/MdnsServer.js";
import {
    AAAARecord,
    ARecord,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsRecordClass,
    DnsRecordType,
    LogDestination,
    Logger,
    LogLevel,
    MdnsSocket,
    Minutes,
    Millis,
    MockNetwork,
    NetworkInterfaceDetails,
    NetworkSimulator,
    NetworkUnreachableError,
    PtrRecord,
    Seconds,
    SrvRecord,
    Time,
    TxtRecord,
    UdpSocketOptions,
} from "@matter/general";

const DEVICE_IPv4 = "192.168.200.1";
const DEVICE_IPv6 = "fe80::e777:4f5e:c61e:7314";
const DEVICE_MAC = "00:B0:D0:63:C2:26";
const CONTROLLER_IPv4 = "192.168.200.2";
const CONTROLLER_MAC = "CA:FE:00:00:BE:EF";
const HOST = "abcd.local";
const OPERATIONAL = "operational.b.c.d";
const WINDOW = "window.b.c.d";
const FULL_TTL = Seconds(120);
const IPV4_FAILURE = "Send failed on fake0 (IPv4): send ENETUNREACH 224.0.0.251:5353";
const CANNOT_SEND = `mDNS messages on interface fake0 cannot be sent: ${IPV4_FAILURE}`;
const ONLY_SOME = `mDNS messages on interface fake0 reach only some address families: ${IPV4_FAILURE}`;
const CANNOT_SEND_ANY = `mDNS messages on interface fake0 cannot be sent: ${IPV4_FAILURE}, fake0 (IPv6): send ENETUNREACH ff02::fb:5353`;

/**
 * The device's network.  Its sockets fail IPv4 multicast sends while {@link failsMulticast} is set, as after a wake
 * from standby, and IPv6 multicast sends while {@link failsIpv6Multicast} is set.  The interface reports no addresses
 * while {@link hasNoAddress} is set.
 */
class DeviceNetwork extends MockNetwork {
    failsMulticast = false;
    failsIpv6Multicast = false;
    hasNoAddress = false;
    /** IPv4 multicast sends to fail, counted from 0 */
    readonly failingMulticasts = new Set<number>();
    #multicasts = 0;
    readonly failedAt = new Array<number>();
    readonly multicastAt = new Array<number>();
    /** Unicast sends to fail, counted from 0 */
    readonly failingUnicasts = new Set<number>();
    #unicasts = 0;

    override getIpMac(name: string): NetworkInterfaceDetails {
        const details = super.getIpMac(name);
        return this.hasNoAddress ? { mac: details.mac, ipV4: [], ipV6: [] } : details;
    }

    override async createUdpSocket(options: UdpSocketOptions) {
        const socket = await super.createUdpSocket(options);
        const send = socket.send.bind(socket);
        socket.send = async (host, port, payload) => {
            const fails = this.failsMulticast || this.failingMulticasts.has(this.#multicasts);
            if (host === MdnsSocket.BROADCAST_IPV4) {
                this.#multicasts++;
            }
            if (fails && host === MdnsSocket.BROADCAST_IPV4) {
                this.failedAt.push(Time.nowUs);
                throw new NetworkUnreachableError("send ENETUNREACH 224.0.0.251:5353");
            }
            if (host === MdnsSocket.BROADCAST_IPV4) {
                this.multicastAt.push(Time.nowUs);
            }
            if (this.failsIpv6Multicast && host === MdnsSocket.BROADCAST_IPV6) {
                throw new NetworkUnreachableError("send ENETUNREACH ff02::fb:5353");
            }
            if (host !== MdnsSocket.BROADCAST_IPV4 && host !== MdnsSocket.BROADCAST_IPV6) {
                if (this.failingUnicasts.has(this.#unicasts++)) {
                    throw new NetworkUnreachableError(`send ENETUNREACH ${host}:${port}`);
                }
            }
            return send(host, port, payload);
        };
        return socket;
    }
}

/** {@link message} with its list of failed sends sorted, because the address families are sent in parallel */
function failuresInAnyOrder(message: string) {
    const [head, list] = message.split("Send failed on ");
    return list === undefined ? message : `${head}Send failed on ${list.split(", ").sort().join(", ")}`;
}
function serviceRecords(qname: string, ttl = FULL_TTL) {
    return [
        PtrRecord("_svc._udp.local", qname, ttl),
        SrvRecord(qname, { priority: 0, weight: 0, port: 1234, target: HOST }, ttl),
        ARecord(HOST, DEVICE_IPv4, ttl),
    ];
}

/**
 * Our responder on the real {@link MdnsSocket} and UDP transport over a simulated network, so a failed send is
 * reported the way the transport reports it.
 */
describe("MdnsServer on the UDP transport", () => {
    before(MockTime.enable);

    let network: DeviceNetwork;
    let deviceSocket: MdnsSocket;
    let controllerSocket: MdnsSocket;
    let server: MdnsServer;
    let received: Array<{ message: DnsMessage; to: string }>;
    let notices: string[];
    let debugs: string[];
    let registrations: Map<string, MdnsServer.Registration>;

    beforeEach(async () => {
        const simulator = new NetworkSimulator();
        network = new DeviceNetwork(simulator, DEVICE_MAC, [DEVICE_IPv4]);
        const controllerNetwork = new MockNetwork(simulator, CONTROLLER_MAC, [CONTROLLER_IPv4]);
        received = new Array();
        simulator.router.intercept((packet, next) => {
            if (
                packet.kind === "udp" &&
                (packet.sourceAddress === DEVICE_IPv4 || packet.sourceAddress === DEVICE_IPv6)
            ) {
                const message = DnsCodec.decode(packet.payload);
                if (message !== undefined && DnsMessageType.isResponse(message.messageType)) {
                    received.push({ message, to: packet.destAddress });
                }
            }
            next(packet);
        });

        deviceSocket = await MdnsSocket.create(network, { netInterface: "fake0" });
        controllerSocket = await MdnsSocket.create(controllerNetwork, { netInterface: "fake0" });
        server = new MdnsServer(deviceSocket);
        registrations = new Map();

        notices = new Array<string>();
        debugs = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message) {
                if (message.facility === "MdnsServer" && message.level === LogLevel.NOTICE) {
                    const [text, error] = message.values;
                    notices.push(failuresInAnyOrder(`${text}: ${error instanceof Error ? error.message : error}`));
                }
                if (message.facility === "MdnsServer" && message.level === LogLevel.DEBUG) {
                    const [text, error] = message.values;
                    debugs.push(`${text}: ${error instanceof Error ? error.message : error}`);
                }
            },
        });

        for (const [service, qname] of [
            ["operational", OPERATIONAL],
            ["window", WINDOW],
        ]) {
            registrations.set(service, await MockTime.resolve(server.register(service, () => serviceRecords(qname))));
        }
        await MockTime.resolve(server.broadcast());
        await elapse(Seconds(2));
        received.length = 0;
    });

    afterEach(async () => {
        delete Logger.destinations.capture;
        network.failsMulticast = network.failsIpv6Multicast = network.hasNoAddress = false;
        await MockTime.resolve(server.close());
        await MockTime.resolve(deviceSocket.close());
        await MockTime.resolve(controllerSocket.close());
    });

    /** Let exactly {@link duration} pass in 10 ms steps, with the network and the timers due in each step running. */
    async function elapse(duration: number, step = Millis(10)) {
        for (let elapsed = 0; elapsed < duration; elapsed += step) {
            await MockTime.advance(step);
            await MockTime.macrotasks;
        }
    }

    function retryTimers() {
        return MockTime.timerCountFor("MDNS goodbye retry");
    }

    async function query(name: string, uniCastResponse = false, recordType = DnsRecordType.SRV) {
        await controllerSocket.send({
            messageType: DnsMessageType.Query,
            queries: [{ name, recordClass: DnsRecordClass.IN, recordType, uniCastResponse }],
        });
        await elapse(Millis(200));
    }

    function goodbyesOf(qname: string, to?: string) {
        return received
            .filter(packet => to === undefined || packet.to === to)
            .flatMap(({ message }) =>
                message.answers.filter(({ name, value, ttl }) => (name === qname || value === qname) && ttl === 0),
            );
    }

    for (const failure of ["a socket error", "an interface without an address"]) {
        it(`sends a goodbye that failed for ${failure} with the next publication`, async () => {
            if (failure === "a socket error") {
                network.failsMulticast = true;
            } else {
                network.hasNoAddress = true;
            }
            await MockTime.resolve(registrations.get("window")!.withdraw());
            expect(goodbyesOf(WINDOW)).deep.equals([]);

            network.failsMulticast = network.hasNoAddress = false;
            await MockTime.resolve(server.broadcast());
            await elapse(Seconds(2));

            expect(
                goodbyesOf(WINDOW)
                    .map(({ recordType }) => DnsRecordType[recordType])
                    .sort(),
            ).deep.equals(["PTR", "SRV"]);
        });
    }

    it("notices a failing multicast answer once even when a unicast answer succeeds in between", async () => {
        network.failsMulticast = true;
        await query(OPERATIONAL);
        expect(notices).deep.equals([CANNOT_SEND]);

        await query(OPERATIONAL, true);
        expect(received.map(({ to }) => to)).deep.equals([CONTROLLER_IPv4]);

        await elapse(Seconds(2));
        await query(OPERATIONAL);
        expect(notices).deep.equals([CANNOT_SEND]);
    });

    it("notices a failing deferred answer", async () => {
        await MockTime.resolve(server.broadcast("operational"));
        const announcedAt = network.multicastAt[network.multicastAt.length - 1];
        network.failsMulticast = true;

        await query(OPERATIONAL);
        await elapse(Seconds(2));

        expect(network.failedAt.length).equals(1);
        expect(network.failedAt[0] - announcedAt).least(1000);
        expect(notices).deep.equals([CANNOT_SEND]);
    });

    it("tries a failed goodbye of the last service again without a further publication", async () => {
        network.failsMulticast = true;
        await MockTime.resolve(registrations.get("operational")!.withdraw());
        await MockTime.resolve(registrations.get("window")!.withdraw());
        expect(goodbyesOf(WINDOW)).deep.equals([]);

        network.failsMulticast = false;
        await elapse(Seconds(5));

        expect(goodbyesOf(WINDOW).length).greaterThan(0);
        expect(goodbyesOf(OPERATIONAL).length).greaterThan(0);
    });

    it("stops trying a failed goodbye once peers no longer cache its records", async () => {
        network.failsMulticast = true;
        await MockTime.resolve(registrations.get("operational")!.withdraw());
        await MockTime.resolve(registrations.get("window")!.withdraw());
        await elapse(FULL_TTL);
        const attempts = network.failedAt.length;
        expect(attempts).greaterThan(2);

        await elapse(Seconds(120));

        expect(network.failedAt.length).equals(attempts);
    });

    it("says goodbye to the records of an announcement whose later datagram failed", async () => {
        const many = Array.from({ length: 30 }, (_, index) =>
            TxtRecord("big.b.c.d", [`key${index}=${"x".repeat(40)}`], FULL_TTL),
        );
        const big = await MockTime.resolve(server.register("big", () => [...serviceRecords("big.b.c.d"), ...many]));
        await elapse(Seconds(2));
        network.failingMulticasts.clear();
        const sentBefore = network.multicastAt.length + network.failedAt.length;
        network.failingMulticasts.add(sentBefore + 1);
        await MockTime.resolve(server.broadcast("big"));
        expect(network.failedAt.length).equals(1);
        await elapse(Seconds(2));
        received.length = 0;

        await MockTime.resolve(big.withdraw());

        expect(goodbyesOf("big.b.c.d").length).greaterThan(0);
    });

    it("logs at debug level a unicast answer whose later datagram failed, and notices nothing", async () => {
        const many = Array.from({ length: 30 }, (_, index) =>
            TxtRecord("big.b.c.d", [`key${index}=${"x".repeat(40)}`], FULL_TTL),
        );
        await MockTime.resolve(server.register("big", () => [...serviceRecords("big.b.c.d"), ...many]));
        await MockTime.resolve(server.broadcast("big"));
        await elapse(Seconds(2));
        received.length = 0;
        network.failingUnicasts.add(1);

        await query("big.b.c.d", true, DnsRecordType.TXT);

        expect(received.filter(({ to }) => to === CONTROLLER_IPv4).length).equals(1);
        expect(debugs).contains(
            `Failed to send part of mDNS response to ${CONTROLLER_IPv4}: Send failed on fake0 (IPv4) to ${CONTROLLER_IPv4}: send ENETUNREACH ${CONTROLLER_IPv4}:5353`,
        );
        expect(notices).deep.equals([]);
    });

    it("ends the retry once the goodbyes left", async () => {
        network.failsMulticast = true;
        await MockTime.resolve(registrations.get("window")!.withdraw());
        expect(retryTimers()).equals(1);

        network.failsMulticast = false;
        await elapse(Seconds(3));

        expect(goodbyesOf(WINDOW).length).greaterThan(0);
        expect(retryTimers()).equals(0);
    });

    it("starts no retry for a failed announcement without goodbyes", async () => {
        network.failsMulticast = true;

        await MockTime.resolve(server.broadcast());

        expect(network.failedAt.length).greaterThan(0);
        expect(retryTimers()).equals(0);
    });

    it("keeps the state of an interface whose goodbye retry waits, so close stops the retry", async () => {
        const long = await MockTime.resolve(server.register("long", () => serviceRecords("long.b.c.d", Minutes(16))));
        await MockTime.resolve(server.broadcast("long"));
        await elapse(Seconds(2));
        network.failsMulticast = true;
        await MockTime.resolve(registrations.get("operational")!.withdraw());
        await MockTime.resolve(registrations.get("window")!.withdraw());
        await MockTime.resolve(long.withdraw());
        await elapse(Minutes(16) + Seconds(5), Millis(100));
        expect(retryTimers()).equals(1);

        await MockTime.resolve(server.broadcast());
        await MockTime.resolve(server.close());

        expect(retryTimers()).equals(0);
    });

    it("tries a failed goodbye again at most a minute apart", async () => {
        const long = await MockTime.resolve(server.register("long", () => serviceRecords("long.b.c.d", Seconds(600))));
        await MockTime.resolve(server.broadcast("long"));
        await elapse(Seconds(2));
        network.failsMulticast = true;
        network.failedAt.length = 0;

        await MockTime.resolve(long.withdraw());
        await elapse(Seconds(250));

        const gaps = network.failedAt.slice(1).map((at, index) => Math.round((at - network.failedAt[index]) / 1000));
        expect(gaps).deep.equals([1, 2, 4, 8, 16, 32, 60, 60, 60]);
    });

    it("keeps the pending retry when another goodbye fails meanwhile", async () => {
        network.failsMulticast = true;
        network.failedAt.length = 0;
        await MockTime.resolve(registrations.get("window")!.withdraw());
        await elapse(Millis(500));
        await MockTime.resolve(registrations.get("operational")!.withdraw());

        await elapse(Seconds(8));

        // After the two withdrawals there is one retry schedule, so the retries are 2 and then 4 seconds apart
        const retries = network.failedAt.slice(2);
        expect(retries.slice(1).map((at, index) => Math.round((at - retries[index]) / 1000))).deep.equals([2, 4]);
    });

    it("sends only the goodbyes when it tries them again", async () => {
        network.failsMulticast = true;
        await MockTime.resolve(registrations.get("window")!.withdraw());
        await elapse(Seconds(2));
        received.length = 0;
        network.failsMulticast = false;

        await elapse(Seconds(3));

        const records = received.flatMap(({ message }) => message.answers);
        expect(records.length).greaterThan(0);
        expect(records.filter(({ ttl }) => ttl > 0)).deep.equals([]);
    });

    it("does not try a failed goodbye again after close", async () => {
        network.failsMulticast = true;
        await MockTime.resolve(registrations.get("window")!.withdraw());
        const attempts = network.failedAt.length;

        await MockTime.resolve(server.close());
        expect(retryTimers()).equals(0);
        await elapse(Seconds(5));

        expect(network.failedAt.length).equals(attempts);
    });

    it("does not try a goodbye again that failed while the server closes", async () => {
        network.failsMulticast = true;
        const withdrawing = registrations.get("window")!.withdraw();
        const closing = server.close();
        await MockTime.resolve(Promise.all([withdrawing, closing]));
        const attempts = network.failedAt.length;
        expect(retryTimers()).equals(0);

        await elapse(Seconds(5));

        expect(attempts).greaterThan(0);
        expect(network.failedAt.length).equals(attempts);
    });

    for (const end of ["the goodbye left", "peers dropped the records"]) {
        it(`tries a failed goodbye again after a second once an earlier retry ended because ${end}`, async () => {
            network.failsMulticast = true;
            await MockTime.resolve(registrations.get("window")!.withdraw());
            await elapse(end === "the goodbye left" ? Seconds(8) : FULL_TTL + Seconds(70));
            network.failsMulticast = false;
            await elapse(Seconds(70));
            if (end === "the goodbye left") {
                expect(goodbyesOf(WINDOW).length).greaterThan(0);
            }

            await query(OPERATIONAL);
            await elapse(Seconds(2));
            network.failsMulticast = true;
            await MockTime.resolve(registrations.get("operational")!.withdraw());
            const attempts = network.failedAt.length;
            await elapse(Millis(1500));

            expect(network.failedAt.length).equals(attempts + 1);
        });
    }

    it("neither notices nor says goodbye on an interface with only a family the server does not use", async () => {
        const ipv6Socket = await MdnsSocket.create(network, { netInterface: "fake0", enableIpv4: false });
        const ipv6Server = new MdnsServer(ipv6Socket);
        try {
            const registration = await MockTime.resolve(ipv6Server.register("v6", () => serviceRecords("v6.b.c.d")));
            await MockTime.resolve(ipv6Server.broadcast());
            network.addAddr(DEVICE_IPv6);
            await MockTime.resolve(registration.withdraw());
            expect(retryTimers()).equals(0);
            await elapse(Seconds(5));

            expect(notices).deep.equals([]);
            expect(goodbyesOf("v6.b.c.d")).deep.equals([]);
        } finally {
            await MockTime.resolve(ipv6Server.close());
            await MockTime.resolve(ipv6Socket.close());
        }
    });

    it("publishes an address the interface gained after its details were read", async () => {
        await MockTime.resolve(
            server.register("host", (_intf, { ipV6 }) => ipV6.map(ip => AAAARecord(HOST, ip, FULL_TTL))),
        );
        await MockTime.resolve(server.broadcast("host"));
        network.addAddr(DEVICE_IPv6);
        for (let i = 0; i < 4; i++) {
            await elapse(Minutes(5), Seconds(1));
            received.length = 0;
            await MockTime.resolve(server.broadcast("host"));
            await elapse(Seconds(2));
        }

        const addresses = received.flatMap(({ message }) => message.answers).map(({ value }) => value);
        expect(addresses).contains(DEVICE_IPv6);
    });

    describe("on an interface with IPv4 and IPv6", () => {
        beforeEach(() => {
            network.addAddr(DEVICE_IPv6);
        });

        it("says goodbye to records whose announcement left on IPv6 only", async () => {
            network.failsMulticast = true;
            const third = await MockTime.resolve(server.register("third", () => serviceRecords("third.b.c.d")));
            await MockTime.resolve(server.broadcast("third"));
            expect(notices).deep.equals([ONLY_SOME]);

            network.failsMulticast = false;
            await elapse(Seconds(2));
            await MockTime.resolve(third.withdraw());

            expect(goodbyesOf("third.b.c.d").length).greaterThan(0);
        });

        it("notices once per outage, whether multicasts reach some address families or none", async () => {
            async function broadcastReaching(families: "all" | "some" | "none") {
                network.failsMulticast = families !== "all";
                network.failsIpv6Multicast = families === "none";
                await MockTime.resolve(server.broadcast());
                await elapse(Seconds(2));
            }

            await broadcastReaching("some");
            await broadcastReaching("none");
            await broadcastReaching("some");
            expect(notices).deep.equals([ONLY_SOME]);

            await broadcastReaching("all");
            await broadcastReaching("none");
            expect(notices).deep.equals([ONLY_SOME, CANNOT_SEND_ANY]);
        });

        it("tries a goodbye that left on IPv6 only again until it leaves on IPv4", async () => {
            network.failsMulticast = true;
            await MockTime.resolve(registrations.get("window")!.withdraw());
            expect(goodbyesOf(WINDOW, MdnsSocket.BROADCAST_IPV6).length).greaterThan(0);
            expect(goodbyesOf(WINDOW, MdnsSocket.BROADCAST_IPV4)).deep.equals([]);

            network.failsMulticast = false;
            await elapse(Seconds(3));

            expect(goodbyesOf(WINDOW, MdnsSocket.BROADCAST_IPV4).length).greaterThan(0);
        });

        it("multicasts the answer to a QU query after a goodbye that left on IPv6 only", async () => {
            network.failsMulticast = true;
            await MockTime.resolve(registrations.get("window")!.withdraw());
            network.failsMulticast = false;
            registrations.set(
                "window",
                await MockTime.resolve(server.register("window", () => serviceRecords(WINDOW))),
            );
            received.length = 0;

            await query(WINDOW, true);
            await elapse(Seconds(2));

            const answers = received.filter(({ message }) => message.answers.some(({ name }) => name === WINDOW));
            expect(answers.map(({ to }) => to)).not.includes(CONTROLLER_IPv4);
            expect(answers.length).greaterThan(0);
        });
    });
});
