/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError, isObject, UnexpectedDataError } from "@matter/general";
import { getOperationalDeviceQname } from "@matter/main/protocol";
import { GlobalFabricId, NodeId, StatusResponseError } from "@matter/main/types";
import type { CertNodeApi, ControllerAdapter, ControllerAdapterOptions, ControllerCapability } from "@matter/testing";
import { LineQueue, LogFollower, UnsupportedByControllerError } from "@matter/testing";
import { expect } from "chai";
import { registerCertCustomCluster } from "../../src/cert/custom-clusters.js";
import {
    MATTERJS_SERVER_CAPABILITY_GAPS,
    MATTERJS_SERVER_CONTROLLER_PICS,
    MatterServerControllerAdapter,
    MatterServerReadError,
} from "../../src/cert/MatterServerControllerAdapter.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import { MatterServerClient } from "../../src/matter-server/matter-server-client.js";
import { MatterServerWireError } from "../../src/matter-server/matter-server-wire.js";
import { FaultInjectionCluster } from "../cert/fault-injection.js";
import { waitFor } from "./fake-chip-tool.js";
import { FAKE_SERVER_INFO, FakeMatterServer, type FakeServerReply } from "./fake-matter-server.js";

const NODE = "5";

const ON_OFF = 6;
const ON_TIME = 0x4001;
const GROUP_KEY_MANAGEMENT = 0x3f;

async function rejectionOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (e) {
        return e;
    }
    expect.fail("expected a rejection");
}

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

/** CHIP's UnitTesting cluster, which chip's all-clusters app hosts and the Matter model does not define. */
const UNIT_TESTING = 0xfff1fc05;

/** A refusal of a capability the adapter declares it lacks, carrying the reason it declares. */
function expectDeclaredRefusal(error: unknown, capability: ControllerCapability) {
    expect(error, capability).instanceOf(UnsupportedByControllerError);
    expect(messageOf(error), capability).contains(MATTERJS_SERVER_CAPABILITY_GAPS[capability]);
}

