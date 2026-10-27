/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError, Millis, Seconds, Time } from "@matter/main";
import { TlvOfModel } from "@matter/main/types";
import type {
    AttributePathSpec,
    CertDevice,
    CertStepContext,
    ControllerAdapter,
    DeviceExitInfo,
    LogFlavor,
} from "@matter/testing";
import {
    CertStepNotApplicableError,
    LineQueue,
    LogFollower,
    PicsFile,
    resolveControllerSelection,
} from "@matter/testing";
import { expect } from "chai";
import { registerCertCustomCluster } from "../../src/cert/custom-clusters.js";
import { UnitTestingCluster } from "../../src/cert/unit-testing-cluster.js";
import { chunkedWriteNotApplicable, expectChunkedWrite } from "../cert/tc-idm-3.1-support.js";
import { expectMessageWithPath } from "../cert/tc-support.js";
import { LONG_OCTET_STRING_ENTRY, unitTestingNotApplicable } from "../cert/unit-testing-cluster.js";
import { fakeCertNode } from "./fake-cert-node.js";

const EXCHANGE = 18367;
const OTHER_EXCHANGE = 18399;

// Shapes verified against a real chip-all-clusters-app log: the inbound trace line, the exchange layer's receipt
// (which names the TH message it acknowledges), the decode dump, and the outbound response trace line.
let nextCounter = 231087372;
const requestTrace = (exchange = EXCHANGE, counter = nextCounter++) =>
    `[DMG] << from UDP:[fe80::1%eth0]:47759 | ${counter} | [Interaction Model  (1) / Write Request (0x06) / Session = 4265 / Exchange = ${exchange}]`;
const received = (exchange = EXCHANGE, ack?: number) =>
    `[EM] >>> [E:${exchange}r S:4265 M:231087373${ack === undefined ? "" : ` (Ack:${ack})`}] (S) Msg RX from 1:075E73D77EC1AE9B [5E47] to 0000000000000001 --- Type 0001:06 (IM:WriteRequest) (B:1200)`;
const standaloneAck = (ack: number, exchange = EXCHANGE) =>
    `[EM] >>> [E:${exchange}r S:4265 M:231087380 (Ack:${ack})] (S) Msg RX from 1:075E73D77EC1AE9B [5E47] to 0000000000000001 --- Type 0000:10 (SecureChannel:StandaloneAck) (B:34)`;
// The step's attribute, UnitTesting list_long_octet_string, and another the window can hold a write to
const PATH: AttributePathSpec = { endpoint: 1, cluster: 0xfff1fc05, attribute: 0x2a };
const OTHER_PATH: AttributePathSpec = { endpoint: 1, cluster: 0xfff1fc05, attribute: 0x19 };

const pathBlock = ({ endpoint, cluster, attribute }: AttributePathSpec) => [
    "[DMG] \t\t\tAttributePathIB =",
    "[DMG] \t\t\t{",
    `[DMG] \t\t\t\tEndpoint = 0x${endpoint?.toString(16)},`,
    `[DMG] \t\t\t\tCluster = 0x${cluster?.toString(16)},`,
    `[DMG] \t\t\t\tAttribute = 0x0000_00${attribute?.toString(16).toUpperCase().padStart(2, "0")},`,
    "[DMG] \t\t\t}",
];
const dump = (more: boolean, path = PATH) => [
    "[DMG] WriteRequestMessage =",
    "[DMG] {",
    "[DMG] \ttimedRequest = false, ",
    "[DMG] \tAttributeDataIBs =",
    "[DMG] \t[",
    "[DMG] \t\tAttributeDataIB =",
    "[DMG] \t\t{",
    ...pathBlock(path),
    "[DMG] \t\t},",
    "[DMG] \t],",
    `[DMG] \tmoreChunkedMessages = ${more}, `,
    "[DMG] \tInteractionModelRevision = 12",
    "[DMG] },",
];
const response = (counter: number, exchange = EXCHANGE) =>
    `[DMG] >> to UDP:[fe80::1%eth0]:47759 | ${counter} | [Interaction Model  (1) / Write Response (0x07) / Session = 53336 / Exchange = ${exchange}]`;

