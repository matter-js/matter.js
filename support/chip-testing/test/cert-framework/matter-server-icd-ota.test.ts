/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError, StandardCrypto, TimeoutError, UnexpectedDataError } from "@matter/general";
import { BdxReceiveAcceptMessage, BdxReceiveInitMessage, CheckInMessage } from "@matter/main/protocol";
import { NodeId } from "@matter/main/types";
import type { LogLine } from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import { expect } from "chai";
import { icdEventsOf } from "../../src/cert/matter-server-icd-client.js";
import {
    fieldsOf,
    MatterServerOtaError,
    providerExchangesOf,
    transferredBytesOf,
} from "../../src/cert/matter-server-ota.js";
import { MatterServerControllerAdapter } from "../../src/cert/MatterServerControllerAdapter.js";
import { MatterServerClient } from "../../src/matter-server/matter-server-client.js";
import { FakeMatterServer, type FakeServerReply } from "./fake-matter-server.js";

const NODE = NodeId(5);
const OTHER_NODE = NodeId(6);
const OWN_NODE_ID = 112233n;
const KEY1 = Bytes.of(Bytes.fromHex("00112233445566778899aabbccddeeff"));
const KEY2 = Bytes.of(Bytes.fromHex("ffeeddccbbaa99887766554433221100"));
const KEY3 = Bytes.of(Bytes.fromHex("0102030405060708090a0b0c0d0e0f10"));

const crypto = new StandardCrypto();

async function rejectionOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (e) {
        return e;
    }
    expect.fail("expected a rejection");
}

function linesOf(texts: string[]): LogLine[] {
    return texts.map((text, index) => ({ index, at: new Date(), text }));
}

/** matter.js's two log lines of a `registerClient` the server sent `node` over TCP, and its answer. */
function registration(
    node: NodeId,
    exchange: string,
    key: Uint8Array,
    icdCounter: number,
    verificationKey?: Uint8Array,
    fabricIndex = 1,
) {
    const token = `@${fabricIndex.toString(16)}:${node.toString(16)}•d65e(tcp)⇵${exchange}`;
    const verification = verificationKey === undefined ? "" : ` verificationKey: ${Bytes.toHex(verificationKey)}`;
    return [
        `2026-10-15 07:43:00.179 INFO ClientInteraction Invoke » ${token} 0.icdManagement.registerClient with ` +
            `checkInNodeId: 112233 monitoredSubject: 112233 key: ${Bytes.toHex(key)} clientType: 0${verification}`,
        `2026-10-15 07:43:00.181 INFO ClientInteraction Invoke « ${token} 0.icdManagement.registerClient ` +
            `icdCounter: ${icdCounter}`,
    ];
}

/** The lines of one Check-In the server received, and how it handled it. */
async function checkIn(
    session: string,
    key: Uint8Array,
    counter: number,
    outcome: "accepted" | "dropped" | "ignored" | "pending",
    droppedFrom = NODE,
) {
    const payload = Bytes.toHex(await CheckInMessage.encodeIcd(crypto, key, counter, 300));
    const lines = [
        `2026-10-15 07:40:08.920 DEBUG MessageExchange Message « for: SC/IcdCheckInMessage id: ` +
            `•unsecured#${session}(tcp)⇵8d42✉0803c574 type: 0x0/0x50 size: 35 payload: ${payload}`,
    ];
    if (outcome === "dropped") {
        lines.push(`2026-10-15 07:40:08.921 INFO FabricIcd Dropping replayed check-in from peer ${droppedFrom}`);
    } else if (outcome === "ignored") {
        lines.push(
            "2026-10-15 07:40:08.921 DEBUG SecureChannelProtocol Ignoring ICD check-in matching no registered peer",
        );
    }
    if (outcome !== "pending") {
        lines.push(`2026-10-15 07:40:08.921 INFO Session •unsecured#${session} Session ended`);
    }
    return lines;
}

const REFRESH_FAILED =
    "2026-10-15 07:43:01.444 WARN IcdClient ICD key refresh for peer @1:5 failed; will retry on next check-in " +
    "[synchronous-transaction-conflict] Cannot lock server-1-fff1.@1:5.icd.state synchronously";