describe("MatterServerControllerAdapter", () => {
    let server: FakeMatterServer;
    let adapter: MatterServerControllerAdapter;
    let log: LogFollower;
    let replies: Record<string, FakeServerReply>;

    beforeEach(async () => {
        server = await FakeMatterServer.start();
        replies = {};
        server.reply = ({ command }) => replies[command];

        const lines = new LineQueue();
        log = new LogFollower(lines.follow(), "dut");
        adapter = new MatterServerControllerAdapter("dut", undefined, async () => {
            const client = await MatterServerClient.connect(server.url);
            return {
                client,
                entry: "fake-entry",
                log,
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

    function node(): CertNodeApi {
        return adapter.node(NODE);
    }

    function sent() {
        return server.requests.map(({ command, args }) => ({ command, args }));
    }

    describe("commission", () => {
        const commissioned: FakeServerReply = { result: { node_id: 5, attributes: {} } };

        it("commissions a QR code with commission_with_code, network only", async () => {
            replies.commission_with_code = commissioned;

            expect(await adapter.commission({ qrPairingCode: "MT:Y.K90AFN00KA0648G00" })).equals(NODE);
            expect(sent()).deep.equals([
                { command: "commission_with_code", args: { code: "MT:Y.K90AFN00KA0648G00", network_only: true } },
            ]);
        });

        it("commissions a manual pairing code with commission_with_code, network only", async () => {
            replies.commission_with_code = commissioned;

            expect(await adapter.commission({ manualPairingCode: "34970112332" })).equals(NODE);
            expect(sent()).deep.equals([
                { command: "commission_with_code", args: { code: "34970112332", network_only: true } },
            ]);
        });

        it("commissions a passcode and long discriminator with commission_on_network", async () => {
            replies.commission_on_network = commissioned;

            expect(await adapter.commission({ passcode: 20202021, discriminator: 3840 })).equals(NODE);
            expect(sent()).deep.equals([
                { command: "commission_on_network", args: { setup_pin_code: 20202021, filter_type: 2, filter: 3840 } },
            ]);
        });

        it("commissions withoutSubscription as usual, because the server holds no subscription of its own", async () => {
            replies.commission_with_code = commissioned;

            expect(await adapter.commission({ manualPairingCode: "34970112332", withoutSubscription: true })).equals(
                NODE,
            );
        });

        it("refuses singleHandshakeAttempt before any command is sent, for the reason it declares", async () => {
            const error = await rejectionOf(
                adapter.commission({ manualPairingCode: "34970112332", singleHandshakeAttempt: true }),
            );

            expectDeclaredRefusal(error, "single-handshake-attempt");
            expect(server.requests).deep.equals([]);
        });

        it("refuses giveUpAfterMs before any command is sent, for the reason it declares", async () => {
            const error = await rejectionOf(adapter.commission({ manualPairingCode: "34970112332", giveUpAfterMs: 1 }));

            expectDeclaredRefusal(error, "commissioning-give-up");
            expect(server.requests).deep.equals([]);
        });

        it("refuses an onboarding payload the codec rejects before any command is sent", async () => {
            for (const target of [
                // The QR payload above with its last character changed, which breaks the payload's encoding
                { qrPairingCode: "MT:Y.K90AFN00KA0648G0-" },
                // The manual code above with a wrong check digit
                { manualPairingCode: "34970112331" },
            ]) {
                const error = await rejectionOf(adapter.commission(target));
                expect(error, JSON.stringify(target)).instanceOf(OnboardingPayloadRefusedError);
            }
            expect(server.requests).deep.equals([]);
        });

        it("refuses a concatenated QR code before any command is sent", async () => {
            const error = await rejectionOf(
                adapter.commission({ qrPairingCode: "MT:Y.K90AFN00KA0648G00*Y.K90AFN00KA0648G00" }),
            );

            expect(error).instanceOf(ImplementationError);
            expect(server.requests).deep.equals([]);
        });
    });

    describe("readAttribute", () => {
        it("reads a concrete path with read_attribute, fabric filtered by default", async () => {
            replies.read_attribute = { result: { "1/6/0": true } };

            expect(await node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 })).equals(true);
            expect(sent()).deep.equals([
                { command: "read_attribute", args: { node_id: 5, attribute_path: "1/6/0", fabric_filtered: true } },
            ]);
        });

        it("passes fabricFiltered false through", async () => {
            replies.read_attribute = { result: { "1/6/0": true } };

            await node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }, { fabricFiltered: false });
            expect(sent()).deep.equals([
                { command: "read_attribute", args: { node_id: 5, attribute_path: "1/6/0", fabric_filtered: false } },
            ]);
        });

        it("reads a wildcard path into entries without a data version", async () => {
            replies.read_attribute = { result: { "1/6/0": true, "1/6/16384": false } };

            expect(await node().readAttribute({ endpoint: 1, cluster: ON_OFF })).deep.equals([
                { endpoint: 1, cluster: ON_OFF, attribute: 0, value: true },
                { endpoint: 1, cluster: ON_OFF, attribute: 0x4000, value: false },
            ]);
            expect(sent()).deep.equals([
                { command: "read_attribute", args: { node_id: 5, attribute_path: "1/6/*", fabric_filtered: true } },
            ]);
        });

        it("fails a concrete path the result has no value for, which is how the server reports a status", async () => {
            replies.read_attribute = { result: { "1/6/16384": false } };

            const error = await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }));
            expect(error).instanceOf(MatterServerReadError);
            expect(messageOf(error)).contains("1/6/0");
        });

        it("fails a concrete path whose value does not decode", async () => {
            replies.read_attribute = { result: { "1/6/0": "yes" } };

            const error = await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }));
            expect(error).instanceOf(MatterServerWireError);
            expect(messageOf(error)).contains("1/6/0");
        });

        it("fails a wildcard read when one of its values does not decode", async () => {
            replies.read_attribute = { result: { "1/6/0": true, "1/6/16384": "no" } };

            const error = await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF }));
            expect(error).instanceOf(MatterServerWireError);
            expect(messageOf(error)).contains("1/6/16384");
        });

        it("refuses largeMessage before any command is sent, for the reason it declares", async () => {
            const error = await rejectionOf(
                node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }, { largeMessage: true }),
            );

            expectDeclaredRefusal(error, "tcp-transport");
            expect(server.requests).deep.equals([]);
        });

        it("refuses a wildcard read reporting an attribute outside its model, as a gap it declares", async () => {
            replies.read_attribute = { result: { "1/6/0": true, [`1/${UNIT_TESTING}/0`]: true } };

            expectDeclaredRefusal(await rejectionOf(node().readAttribute({ endpoint: 1 })), "unmodeled-data");
        });

        it("refuses a concrete read of an attribute outside its model, as a gap it declares", async () => {
            replies.read_attribute = { result: { "1/6/61440": 3 } };

            expectDeclaredRefusal(
                await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 61440 })),
                "unmodeled-data",
            );
        });

        it("refuses a concrete id the server reads as a wildcard before any command is sent", async () => {
            for (const path of [
                { endpoint: 0xffff, cluster: ON_OFF, attribute: 0 },
                { endpoint: 1, cluster: 0xffffffff, attribute: 0 },
                { endpoint: 1, cluster: ON_OFF, attribute: 0xffffffff },
            ]) {
                const error = await rejectionOf(node().readAttribute(path));
                expect(error, JSON.stringify(path)).instanceOf(UnsupportedByControllerError);
            }
            expect(server.requests).deep.equals([]);
        });
    });

    describe("readAttributes", () => {
        it("reads every path in one read_attribute", async () => {
            replies.read_attribute = { result: { "1/6/0": true, "0/40/5": "kitchen" } };

            expect(
                await node().readAttributes([
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    { endpoint: 0, cluster: 0x28, attribute: 5 },
                ]),
            ).deep.equals([
                { endpoint: 1, cluster: ON_OFF, attribute: 0, value: true },
                { endpoint: 0, cluster: 0x28, attribute: 5, value: "kitchen" },
            ]);
            expect(sent()).deep.equals([
                {
                    command: "read_attribute",
                    args: { node_id: 5, attribute_path: ["1/6/0", "0/40/5"], fabric_filtered: true },
                },
            ]);
        });

        it("fails a concrete path the result has no value for", async () => {
            replies.read_attribute = { result: { "1/6/0": true } };

            const error = await rejectionOf(
                node().readAttributes([
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    { endpoint: 0, cluster: 0x28, attribute: 5 },
                ]),
            );
            expect(error).instanceOf(MatterServerReadError);
            expect(messageOf(error)).contains("0/40/5");
        });

        it("fails a path whose value does not decode", async () => {
            replies.read_attribute = { result: { "1/6/0": true, "1/6/16384": 3 } };

            const error = await rejectionOf(node().readAttributes([{ endpoint: 1, cluster: ON_OFF }]));
            expect(error).instanceOf(MatterServerWireError);
        });

        it("refuses to report data versions before any command is sent, for the reason it declares", async () => {
            const error = await rejectionOf(
                node().readAttributes([{ endpoint: 1, cluster: ON_OFF, attribute: 0 }], { dataVersions: true }),
            );

            expectDeclaredRefusal(error, "data-versions");
            expect(server.requests).deep.equals([]);
        });

        it("refuses more paths than the server sends in one ReadRequest before any command is sent", async () => {
            const paths = Array.from({ length: 10 }, (_, attribute) => ({ endpoint: 1, cluster: ON_OFF, attribute }));

            const error = await rejectionOf(node().readAttributes(paths));
            expect(error).instanceOf(UnsupportedByControllerError);
            expect(server.requests).deep.equals([]);
        });
    });

    describe("writeAttribute", () => {
        it("writes with write_attribute", async () => {
            replies.write_attribute = {
                result: [{ Path: { EndpointId: 1, ClusterId: ON_OFF, AttributeId: ON_TIME }, Status: 0 }],
            };

            await node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2);
            expect(sent()).deep.equals([
                { command: "write_attribute", args: { node_id: 5, attribute_path: "1/6/16385", value: 2 } },
            ]);
        });

        it("fails with the status the device answered", async () => {
            replies.write_attribute = {
                result: [{ Path: { EndpointId: 1, ClusterId: ON_OFF, AttributeId: ON_TIME }, Status: 0x87 }],
            };

            const error = await rejectionOf(
                node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2),
            );
            if (!(error instanceof StatusResponseError)) {
                expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
            }
            expect(error.code).equals(0x87);
        });

        it("refuses a timed write before any command is sent", async () => {
            const error = await rejectionOf(
                node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2, {
                    timedInteractionTimeoutMs: 500,
                }),
            );

            expect(error).instanceOf(UnsupportedByControllerError);
            expect(server.requests).deep.equals([]);
        });

        it("refuses an attribute the server's model does not know before any command is sent", async () => {
            const error = await rejectionOf(
                node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0xf000 }, 1),
            );

            expectDeclaredRefusal(error, "unmodeled-data");
            expect(server.requests).deep.equals([]);
        });
    });

    describe("build", () => {
        it("names the entry and the server version the adapter connected to", () => {
            expect(adapter.build).deep.equals({
                entry: "fake-entry",
                sdkVersion: FAKE_SERVER_INFO.sdk_version,
                schemaVersion: String(FAKE_SERVER_INFO.schema_version),
            });
        });
    });

    describe("invoke", () => {
        describe("serialisation", () => {
            const requestsOf = () => server.requests.filter(({ command }) => command === "device_command");

            it("sends identical concurrent invokes of a node one after the other", async () => {
                const first = node().invoke("OnOff", "on");
                const second = node().invoke("OnOff", "on");

                await waitFor(() => requestsOf().length === 1, "first device_command");
                // A second request in flight would be merged with the first by the server
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(requestsOf().length).equals(1);

                server.respond(requestsOf()[0].messageId, { result: null });
                await first;
                await waitFor(() => requestsOf().length === 2, "second device_command");
                server.respond(requestsOf()[1].messageId, { result: null });
                await second;
            });

            it("does not hold the queue behind a rejected invoke and keeps call order", async () => {
                const first = node().invoke("OnOff", "on");
                const second = node().invoke("OnOff", "off");
                const third = node().invoke("OnOff", "toggle");

                await waitFor(() => requestsOf().length === 1, "first device_command");
                server.respond(requestsOf()[0].messageId, { errorCode: 1, details: "refused" });
                expect(await rejectionOf(first)).instanceOf(Error);

                await waitFor(() => requestsOf().length === 2, "second device_command");
                server.respond(requestsOf()[1].messageId, { result: null });
                await second;

                await waitFor(() => requestsOf().length === 3, "third device_command");
                server.respond(requestsOf()[2].messageId, { result: null });
                await third;

                expect(requestsOf().map(({ args }) => (isObject(args) ? args.command_name : undefined))).deep.equals([
                    "On",
                    "Off",
                    "Toggle",
                ]);
            });

            it("does not make one node wait for another", async () => {
                const first = adapter.node("5").invoke("OnOff", "on");
                const second = adapter.node("6").invoke("OnOff", "on");

                await waitFor(() => requestsOf().length === 2, "both device_command requests");
                for (const { messageId } of requestsOf()) {
                    server.respond(messageId, { result: null });
                }
                await Promise.all([first, second]);
            });
        });

        it("invokes with device_command and decodes the response", async () => {
            replies.device_command = {
                result: {
                    groupKeySet: {
                        groupKeySetID: 1,
                        groupKeySetId: 1,
                        groupKeySecurityPolicy: 0,
                        epochKey0: null,
                        epochStartTime0: 844315200000000,
                        epochKey1: null,
                        epochStartTime1: null,
                        epochKey2: null,
                        epochStartTime2: null,
                    },
                },
            };

            expect(await node().invoke(GROUP_KEY_MANAGEMENT, "KeySetRead", { groupKeySetId: 1 })).deep.equals({
                groupKeySet: {
                    groupKeySetId: 1,
                    groupKeySecurityPolicy: 0,
                    epochKey0: null,
                    epochStartTime0: 1791000000000000n,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                },
            });
            expect(sent()).deep.equals([
                {
                    command: "device_command",
                    args: {
                        node_id: 5,
                        endpoint_id: 0,
                        cluster_id: GROUP_KEY_MANAGEMENT,
                        command_name: "KeySetRead",
                        payload: { groupKeySetId: 1 },
                    },
                },
            ]);
        });

        it("answers undefined for a status-only answer and passes a timed request through", async () => {
            replies.device_command = { result: null };

            expect(await node().invoke("OnOff", "on", undefined, 1, { timedInteractionTimeoutMs: 500 })).equals(
                undefined,
            );
            expect(sent()).deep.equals([
                {
                    command: "device_command",
                    args: {
                        node_id: 5,
                        endpoint_id: 1,
                        cluster_id: ON_OFF,
                        command_name: "On",
                        payload: {},
                        timed_request_timeout_ms: 500,
                    },
                },
            ]);
        });

        it("encodes the payload as the server's name-based converter reads it", async () => {
            replies.device_command = { result: null };

            await node().invoke(GROUP_KEY_MANAGEMENT, "KeySetWrite", {
                groupKeySet: {
                    groupKeySetId: 1,
                    groupKeySecurityPolicy: 0,
                    epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                    epochStartTime0: 946684802220000n,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                },
            });
            const [request] = server.requests;
            expect(request.args).deep.include({
                payload: {
                    groupKeySet: {
                        groupKeySetId: 1,
                        groupKeySecurityPolicy: 0,
                        epochKey0: "0NHS09TV1tfY2drb3N3e3w==",
                        epochStartTime0: 2220000,
                        epochKey1: null,
                        epochStartTime1: null,
                        epochKey2: null,
                        epochStartTime2: null,
                    },
                },
            });
        });

        it("refuses a zero timed-request timeout, which the server sends untimed, before any command is sent", async () => {
            const error = await rejectionOf(
                node().invoke(ON_OFF, "On", undefined, 1, { timedInteractionTimeoutMs: 0 }),
            );

            expect(error).instanceOf(UnsupportedByControllerError);
            expect(server.requests).deep.equals([]);
        });

        it("refuses a cluster outside the standard model before any command is sent", async () => {
            registerCertCustomCluster(FaultInjectionCluster);

            const error = await rejectionOf(node().invoke("FaultInjection", "FailAtFault", {}));

            expectDeclaredRefusal(error, "unmodeled-data");
            expect(server.requests).deep.equals([]);
        });
    });

    it("decommissions with remove_node", async () => {
        replies.remove_node = { result: null };

        await node().decommission();
        expect(sent()).deep.equals([{ command: "remove_node", args: { node_id: 5 } }]);
    });

    describe("held state from get_node", () => {
        beforeEach(() => {
            replies.get_node = {
                result: {
                    node_id: 5,
                    attributes: {
                        "0/29/0": [{ "0": 22, "1": 1 }],
                        "0/29/3": [1],
                        "1/29/0": [{ "0": 256, "1": 3 }],
                        "1/29/3": [],
                        "1/6/0": true,
                        "1/6/16384": "broken",
                    },
                },
            };
        });

        it("answers clientEndpoints from the node's descriptors", async () => {
            expect(await node().clientEndpoints()).deep.equals([
                { endpoint: 0, deviceTypes: [22], parts: [1] },
                { endpoint: 1, deviceTypes: [256], parts: [] },
            ]);
            expect(sent()).deep.equals([{ command: "get_node", args: { node_id: 5 } }]);
        });

        it("fails clientEndpoints for a device type entry without a device type", async () => {
            replies.get_node = { result: { node_id: 5, attributes: { "0/29/0": [{ "1": 1 }] } } };

            expect(await rejectionOf(node().clientEndpoints())).instanceOf(UnexpectedDataError);
        });

        it("answers clientAttribute with the held value, and undefined where none is held", async () => {
            expect(await node().clientAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 })).equals(true);
            expect(await node().clientAttribute({ endpoint: 2, cluster: ON_OFF, attribute: 0 })).equals(undefined);
            expect(sent()).deep.equals([
                { command: "get_node", args: { node_id: 5 } },
                { command: "get_node", args: { node_id: 5 } },
            ]);
        });

        it("fails clientAttribute for a held value that does not decode", async () => {
            const error = await rejectionOf(
                node().clientAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0x4000 }),
            );

            expect(error).instanceOf(MatterServerWireError);
        });
    });

    describe("openCommissioningWindow", () => {
        it("opens an enhanced window with open_commissioning_window", async () => {
            replies.open_commissioning_window = {
                result: {
                    setup_pin_code: 12345678,
                    setup_manual_code: "34970112332",
                    setup_qr_code: "MT:Y.K90AFN00KA0648G00",
                    discriminator: 1234,
                    vendor_id: 0xfff1,
                    product_id: 0x8001,
                    commissioning_timeout: 180,
                },
            };

            expect(await node().openCommissioningWindow({ timeout: 180, enhanced: true })).deep.equals({
                manualPairingCode: "34970112332",
                qrPairingCode: "MT:Y.K90AFN00KA0648G00",
            });
            expect(sent()).deep.equals([{ command: "open_commissioning_window", args: { node_id: 5, timeout: 180 } }]);
        });

        it("refuses openCommissioningWindow({enhanced:false}) until C10", async () => {
            const error = await rejectionOf(node().openCommissioningWindow({ timeout: 180, enhanced: false }));

            expect(error).instanceOf(UnsupportedByControllerError);
            expect(server.requests).deep.equals([]);
        });
    });

    it("computes the operational instance name from server_info's compressed fabric id", async () => {
        expect(await node().operationalMdnsInstanceName()).equals(
            getOperationalDeviceQname(GlobalFabricId(BigInt(FAKE_SERVER_INFO.compressed_fabric_id)), NodeId(5)),
        );
        expect(server.requests).deep.equals([]);
    });

    describe("misuse", () => {
        it("fails an invoke of an unknown cluster as an implementation error before any command is sent", async () => {
            const error = await rejectionOf(node().invoke("NoSuchCluster", "On"));

            expect(error).instanceOf(ImplementationError);
            expect(messageOf(error)).contains("NoSuchCluster");
            expect(server.requests).deep.equals([]);
        });

        it("fails an invoke of an unknown command as an implementation error before any command is sent", async () => {
            const error = await rejectionOf(node().invoke(ON_OFF, "NoSuchCommand"));

            expect(error).instanceOf(ImplementationError);
            expect(messageOf(error)).contains("NoSuchCommand");
            expect(server.requests).deep.equals([]);
        });

        it("fails a write to a wildcard path as an implementation error before any command is sent", async () => {
            const error = await rejectionOf(node().writeAttribute({ endpoint: 1, cluster: ON_OFF }, 1));

            expect(error).instanceOf(ImplementationError);
            expect(server.requests).deep.equals([]);
        });

        it("fails a read of no paths as an implementation error before any command is sent", async () => {
            const error = await rejectionOf(node().readAttributes([]));

            expect(error).instanceOf(ImplementationError);
            expect(server.requests).deep.equals([]);
        });

        it("refuses invokeBatch as a gap of this controller", async () => {
            const error = await rejectionOf(node().invokeBatch([{ cluster: ON_OFF, command: "On" }]));

            expect(error).instanceOf(UnsupportedByControllerError);
            expect(server.requests).deep.equals([]);
        });
    });

    it("refuses every unmapped operation before any command is sent", async () => {
        const n = node();
        const refusals: Record<string, () => unknown> = {
            invokeBatch: () => n.invokeBatch([{ cluster: ON_OFF, command: "On" }]),
            writeAttributes: () => n.writeAttributes([{ path: { cluster: ON_OFF, attribute: ON_TIME }, value: 1 }]),
            subscribe: () =>
                n.subscribe({ endpoint: 1 }, { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 }),
            readEvents: () => n.readEvents([{ endpoint: 1 }]),
            subscribeEvents: () =>
                n.subscribeEvents([{ endpoint: 1 }], { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 }),
            observeEvents: () => n.observeEvents([{ endpoint: 1 }], {}),
            sessions: () => n.sessions(),
            severTransportConnection: () => n.severTransportConnection(1),
            icdClient: () => n.icdClient(),
            serveOtaUpdate: () => n.serveOtaUpdate(),
            announceOtaProvider: () => n.announceOtaProvider(),
            scriptOtaProvider: () => n.scriptOtaProvider({}),
            defineKeySet: () =>
                adapter.group(1).defineKeySet({
                    groupKeySetId: 1,
                    groupKeySecurityPolicy: 0,
                    epochKey0: new Uint8Array(16),
                    epochStartTime0: 1n,
                }),
            groupInvoke: () => adapter.group(1).invoke(ON_OFF, "On"),
        };

        for (const [name, call] of Object.entries(refusals)) {
            let error: unknown;
            try {
                await call();
            } catch (e) {
                error = e;
            }
            expect(error, name).instanceOf(UnsupportedByControllerError);
        }
        expect(server.requests).deep.equals([]);
    });

    it("refuses group messaging for the reason it declares", async () => {
        expectDeclaredRefusal(await rejectionOf(adapter.group(1).invoke(ON_OFF, "On")), "group-messaging");
    });

    it("reads an onboarding payload with the codec the server commissions from, without asking the server", async () => {
        expect(await adapter.parseQrPayload("MT:Y.K90AFN00KA0648G00")).deep.include({
            discriminator: 3840,
            passcode: 20202021,
        });
        expect(await adapter.parseManualPairingCode("34970112332")).deep.include({
            shortDiscriminator: 15,
            passcode: 20202021,
        });
        expect(await rejectionOf(adapter.parseManualPairingCode("34970112331"))).instanceOf(
            OnboardingPayloadRefusedError,
        );
        expect(server.requests).deep.equals([]);
    });

    it("feeds the server process's log follower to the adapter's log", () => {
        expect(adapter.log).equals(log);
    });
});