/** One chunk the DUT sent after acknowledging the TH's response `ack` with it. */
const chunk = (more: boolean, ack?: number, exchange = EXCHANGE, path = PATH) => [
    requestTrace(exchange),
    received(exchange, ack),
    ...dump(more, path),
];

async function check(lines: string[], budget = Seconds(1), flavor: LogFlavor = "chip-local") {
    async function* source() {
        yield* lines;
        // Held open, so a missing line is waited for until the budget ends rather than ending the log
        await new Promise(() => {});
    }
    const follower = new LogFollower(source(), "th");
    try {
        // The step's own path check, which the chunks are bound to
        const deadline = Time.nowUs + budget;
        const request = await expectMessageWithPath(follower, "chip-local", "write", PATH, 0, budget);
        return await expectChunkedWrite(follower, flavor, request, Millis(Math.max(1, deadline - Time.nowUs)));
    } finally {
        await follower.close();
    }
}

describe("expectChunkedWrite", function () {
    this.timeout(10_000);

    it("passes a write chunked over three messages, each next one acknowledging the previous response", async () => {
        const record = await check([
            ...chunk(true),
            response(1001),
            ...chunk(true, 1001),
            response(1002),
            ...chunk(false, 1002),
            response(1003),
        ]);

        expect(record.verdict).equal("pass");
        expect(record.detail).equal(
            `3 WriteRequestMessage chunks on Exchange ${EXCHANGE}, each but the last with MoreChunkedMessages, each ` +
                "next one sent after the DUT acknowledged the TH's WriteResponse to the previous",
        );
    });

    it("accepts a standalone acknowledgement of the response before the next chunk", async () => {
        const record = await check([...chunk(true), response(1001), standaloneAck(1001), ...chunk(false)]);

        expect(record.verdict).equal("pass");
    });

    it("takes the write to the step's attribute, not an earlier write to another one", async () => {
        const record = await check([
            ...chunk(false, undefined, OTHER_EXCHANGE, OTHER_PATH),
            response(2001, OTHER_EXCHANGE),
            ...chunk(true),
            response(1001),
            ...chunk(false, 1001),
        ]);

        expect(record.verdict).equal("pass");
        expect(record.detail).match(/^2 WriteRequestMessage chunks on Exchange 18367/);
    });

    it("skips a write of another exchange between the chunks", async () => {
        const record = await check([
            ...chunk(true),
            response(1001),
            ...chunk(false, undefined, OTHER_EXCHANGE),
            response(2001, OTHER_EXCHANGE),
            ...chunk(false, 1001),
        ]);

        expect(record.verdict).equal("pass");
        expect(record.detail).match(/^2 WriteRequestMessage chunks/);
    });

    it("skips the trace of a retransmitted chunk the TH drops as a duplicate", async () => {
        const first = chunk(true);
        const record = await check([...first, first[0], response(1001), ...chunk(false, 1001)]);

        expect(record.verdict).equal("pass");
        expect(record.detail).match(/^2 WriteRequestMessage chunks/);
    });

    it("does not take a response on another exchange for the chunk's", async () => {
        const record = await check([...chunk(true), response(1001, OTHER_EXCHANGE), ...chunk(false, 1001)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/sent no WriteResponse on Exchange 18367/);
    });

    it("fails a write that arrived as one message", async () => {
        const record = await check([...chunk(false), response(1001)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/did not chunk/);
    });

    it("fails when the TH received no write at all", async () => {
        const record = await check([]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/^The write request was not found/);
    });

    it("fails a chunk announcing more that nothing follows", async () => {
        const record = await check([...chunk(true), response(1001)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/announced a further chunk, and none followed/);
    });

    it("fails a request whose decode never arrives", async () => {
        const record = await check([...chunk(true), response(1001), requestTrace(), received(EXCHANGE, 1001)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/No complete WriteRequestMessage decode/);
    });

    it("fails a request whose decode the log cuts off", async () => {
        // Cut after the step's path, before the message closes
        const record = await check([requestTrace(), received(), ...dump(true).slice(0, 14)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/No complete WriteRequestMessage decode/);
    });

    it("fails when the TH sent no response between two chunks", async () => {
        const record = await check([...chunk(true), ...chunk(false, 1001)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/sent no WriteResponse on Exchange 18367 between write chunks 1 and 2/);
    });

    it("fails a next chunk sent before the DUT acknowledged the response", async () => {
        const record = await check([...chunk(true), response(1001), ...chunk(false), standaloneAck(1001)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/without having acknowledged the TH's WriteResponse 1001 to chunk 1/);
    });

    it("finds a write over TCP not applicable, naming the request's line", async () => {
        // From the matterjs-server leg's chip-local TH log
        const tcpTrace =
            "[1792051325.046] [2435:22184817:chip] [DMG] << from TCP:[fe80::1c9d:1982:6732:a4a7%en0]:65269 | 68058022 | [Interaction Model  (1) / Write Request (0x06) / Session = 6968 / Exchange = 31733]";

        await expect(check([tcpTrace, ...dump(false)])).rejectedWith(
            CertStepNotApplicableError,
            "the DUT's session to the TH runs over TCP (write request at TH log line 0), which carries a payload just " +
                "over one MTU as one message, so the plan's chunking does not apply",
        );
    });

    it("reports a TH of another flavor unverified, whose log has no chunked-write pattern", async () => {
        const record = await check([...chunk(true), response(1001), ...chunk(false, 1001)], Seconds(1), "matterjs");

        expect(record.verdict).equal("unverified");
    });

    it("does not take an acknowledgement on another exchange for the response's", async () => {
        const record = await check([
            ...chunk(true),
            response(1001),
            standaloneAck(1001, OTHER_EXCHANGE),
            ...chunk(false),
        ]);

        expect(record.verdict).equal("fail");
    });
});

describe("chunkedWriteNotApplicable", function () {
    this.timeout(30_000);

    // A chip-local TH's read of UnitTesting list_long_octet_string, from a chip-tool leg's TH log, up to the end of the
    // request's decode; the transfer line comes from the leg's own transport
    const CHIP_UDP_READ =
        "[1792050778.671] [91658:22129362:chip] [DMG] << from UDP:[fe80::1857:fb50:2343:b878%en7]:51414 | 194947269 | [Interaction Model  (1) / Read Request (0x02) / Session = 19775 / Exchange = 41633]";
    // The same trace line from the matterjs-server leg's chip-local TH log
    const CHIP_TCP_READ =
        "[1792051324.681] [2435:22184828:chip] [DMG] << from TCP:[fe80::1c9d:1982:6732:a4a7%en0]:65269 | 68058021 | [Interaction Model  (1) / Read Request (0x02) / Session = 6968 / Exchange = 31732]";
    const READ_DECODE = [
        "[1792050778.671] [91658:22129362:chip] [EM] >>> [E:41633r S:19775 M:194947269] (S) Msg RX from 1:000000000001B669 [88AC] to 0000000000001001 --- Type 0001:02 (IM:ReadRequest) (B:63)",
        "[1792050778.671] [91658:22129362:chip] [IM] Received Read request",
        "[1792050778.671] [91658:22129362:chip] [DMG] ReadRequestMessage =",
        "[1792050778.671] [91658:22129362:chip] [DMG] {",
        "[1792050778.671] [91658:22129362:chip] [DMG] \tAttributePathIBs =",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t[",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t\tAttributePathIB =",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t\t{",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t\t\tEndpoint = 0x1,",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t\t\tCluster = 0xfff1fc05,",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t\t\tAttribute = 0x0000_002A,",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t\t}",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t\t\t",
        "[1792050778.671] [91658:22129362:chip] [DMG] \t],",
    ];

    function pushAll(source: LineQueue, lines: string[]) {
        for (const line of lines) {
            source.push(line);
        }
    }

    async function decide(onRead: (source: LineQueue) => void) {
        const source = new LineQueue();
        const log = new LogFollower(source, "th");
        let reads = 0;
        let writes = 0;
        const node = fakeCertNode({
            readAttribute: async () => {
                reads++;
                onRead(source);
                return [];
            },
            writeAttribute: async () => {
                writes++;
            },
        });
        const th: CertDevice = {
            id: "th",
            app: "all-clusters",
            commissioning: { kind: "on-network", passcode: 20202021, discriminator: 3840, qrPairingCode: "" },
            pics: new PicsFile([]),
            async initialize() {},
            async start() {},
            async stop() {},
            async close() {},
            async snapshot() {
                return {};
            },
            async restore() {},
            async backchannel() {},
            flavor: "chip-local",
            log,
            exit: new Promise<DeviceExitInfo>(() => {}),
        };
        const dut: ControllerAdapter = {
            id: "dut",
            log,
            async start() {},
            async close() {},
            async commission() {
                return "ref";
            },
            async parseQrPayload(): Promise<never> {
                throw new InternalError("not used by these tests");
            },
            async parseManualPairingCode(): Promise<never> {
                throw new InternalError("not used by these tests");
            },
            group: (): never => {
                throw new InternalError("not used by these tests");
            },
            node: () => node,
        };
        const cx: CertStepContext = {
            devices: { th },
            controllers: { dut },
            controllerSelection: resolveControllerSelection(),
            deviceFlavor: "chip-local",
            picsMet: () => {
                throw new InternalError("not used by these tests");
            },
            recorder: {
                beginStep: () => {},
                check: () => {
                    throw new InternalError("deciding whether a step applies records no check");
                },
                endStep: () => [],
                flush: async () => "",
            },
        };
        try {
            let reason: string | undefined;
            let error: unknown;
            try {
                reason = await chunkedWriteNotApplicable(cx, "ref", PATH);
            } catch (e) {
                error = e;
            }
            return { reason, error, reads, writes };
        } finally {
            await log.close();
        }
    }

    it("finds the write not applicable where the DUT's read of its attribute arrived over TCP", async () => {
        const { reason, reads, writes } = await decide(source => pushAll(source, [CHIP_TCP_READ, ...READ_DECODE]));

        expect(reason).equal(
            "the DUT's session to the TH runs over TCP (read request at TH log line 12), which carries a payload just " +
                "over one MTU as one message, so the plan's chunking does not apply",
        );
        expect({ reads, writes }).deep.equal({ reads: 1, writes: 0 });
    });

    it("lets the write run where the read arrived over UDP", async () => {
        const { reason, error } = await decide(source => pushAll(source, [CHIP_UDP_READ, ...READ_DECODE]));

        expect(error).undefined;
        expect(reason).undefined;
    });

    it("lets the write run where the TH's log shows no read of the attribute", async () => {
        const { reason, error } = await decide(source => source.close());

        expect(error).undefined;
        expect(reason).undefined;
    });
});

describe("UnitTesting cluster declaration", () => {
    const model = registerCertCustomCluster(UnitTestingCluster);
    const encode = (name: string, value: unknown) =>
        Bytes.toHex(TlvOfModel(model.attributes.require(name)).encode(value));

    it("encodes each attribute as CHIP's test-cluster.xml declares it", () => {
        expect(model.id).equal(0xfff1fc05);
        expect(model.attributes.require("floatSingle").id).equal(0x17);
        expect(model.attributes.require("octetString").id).equal(0x19);
        expect(model.attributes.require("structAttr").id).equal(0x25);
        expect(model.attributes.require("listLongOctetString").id).equal(0x2a);

        expect(encode("floatSingle", 1.5)).equal("0a0000c03f");
        expect(encode("octetString", Bytes.fromHex("0102"))).equal("10020102");
        expect(
            encode("structAttr", {
                a: 7,
                b: true,
                c: 2,
                d: Bytes.fromHex("dead"),
                e: "",
                f: 5,
                g: 1.5,
                h: -0.25,
            }),
        ).equal("152400072901240202300302dead2c04002405052a060000c03f2b07000000000000d0bf18");
        expect(encode("listLongOctetString", [LONG_OCTET_STRING_ENTRY])).equal(
            `1611${"0002"}${Bytes.toHex(LONG_OCTET_STRING_ENTRY)}18`,
        );
    });
});

describe("unitTestingNotApplicable", () => {
    it("runs the steps on a chip TH", () => {
        expect(unitTestingNotApplicable({ deviceFlavor: "chip-local" })).undefined;
    });

    it("skips them on the matter.js TH, naming the missing cluster", () => {
        expect(unitTestingNotApplicable({ deviceFlavor: "matterjs" })).equal(
            "the matter.js all-clusters app has no UnitTesting cluster",
        );
    });
});