describe("matterjs-server ICD client log", () => {
    it("reports the counter of a Check-In the server accepted, read with the registered key", async () => {
        const events = icdEventsOf(
            linesOf([...registration(NODE, "1599", KEY1, 100), ...(await checkIn("aa", KEY1, 101, "accepted"))]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([{ kind: "checkIn", counter: 101 }]);
    });

    it("leaves out a Check-In the server dropped as a replay or ignored", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...(await checkIn("aa", KEY1, 101, "dropped")),
                ...(await checkIn("bb", KEY1, 102, "ignored")),
                ...(await checkIn("cc", KEY1, 103, "accepted")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([{ kind: "checkIn", counter: 103 }]);
    });

    it("counts a Check-In the server dropped from another node as accepted", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...(await checkIn("aa", KEY1, 101, "dropped", OTHER_NODE)),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([{ kind: "checkIn", counter: 101 }]);
    });

    it("reports nothing from a Check-In the server still handles on", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...(await checkIn("aa", KEY1, 101, "accepted")),
                ...(await checkIn("bb", KEY1, 102, "pending")),
                ...(await checkIn("cc", KEY1, 103, "accepted")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([{ kind: "checkIn", counter: 101 }]);
    });

    it("leaves out the registrations and Check-Ins of another node", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...registration(OTHER_NODE, "159a", KEY2, 200),
                ...(await checkIn("aa", KEY2, 201, "accepted")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([]);
    });

    it("reports a key refresh once the server accepted a Check-In under the new key", async () => {
        const lines = [
            ...registration(NODE, "1599", KEY1, 100),
            ...(await checkIn("aa", KEY1, 0x80000070, "accepted")),
            ...registration(NODE, "159b", KEY2, 0x80000070, KEY1),
        ];
        expect(icdEventsOf(linesOf(lines), NODE, crypto)).deep.equals([{ kind: "checkIn", counter: 0x80000070 }]);

        lines.push(...(await checkIn("bb", KEY2, 0x80000071, "accepted")));
        expect(icdEventsOf(linesOf(lines), NODE, crypto)).deep.equals([
            { kind: "checkIn", counter: 0x80000070 },
            { kind: "keyRefresh", key: KEY2, counterStart: 0x80000070 },
            { kind: "checkIn", counter: 0x80000071 },
        ]);
    });

    it("reports a key refresh confirmed by a Check-In the server dropped under the new key", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...registration(NODE, "159b", KEY2, 300, KEY1),
                ...(await checkIn("bb", KEY2, 300, "dropped")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([{ kind: "keyRefresh", key: KEY2, counterStart: 300 }]);
    });

    it("reports no key refresh the server logged as failed", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...registration(NODE, "159b", KEY2, 300, KEY1),
                REFRESH_FAILED,
                ...(await checkIn("bb", KEY1, 301, "accepted")),
                ...(await checkIn("cc", KEY3, 302, "accepted")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([{ kind: "checkIn", counter: 301 }]);
    });

    it("reads the registrations and refresh failures of a fabric index above 9, which matter.js logs in hex", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100, undefined, 10),
                ...registration(NODE, "159b", KEY2, 300, KEY1, 10),
                REFRESH_FAILED.replaceAll("@1:5", "@a:5"),
                ...(await checkIn("bb", KEY1, 301, "accepted")),
                ...(await checkIn("cc", KEY2, 302, "dropped")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([{ kind: "checkIn", counter: 301 }]);
    });

    it("reports a failed key refresh once the server accepts a Check-In under the pending key", async () => {
        const lines = [
            ...registration(NODE, "1599", KEY1, 100),
            ...registration(NODE, "159b", KEY2, 300, KEY1),
            REFRESH_FAILED,
        ];
        expect(icdEventsOf(linesOf(lines), NODE, crypto)).deep.equals([]);

        lines.push(...(await checkIn("bb", KEY2, 301, "accepted")));
        expect(icdEventsOf(linesOf(lines), NODE, crypto)).deep.equals([
            { kind: "keyRefresh", key: KEY2, counterStart: 300 },
            { kind: "checkIn", counter: 301 },
        ]);
    });

    it("keeps a failed key refresh failed when the server drops or ignores the Check-In under it", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...registration(NODE, "159b", KEY2, 300, KEY1),
                REFRESH_FAILED,
                ...(await checkIn("bb", KEY2, 300, "dropped")),
                ...(await checkIn("cc", KEY2, 301, "ignored")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([]);
    });

    it("reports one key refresh where a retry offers the failed key again", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...registration(NODE, "159b", KEY2, 300, KEY1),
                REFRESH_FAILED,
                ...registration(NODE, "159c", KEY2, 305, KEY1),
                ...(await checkIn("bb", KEY2, 306, "accepted")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([
            { kind: "keyRefresh", key: KEY2, counterStart: 305 },
            { kind: "checkIn", counter: 306 },
        ]);
    });

    it("reports a key refresh whose Check-In came before the response", async () => {
        const [request, response] = registration(NODE, "159b", KEY2, 300, KEY1);
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                request,
                ...(await checkIn("bb", KEY2, 150, "accepted")),
                response,
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([
            { kind: "checkIn", counter: 150 },
            { kind: "keyRefresh", key: KEY2, counterStart: 300 },
        ]);
    });

    it("reports no key refresh whose key the server ignores Check-Ins under", async () => {
        const events = icdEventsOf(
            linesOf([
                ...registration(NODE, "1599", KEY1, 100),
                ...registration(NODE, "159b", KEY2, 300, KEY1),
                ...(await checkIn("bb", KEY2, 301, "ignored")),
            ]),
            NODE,
            crypto,
        );

        expect(events).deep.equals([]);
    });
});