describe("MatterServerControllerAdapter construction", () => {
    it("refuses options the server cannot honour, for the reason it declares", () => {
        const cases: [ControllerAdapterOptions, ControllerCapability][] = [
            [{ transport: "tcp" }, "tcp-transport"],
            [{ attestation: true }, "attestation"],
            [{ webRtcRequestor: true }, "webrtc-requestor"],
        ];
        for (const [options, capability] of cases) {
            let adapter: ControllerAdapter | undefined;
            let error: unknown;
            try {
                adapter = new MatterServerControllerAdapter("dut", options);
            } catch (e) {
                error = e;
            }
            expectDeclaredRefusal(error, capability);
            expect(adapter).equals(undefined);
        }
    });

    it("stops a server that finished starting after the adapter was closed", async () => {
        const server = await FakeMatterServer.start();
        try {
            let closed = false;
            let finish = () => {};
            const ready = new Promise<void>(resolve => (finish = resolve));
            const adapter = new MatterServerControllerAdapter("dut", undefined, async () => {
                await ready;
                const client = await MatterServerClient.connect(server.url);
                const lines = new LineQueue();
                return {
                    client,
                    entry: "fake-entry",
                    log: new LogFollower(lines.follow(), "dut"),
                    close: async () => {
                        closed = true;
                        await client.close();
                        lines.close();
                    },
                };
            });

            const starting = adapter.start();
            await adapter.close();
            finish();

            expect(await rejectionOf(starting)).instanceOf(ImplementationError);
            expect(closed).equals(true);
        } finally {
            await server.close();
        }
    });

    describe("lifecycle", () => {
        async function launchFake() {
            const server = await FakeMatterServer.start();
            const lines = new LineQueue();
            let launches = 0;
            const adapter = new MatterServerControllerAdapter("dut", undefined, async () => {
                launches++;
                const client = await MatterServerClient.connect(server.url);
                return {
                    client,
                    entry: "fake-entry",
                    log: new LogFollower(lines.follow(), "dut"),
                    close: async () => {
                        await client.close();
                        lines.close();
                    },
                };
            });
            return { adapter, launches: () => launches, close: () => server.close() };
        }

        it("fails use before start() as an implementation error", async () => {
            const { adapter, close } = await launchFake();
            try {
                expect(adapter.build).equals(undefined);
                expect(() => adapter.log).throws(ImplementationError);
                expect(
                    await rejectionOf(adapter.node(NODE).readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 })),
                ).instanceOf(ImplementationError);
            } finally {
                await adapter.close();
                await close();
            }
        });

        it("refuses a second start() without launching another server", async () => {
            const { adapter, launches, close } = await launchFake();
            try {
                await adapter.start();

                const error = await rejectionOf(adapter.start());

                expect(error).instanceOf(ImplementationError);
                expect(messageOf(error)).contains("already started");
                expect(launches()).equals(1);
            } finally {
                await adapter.close();
                await close();
            }
        });

        it("refuses to start again after close()", async () => {
            const { adapter, launches, close } = await launchFake();
            try {
                await adapter.start();
                await adapter.close();

                const error = await rejectionOf(adapter.start());

                expect(error).instanceOf(ImplementationError);
                expect(messageOf(error)).contains("cannot be restarted");
                expect(launches()).equals(1);
            } finally {
                await close();
            }
        });
    });

    it("declares batch invoke, concatenated QR codes and basic commissioning windows unsupported", () => {
        expect(MATTERJS_SERVER_CONTROLLER_PICS).deep.include({
            "MCORE.IDM.C.InvokeRequest.BatchCommands": 0,
            "MCORE.DD.CTRL_CONCATENATED_QR_CODE_1": 0,
            "CADMIN.C.C01.Tx": 0,
        });
    });
});