describe("matterjs-server OTA provider log", () => {
    const token = "@1:5•4c89(tcp)⇵e45c✉03b73162";

    it("reads matter.js's field rendering up to the next known field, spaces included", () => {
        expect(
            fieldsOf("status: 0 softwareVersionString: v 2 beta updateToken: aabb", [
                "status",
                "softwareVersionString",
                "updateToken",
                "imageUri",
            ]),
        ).deep.equals({ status: "0", softwareVersionString: "v 2 beta", updateToken: "aabb" });
    });

    it("pairs each provider command of the node with its response", () => {
        const exchanges = providerExchangesOf(
            linesOf([
                `INFO ProtocolService Invoke « s.ota.otaSoftwareUpdateProvider.queryImage ${token} vendorId: 65521 ` +
                    "productId: 32769 softwareVersion: 1 protocolsSupported: 0 location: XX requestorCanConsent: true",
                `INFO ProtocolService Invoke « s.ota.otaSoftwareUpdateProvider.queryImage @1:6•4c89⇵e45c✉0 ` +
                    "vendorId: 1 productId: 2 softwareVersion: 3 protocolsSupported: 0",
                `INFO ProtocolService Invoke » s.ota.otaSoftwareUpdateProvider.queryImage @1:6•4c89⇵e45c✉0 status: 2`,
                `INFO ProtocolService Invoke » s.ota.otaSoftwareUpdateProvider.queryImage ${token} status: 0 ` +
                    "imageUri: bdx://000000000001B669/ota/x softwareVersion: 2 softwareVersionString: v 2 updateToken: aabb",
                `INFO ProtocolService Invoke « s.ota.otaSoftwareUpdateProvider.applyUpdateRequest @1:5•4c89(tcp)⇵e45f✉1 ` +
                    "updateToken: aabb newVersion: 2",
                `INFO ProtocolService Invoke » s.ota.otaSoftwareUpdateProvider.applyUpdateRequest @1:5•4c89(tcp)⇵e45f✉1 ` +
                    "action: 0 delayedActionTime: 0",
            ]),
            NODE,
        );

        expect(exchanges.queryImage.map(({ request, response }) => ({ request, response }))).deep.equals([
            {
                request: {
                    vendorId: 65521,
                    productId: 32769,
                    softwareVersion: 1,
                    protocolsSupported: [0],
                    hardwareVersion: undefined,
                    location: "XX",
                    requestorCanConsent: true,
                    metadataForProvider: undefined,
                },
                response: {
                    status: 0,
                    delayedActionTime: undefined,
                    imageUri: "bdx://000000000001B669/ota/x",
                    softwareVersion: 2,
                    softwareVersionString: "v 2",
                    updateToken: "aabb",
                    userConsentNeeded: undefined,
                    metadataForRequestor: undefined,
                },
            },
        ]);
        expect(exchanges.applyUpdate.map(({ request, response }) => ({ request, response }))).deep.equals([
            { request: { updateToken: "aabb", newVersion: 2 }, response: { action: 0, delayedActionTime: 0 } },
        ]);
    });

    it("pairs the commands of a node on a fabric index above 9, which matter.js logs in hex", () => {
        const onFabric10 = "@a:5•4c89(tcp)⇵e45f✉1";
        const exchanges = providerExchangesOf(
            linesOf([
                `INFO ProtocolService Invoke « s.ota.otaSoftwareUpdateProvider.applyUpdateRequest ${onFabric10} ` +
                    "updateToken: aabb newVersion: 2",
                `INFO ProtocolService Invoke » s.ota.otaSoftwareUpdateProvider.applyUpdateRequest ${onFabric10} ` +
                    "action: 0 delayedActionTime: 0",
            ]),
            NODE,
        );

        expect(exchanges.applyUpdate.map(({ request, response }) => ({ request, response }))).deep.equals([
            { request: { updateToken: "aabb", newVersion: 2 }, response: { action: 0, delayedActionTime: 0 } },
        ]);
    });

    it("counts each block of the session once, however often it was sent", () => {
        const session = "@1:5•4c89(tcp)⇵e45d";
        const block = (kind: string, counter: number, length: number, exchange = session) =>
            `DEBUG MessageChannel Message » for: BDX/${kind} cnt: ${counter} len: ${length} backOff: 1s id: ` +
            `${exchange}✉099d0195 type: 0x2/0x11 payload: 00`;

        expect(
            transferredBytesOf(
                linesOf([
                    block("Block", 0, 1024),
                    block("Block", 0, 1024),
                    block("Block", 1, 1024, "@1:5•4c89(tcp)⇵e45e"),
                    block("BlockEof", 1, 100),
                ]),
                session,
            ),
        ).equals(1124);
    });
});

describe("MatterServerControllerAdapter on the server's ICD client and OTA provider", () => {
    let server: FakeMatterServer;
    let adapter: MatterServerControllerAdapter;
    let lines: LineQueue;
    let replies: Record<string, FakeServerReply | ((args: unknown) => FakeServerReply)>;

    const aclReply: FakeServerReply = {
        result: {
            attributes: { "0/31/0": [{ "1": 5, "2": 2, "3": [Number(OWN_NODE_ID)], "4": null, "254": 1 }] },
            events: [],
        },
    };

    beforeEach(async () => {
        server = await FakeMatterServer.start();
        replies = {};
        server.reply = ({ command, args }) => {
            const reply = replies[command];
            return typeof reply === "function" ? reply(args) : reply;
        };

        lines = new LineQueue();
        const log = new LogFollower(lines.follow(), "dut");
        adapter = new MatterServerControllerAdapter("dut", undefined, async () => {
            const client = await MatterServerClient.connect(server.url);
            return {
                client,
                entry: "fake-entry",
                log,
                httpUrl: server.httpUrl,
                close: async () => {
                    await client.close();
                    lines.close();
                },
            };
        });
        await adapter.start();
    });

    afterEach(async () => {
        await adapter.close();
        await server.close();
        expect(server.failures).deep.equals([]);
    });

    function sentCommands() {
        return server.requests.map(({ command }) => command);
    }

    function node() {
        return adapter.node(NODE.toString());
    }

    describe("icdClient", () => {
        beforeEach(() => {
            replies.enable_auto_subscription = { result: null };
            replies.disable_auto_subscription = { result: null };
            replies.read = aclReply;
            replies.register_icd = () => {
                for (const line of registration(NODE, "1599", KEY1, 4711)) {
                    lines.push(line);
                }
                return { result: { registered: true } };
            };
        });

        it("registers on the server's own subscription and reads what it sent from the server's log", async () => {
            const icd = node().icdClient();

            expect(await icd.register({ allowMultiAdmin: true })).deep.equals({
                key: KEY1,
                nodeId: OWN_NODE_ID,
                icdCounter: 4711,
            });
            expect(server.requests.map(({ command, args }) => ({ command, args }))).deep.equals([
                { command: "enable_auto_subscription", args: { node_id: Number(NODE) } },
                {
                    command: "read",
                    args: { node_id: Number(NODE), attribute_paths: ["0/31/0"], fabric_filtered: true },
                },
                { command: "register_icd", args: { node_id: Number(NODE), allow_multi_admin: true } },
            ]);
            expect(node().icdClient()).equals(icd);
        });

        it("reads the registration the server logged on a fabric index above 9, which matter.js logs in hex", async () => {
            replies.register_icd = () => {
                for (const line of registration(NODE, "1599", KEY1, 4711, undefined, 10)) {
                    lines.push(line);
                }
                return { result: { registered: true } };
            };

            expect(await node().icdClient().register()).deep.include({ key: KEY1, icdCounter: 4711 });
        });

        it("switches the server's subscription on once, and again after stopSubscription", async () => {
            const icd = node().icdClient();
            await icd.register();
            await icd.register();
            await icd.stopSubscription();
            await icd.register();

            expect(sentCommands().filter(command => command.endsWith("auto_subscription"))).deep.equals([
                "enable_auto_subscription",
                "disable_auto_subscription",
                "enable_auto_subscription",
            ]);
        });

        it("tries the server's subscription again after it failed to come up", async () => {
            replies.enable_auto_subscription = { errorCode: 5, details: "node not ready" };
            await rejectionOf(node().icdClient().register());
            replies.enable_auto_subscription = { result: null };
            await node().icdClient().register();

            expect(sentCommands().filter(command => command === "enable_auto_subscription")).length(2);
        });

        it("refuses an ACL that names no single CASE administrator as the server's node id", async () => {
            replies.read = {
                result: {
                    attributes: { "0/31/0": [{ "1": 5, "2": 2, "3": [1, 2], "4": null, "254": 1 }] },
                    events: [],
                },
            };

            expect(await rejectionOf(node().icdClient().register())).instanceOf(UnexpectedDataError);
            expect(sentCommands()).not.include("register_icd");
        });

        it("refuses to unregister without a registration and sends nothing", async () => {
            replies.get_icd_state = { result: { registered: false } };
            // Answered, so a client that sends it anyway settles instead of waiting for a reply
            replies.unregister_icd = { result: { registered: false } };

            expect(await rejectionOf(node().icdClient().unregister())).instanceOf(ImplementationError);
            expect(sentCommands()).deep.equals(["get_icd_state"]);
        });

        it("unregisters with unregister_icd, without forcing", async () => {
            replies.get_icd_state = { result: { registered: true } };
            replies.unregister_icd = { result: { registered: false } };

            await node().icdClient().unregister();
            expect(server.requests.at(-1)?.args).deep.equals({ node_id: Number(NODE), force: false });
        });

        it("switches the server's subscription off once the registration it was switched on for ended", async () => {
            replies.get_icd_state = { result: { registered: true } };
            replies.unregister_icd = { result: { registered: false } };
            const icd = node().icdClient();
            await icd.register();
            await icd.unregister();

            expect(sentCommands().slice(-2)).deep.equals(["unregister_icd", "disable_auto_subscription"]);
            await icd.stopSubscription();
            expect(sentCommands().filter(command => command === "disable_auto_subscription")).length(1);
        });

        it("sends StayActiveRequest and answers the promised duration", async () => {
            replies.device_command = { result: { promisedActiveDuration: 30000 } };

            expect(await node().icdClient().stayActive(10000)).equals(30000);
            expect(server.requests[0].args).deep.include({ command_name: "StayActiveRequest", cluster_id: 0x46 });
        });

        it("waits for a Check-In the server logs, and times out without one", async () => {
            const icd = node().icdClient();
            await icd.register();

            expect(await rejectionOf(icd.waitFor("checkIn", 0, 50))).instanceOf(TimeoutError);

            const waiting = icd.waitFor("checkIn", 0, 5_000);
            for (const line of await checkIn("aa", KEY1, 4712, "accepted")) {
                lines.push(line);
            }
            expect(await waiting).deep.equals({ event: { kind: "checkIn", counter: 4712 }, index: 0 });
        });
    });

    describe("serveOtaUpdate", () => {
        const session = "@1:5•4c89(tcp)⇵e45d";
        const query = "@1:5•4c89(tcp)⇵e45c✉03b73162";
        const apply = "@1:5•4c89(tcp)⇵e45f✉03b731a8";

        function stateTransition(previousState: number, newState: number, reason: number) {
            return {
                node_id: Number(NODE),
                endpoint_id: 0,
                cluster_id: 42,
                event_id: 0,
                event_number: 7,
                priority: 1,
                timestamp: 0,
                data: { previousState, newState, reason, targetSoftwareVersion: 2 },
            };
        }

        /** What the server logs serving the update, and the requestor's events about it. */
        function serve(
            outcome: "downloaded" | "failed" | "downloadError" | "notFromDownloading",
            fileDesignator = "ota/fff1.8001.local.2",
            bdxLines?: string[],
        ) {
            const init = BdxReceiveInitMessage.encode({
                transferProtocol: { version: 0, receiverDrive: true },
                maxBlockSize: 1024,
                fileDesignator: Bytes.fromString(fileDesignator),
            });
            const accept = BdxReceiveAcceptMessage.encode({
                transferControl: { version: 0, receiverDrive: true },
                maxBlockSize: 1024,
            });
            for (const line of [
                "INFO InteractionServer Invoke « @1:5•4c89(tcp)⇵e45c invokes: 1.otaSoftwareUpdateProvider.queryImage",
                `INFO ProtocolService Invoke « s.ota.otaSoftwareUpdateProvider.queryImage ${query} vendorId: 65521 ` +
                    "productId: 32769 softwareVersion: 1 protocolsSupported: 0",
                `INFO ProtocolService Invoke » s.ota.otaSoftwareUpdateProvider.queryImage ${query} status: 0 ` +
                    "imageUri: bdx://000000000001B669/ota/fff1.8001.local.2 softwareVersion: 2 updateToken: aabb",
                ...(bdxLines ?? [
                    `DEBUG MessageExchange Message « for: BDX/ReceiveInit id: ${session}✉1 type: 0x2/0x4 payload: ` +
                        Bytes.toHex(init),
                    `DEBUG MessageChannel Message » for: BDX/ReceiveAccept backOff: 1s id: ${session}✉2 type: 0x2/0x5 ` +
                        `payload: ${Bytes.toHex(accept)}`,
                    `DEBUG MessageChannel Message » for: BDX/BlockEof cnt: 0 len: 700 id: ${session}✉3 type: 0x2/0x12 payload: 00`,
                    `DEBUG MessageExchange Message « for: BDX/BlockAckEof id: ${session}✉4 type: 0x2/0x14 payload: 00`,
                ]),
                `INFO ProtocolService Invoke « s.ota.otaSoftwareUpdateProvider.applyUpdateRequest ${apply} ` +
                    "updateToken: aabb newVersion: 2",
                `INFO ProtocolService Invoke » s.ota.otaSoftwareUpdateProvider.applyUpdateRequest ${apply} action: 0 ` +
                    "delayedActionTime: 0",
            ]) {
                lines.push(line);
            }
            if (outcome === "downloaded") {
                server.pushEvent("node_event", { ...stateTransition(4, 1, 2), node_id: Number(OTHER_NODE) });
                server.pushEvent("node_event", stateTransition(2, 4, 1));
                server.pushEvent("node_event", stateTransition(4, 5, 1));
            } else if (outcome === "notFromDownloading") {
                // Querying to Idle with Success: no transition out of Downloading, so no end of the download
                server.pushEvent("node_event", stateTransition(2, 1, 1));
            } else if (outcome === "failed") {
                server.pushEvent("node_event", stateTransition(4, 1, 2));
            } else {
                server.pushEvent("node_event", {
                    ...stateTransition(4, 1, 2),
                    event_id: 2,
                    data: { softwareVersion: 2, bytesDownloaded: 100, progressPercent: null, platformCode: null },
                });
            }
        }

        beforeEach(() => {
            replies.enable_auto_subscription = { result: null };
            replies.disable_auto_subscription = { result: null };
            replies.start_listening = { result: [] };
            replies.initiate_ota_upload = { result: { upload_id: "abc123", expires_in: 60, max_size: 1 << 26 } };
            replies.read = (args: unknown) =>
                JSON.stringify(args).includes("0/31/0")
                    ? aclReply
                    : { result: { attributes: { "0/40/2": 0xfff1, "0/40/4": 0x8001, "0/40/9": 1 }, events: [] } };
        });

        it("uploads an image one version newer, updates the node and reads the provider's account from its log", async () => {
            replies.update_node = () => {
                setTimeout(() => serve("downloaded"), 10);
                return { result: null };
            };

            const transfer = await node().serveOtaUpdate({ timeoutMs: 5_000, applyTimeoutMs: 5_000 });

            expect(server.uploads).deep.equals([{ uploadId: "abc123", bytes: transfer.fileSize }]);
            expect(server.requests.find(({ command }) => command === "update_node")?.args).deep.equals({
                node_id: Number(NODE),
                software_version: 2,
            });
            expect(transfer).deep.include({
                providerEndpoint: 1,
                providerNodeId: OWN_NODE_ID.toString(),
                softwareVersion: 2,
                transferredBytes: 700,
                applyAcknowledged: true,
                observedMs: 0,
            });
            expect(transfer.proposal).deep.include({
                receiverDrive: true,
                maxBlockSize: 1024,
                fileDesignator: "ota/fff1.8001.local.2",
            });
            expect(transfer.accept).deep.equals({
                version: 0,
                mode: "receiverDrive",
                asynchronousTransfer: false,
                maxBlockSize: 1024,
                definiteLength: undefined,
            });
            expect(transfer.exchanges.queryImage).length(1);
            expect(transfer.exchanges.applyUpdate[0].response.action).equals(0);
            expect(sentCommands().filter(command => command.endsWith("auto_subscription"))).deep.equals([
                "enable_auto_subscription",
                "disable_auto_subscription",
            ]);
            expect(sentCommands().at(-1)).equals("disable_auto_subscription");
        });

        it("reads the proposal, the accept and the bytes sent from the BDX lines of a real server run", async () => {
            // From a live run against chip's ota-requestor-app: pins the line format the BDX cases read
            const real = "@1:5•5ea5(tcp)⇵ea35";
            const bdxLines = [
                `2026-10-16 13:10:04.645 DEBUG MessageExchange Message « for: BDX/ReceiveInit id: ${real}✉020be850 ` +
                    "type: 0x2/0x4 size: 27 payload: 2000000415006f74612f666666312e383030312e6c6f63616c2e32",
                `2026-10-16 13:10:04.647 DEBUG MessageChannel Message » for: BDX/ReceiveAccept id: ${real}✉06b3c7ad ` +
                    "type: 0x2/0x5 size: 4 payload: 20000004",
                `2026-10-16 13:10:04.648 DEBUG MessageChannel Message » for: BDX/Block cnt: 0 len: 1024 id: ${real}✉06b3c7ae ` +
                    "type: 0x2/0x11 size: 1028 payload: 000000001ef1ee1b6c000100",
                `2026-10-16 13:10:04.649 DEBUG MessageChannel Message » for: BDX/Block cnt: 1 len: 1024 id: ${real}✉06b3c7af ` +
                    "type: 0x2/0x11 size: 1028 payload: 01000000d6d7d4d5dadbd8d9",
                `2026-10-16 13:10:04.725 DEBUG MessageChannel Message » for: BDX/BlockEof cnt: 2 len: 108 id: ${real}✉06b3c82a ` +
                    "type: 0x2/0x12 size: 112 payload: 40000000d6d7d4d5dadbd8d9",
                `2026-10-16 13:10:04.726 DEBUG MessageExchange Message « for: BDX/BlockAckEof id: ${real}✉020be8cf ` +
                    "type: 0x2/0x14 size: 4 payload: 40000000",
            ];
            replies.update_node = () => {
                setTimeout(() => serve("downloaded", undefined, bdxLines), 10);
                return { result: null };
            };

            const transfer = await node().serveOtaUpdate({ timeoutMs: 5_000, applyTimeoutMs: 5_000 });

            expect(transfer.proposal).deep.equals({
                version: 0,
                senderDrive: false,
                receiverDrive: true,
                asynchronousTransfer: false,
                maxBlockSize: 1024,
                startOffset: undefined,
                definiteLength: undefined,
                fileDesignator: "ota/fff1.8001.local.2",
                fileDesignatorLength: 21,
            });
            expect(transfer.accept).deep.equals({
                version: 0,
                mode: "receiverDrive",
                asynchronousTransfer: false,
                maxBlockSize: 1024,
                definiteLength: undefined,
            });
            expect(transfer.transferredBytes).equals(2 * 1024 + 108);
        });

        it("reads the session the requestor completed where it aborted a first one and retried", async () => {
            const aborted = "@1:5•5ea5(tcp)⇵ea35";
            const retried = "@1:5•5ea5(tcp)⇵ea41";
            const bdxLines = [
                `2026-10-16 13:10:04.645 DEBUG MessageExchange Message « for: BDX/ReceiveInit id: ${aborted}✉020be850 ` +
                    "type: 0x2/0x4 size: 27 payload: 2000000415006f74612f666666312e383030312e6c6f63616c2e32",
                `2026-10-16 13:10:04.647 DEBUG MessageChannel Message » for: BDX/ReceiveAccept id: ${aborted}✉06b3c7ad ` +
                    "type: 0x2/0x5 size: 4 payload: 20000004",
                `2026-10-16 13:10:04.648 DEBUG MessageChannel Message » for: BDX/Block cnt: 0 len: 1024 id: ${aborted}✉06b3c7ae ` +
                    "type: 0x2/0x11 size: 1028 payload: 000000001ef1ee1b6c000100",
                `2026-10-16 13:10:09.112 DEBUG MessageExchange Message « for: BDX/ReceiveInit id: ${retried}✉020be901 ` +
                    "type: 0x2/0x4 size: 27 payload: 2000000215006f74612f666666312e383030312e6c6f63616c2e32",
                `2026-10-16 13:10:09.114 DEBUG MessageChannel Message » for: BDX/ReceiveAccept id: ${retried}✉06b3c901 ` +
                    "type: 0x2/0x5 size: 4 payload: 20000002",
                `2026-10-16 13:10:09.115 DEBUG MessageChannel Message » for: BDX/Block cnt: 0 len: 512 id: ${retried}✉06b3c902 ` +
                    "type: 0x2/0x11 size: 516 payload: 000000001ef1ee1b6c000100",
                `2026-10-16 13:10:09.190 DEBUG MessageChannel Message » for: BDX/BlockEof cnt: 1 len: 108 id: ${retried}✉06b3c903 ` +
                    "type: 0x2/0x12 size: 112 payload: 01000000d6d7d4d5dadbd8d9",
                `2026-10-16 13:10:09.191 DEBUG MessageExchange Message « for: BDX/BlockAckEof id: ${retried}✉020be902 ` +
                    "type: 0x2/0x14 size: 4 payload: 01000000",
            ];
            replies.update_node = () => {
                setTimeout(() => serve("downloaded", undefined, bdxLines), 10);
                return { result: null };
            };

            const transfer = await node().serveOtaUpdate({ timeoutMs: 5_000, applyTimeoutMs: 5_000 });

            expect(transfer.proposal.maxBlockSize).equals(512);
            expect(transfer.accept.maxBlockSize).equals(512);
            expect(transfer.transferredBytes).equals(512 + 108);
        });

        it("fails on the requestor's DownloadError", async () => {
            replies.update_node = () => {
                setTimeout(() => serve("downloadError"), 10);
                return { result: null };
            };

            const error = await rejectionOf(node().serveOtaUpdate({ timeoutMs: 5_000 }));
            expect(error).instanceOf(MatterServerOtaError);
            expect(String(error)).contains("download error");
            expect(sentCommands().at(-1)).equals("disable_auto_subscription");
        });

        it("fails when the requestor leaves Downloading for a failure", async () => {
            replies.update_node = () => {
                setTimeout(() => serve("failed"), 10);
                return { result: null };
            };

            expect(await rejectionOf(node().serveOtaUpdate({ timeoutMs: 5_000 }))).instanceOf(MatterServerOtaError);
        });

        it("fails when the requestor reports no end of its download in time", async () => {
            replies.update_node = { result: null };

            expect(await rejectionOf(node().serveOtaUpdate({ timeoutMs: 100 }))).instanceOf(MatterServerOtaError);
        });

        it("ends the download wait at the deadline update_node started, not a whole budget after it", async () => {
            replies.update_node = () => {
                setTimeout(() => {
                    const request = server.requests.find(({ command }) => command === "update_node");
                    if (request !== undefined) {
                        server.respond(request.messageId, { result: null });
                    }
                }, 1_000);
                return undefined;
            };

            // One budget for both ends at about 1.1 s plus setup; a budget each would take about 2.1 s
            const started = performance.now();
            expect(await rejectionOf(node().serveOtaUpdate({ timeoutMs: 1_100 }))).instanceOf(MatterServerOtaError);
            expect(performance.now() - started).lessThan(1_700);
        });

        it("still answers an update that went through when switching the subscription off fails", async () => {
            replies.disable_auto_subscription = { errorCode: 5, details: "node not ready" };
            replies.update_node = () => {
                setTimeout(() => serve("downloaded"), 10);
                return { result: null };
            };

            const transfer = await node().serveOtaUpdate({ timeoutMs: 5_000, applyTimeoutMs: 5_000 });
            expect(transfer.applyAcknowledged).equals(true);
            expect(sentCommands().at(-1)).equals("disable_auto_subscription");
        });

        it("leaves the subscription on where the ICD client switched it on before", async () => {
            replies.register_icd = () => {
                for (const line of registration(NODE, "1599", KEY1, 4711)) {
                    lines.push(line);
                }
                return { result: { registered: true } };
            };
            replies.update_node = () => {
                setTimeout(() => serve("downloaded"), 10);
                return { result: null };
            };

            await node().icdClient().register();
            await node().serveOtaUpdate({ timeoutMs: 5_000, applyTimeoutMs: 5_000 });

            expect(sentCommands().filter(command => command.endsWith("auto_subscription"))).deep.equals([
                "enable_auto_subscription",
            ]);
        });

        it("takes only a transition out of Downloading for the end of the download", async () => {
            replies.update_node = () => {
                setTimeout(() => serve("notFromDownloading"), 10);
                return { result: null };
            };

            const error = await rejectionOf(node().serveOtaUpdate({ timeoutMs: 500 }));
            expect(error).instanceOf(MatterServerOtaError);
            expect(String(error)).contains("reported no end of its download");
        });

        it("fails on a BDX session for a file that is no OTA image", async () => {
            replies.update_node = () => {
                setTimeout(() => serve("downloaded", "log/node.log"), 10);
                return { result: null };
            };

            const error = await rejectionOf(node().serveOtaUpdate({ timeoutMs: 5_000, applyTimeoutMs: 5_000 }));
            expect(error).instanceOf(MatterServerOtaError);
            expect(String(error)).contains("which is no OTA image");
        });

        it("fails when the server refuses the upload", async () => {
            server.uploadStatus = 400;

            expect(await rejectionOf(node().serveOtaUpdate())).instanceOf(MatterServerOtaError);
            expect(sentCommands()).not.include("update_node");
        });
    });
});
