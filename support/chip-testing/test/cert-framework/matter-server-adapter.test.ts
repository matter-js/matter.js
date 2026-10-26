/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    ClosedError,
    ImplementationError,
    InternalError,
    isObject,
    Minutes,
    TimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import { DiscoveryError } from "@matter/main";
import { getOperationalDeviceQname } from "@matter/main/protocol";
import {
    CommissioningFlowType,
    DiscoveryCapabilitiesSchema,
    GlobalFabricId,
    ManualPairingCodeCodec,
    NodeId,
    QrPairingCodeCodec,
    StatusResponseError,
    VendorId,
} from "@matter/main/types";
import type { AttributeReadEntry, CertNodeApi, ControllerAdapter, ControllerAdapterOptions } from "@matter/testing";
import { CertConfigError, LineQueue, LogFollower, UnsupportedByControllerError } from "@matter/testing";
import { expect } from "chai";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { ControllerCommandError } from "../../src/cert/controller-command-error.js";
import { registerCertCustomCluster } from "../../src/cert/custom-clusters.js";
import { InProcessControllerAdapter } from "../../src/cert/InProcessControllerAdapter.js";
import {
    MATTERJS_SERVER_CAPABILITY_GAPS,
    MATTERJS_SERVER_CONTROLLER_PICS,
    MATTERJS_SERVER_OUT_OF_SCOPE,
    MatterServerCommissioningError,
    MatterServerControllerAdapter,
    MatterServerReadError,
} from "../../src/cert/MatterServerControllerAdapter.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import { type CertContextFile, certContextFor } from "../../src/matter-server/matter-server-cert-context.js";
import { MatterServerClient, MatterServerCommandError } from "../../src/matter-server/matter-server-client.js";
import { MatterServerSubscriptionEndedError } from "../../src/matter-server/matter-server-subscriptions.js";
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

function show(wire: unknown) {
    return JSON.stringify(wire, (_key, value: unknown) => (typeof value === "bigint" ? `${value}n` : value));
}

/** CHIP's FaultInjection cluster, which neither the Matter model nor the server's model defines. */
const UNMODELED = 0xfff1fc06;

/** CHIP's UnitTesting cluster, which the server models beyond the Matter model. */
const UNIT_TESTING = 0xfff1fc05;
const UNIT_TESTING_OCTET_STRING = 0x19;
const UNIT_TESTING_STRUCT = 0x25;

type MatterServerGap = keyof typeof MATTERJS_SERVER_CAPABILITY_GAPS;

type MatterServerRefusal = MatterServerGap | keyof typeof MATTERJS_SERVER_OUT_OF_SCOPE;

function isGap(capability: MatterServerRefusal): capability is MatterServerGap {
    return Object.hasOwn(MATTERJS_SERVER_CAPABILITY_GAPS, capability);
}

/** A refusal naming a capability the adapter declares it lacks, carrying the reason it declares. */
function expectDeclaredRefusal(error: unknown, capability: MatterServerRefusal) {
    if (!(error instanceof UnsupportedByControllerError)) {
        expect.fail(`${capability}: expected an UnsupportedByControllerError, got ${messageOf(error)}`);
    }
    expect(error.capability, capability).equals(capability);
    expect(messageOf(error), capability).contains(
        isGap(capability) ? MATTERJS_SERVER_CAPABILITY_GAPS[capability] : MATTERJS_SERVER_OUT_OF_SCOPE[capability],
    );
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
                httpUrl: server.httpUrl,
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

        it("sends giveUpAfterMs as discovery_timeout_s in seconds on every commissioning command", async () => {
            replies.commission_with_code = commissioned;
            replies.commission_on_network = commissioned;

            await adapter.commission({ qrPairingCode: "MT:Y.K90AFN00KA0648G00", giveUpAfterMs: 20_000 });
            await adapter.commission({ manualPairingCode: "34970112332", giveUpAfterMs: 1_500 });
            await adapter.commission({ passcode: 20202021, discriminator: 3840, giveUpAfterMs: 90_000 });

            expect(sent()).deep.equals([
                {
                    command: "commission_with_code",
                    args: { code: "MT:Y.K90AFN00KA0648G00", network_only: true, discovery_timeout_s: 20 },
                },
                {
                    command: "commission_with_code",
                    args: { code: "34970112332", network_only: true, discovery_timeout_s: 1.5 },
                },
                {
                    command: "commission_on_network",
                    args: { setup_pin_code: 20202021, filter_type: 2, filter: 3840, discovery_timeout_s: 90 },
                },
            ]);
        });

        it("reports the server's not-discovered answer to a bounded commission as DiscoveryError", async () => {
            replies.commission_with_code = {
                errorCode: 1,
                details: "not discovered",
                failure: { reason: "not-discovered" },
            };

            const error = await rejectionOf(
                adapter.commission({ manualPairingCode: "34970112332", giveUpAfterMs: 5000 }),
            );
            expect(error).instanceOf(DiscoveryError);
        });

        it("leaves the verdict on a code matter.js's codec rejects to the server, and reports its refusal", async () => {
            replies.commission_with_code = {
                errorCode: 8,
                details: "Invalid pairing code",
                failure: { reason: "invalid-payload" },
            };
            const codes = [
                // The QR payload above with its last character changed, which breaks the payload's encoding
                "MT:Y.K90AFN00KA0648G0-",
                // The manual code above with a wrong check digit
                "34970112331",
            ];
            for (const code of codes) {
                const target = code.startsWith("MT:") ? { qrPairingCode: code } : { manualPairingCode: code };
                const error = await rejectionOf(adapter.commission(target));
                expect(error, code).instanceOf(OnboardingPayloadRefusedError);
            }
            expect(sent()).deep.equals(
                codes.map(code => ({ command: "commission_with_code", args: { code, network_only: true } })),
            );
        });

        it("reports a device the server did not find as a discovery failure", async () => {
            replies.commission_on_network = {
                errorCode: 1,
                details: "No commissionable device was discovered",
                failure: { reason: "not-discovered" },
            };

            const error = await rejectionOf(adapter.commission({ passcode: 20202021, discriminator: 3840 }));
            expect(error).instanceOf(DiscoveryError);
            expect(error).not.instanceOf(ControllerCommandError);
        });

        it("reports any other reason the server names with that reason, and not as a bare command failure", async () => {
            for (const reason of ["passcode-mismatch", "attestation-rejected", "timeout", "other"]) {
                replies.commission_on_network = { errorCode: 1, details: "failed", failure: { reason } };

                const error = await rejectionOf(adapter.commission({ passcode: 20202021, discriminator: 3840 }));
                if (!(error instanceof MatterServerCommissioningError)) {
                    expect.fail(`${reason}: expected a MatterServerCommissioningError, got ${messageOf(error)}`);
                }
                expect(error.reason).equals(reason);
                expect(error).not.instanceOf(ControllerCommandError);
            }
        });

        it("leaves a refusal without a reason a command failure", async () => {
            replies.commission_on_network = { errorCode: 5, details: "Node already exists" };

            const error = await rejectionOf(adapter.commission({ passcode: 20202021, discriminator: 3840 }));
            expect(error).instanceOf(MatterServerCommandError);
            expect(error).not.instanceOf(ControllerCommandError);
        });

        it("waits for commissioning longer than a command's default timeout", async () => {
            MockTime.enable();
            try {
                const outcome = adapter.commission({ manualPairingCode: "34970112332" }).catch((e: unknown) => e);
                await waitFor(() => server.requests.length === 1, "commission request");
                let settled = false;
                const watched = outcome.then(() => (settled = true));

                await MockTime.advance(Minutes(4).valueOf());
                await new Promise(resolve => setImmediate(resolve));
                expect(settled).equals(false);
                await MockTime.advance(Minutes(1).valueOf());
                expect(await outcome).instanceOf(TimeoutError);
                await watched;
            } finally {
                MockTime.disable();
            }
        });

        it("waits for a bounded commission longer than the server's discovery timeout", async () => {
            MockTime.enable();
            try {
                const outcome = adapter
                    .commission({ manualPairingCode: "34970112332", giveUpAfterMs: Minutes(10) })
                    .catch((e: unknown) => e);
                await waitFor(() => server.requests.length === 1, "commission request");
                let settled = false;
                const watched = outcome.then(() => (settled = true));

                await MockTime.advance(Minutes(14).valueOf());
                await new Promise(resolve => setImmediate(resolve));
                expect(settled).equals(false);
                await MockTime.advance(Minutes(1).valueOf());
                expect(await outcome).instanceOf(TimeoutError);
                await watched;
            } finally {
                MockTime.disable();
            }
        });

        it("passes a failure that is no error reply through as it is", async () => {
            const outcome = rejectionOf(adapter.commission({ manualPairingCode: "34970112332" }));
            await waitFor(() => server.requests.length === 1, "commission request");
            server.dropClients();

            expect(await outcome).instanceOf(ClosedError);
        });

        it("refuses a concatenated QR code before any command is sent", async () => {
            const error = await rejectionOf(
                adapter.commission({ qrPairingCode: "MT:Y.K90AFN00KA0648G00*Y.K90AFN00KA0648G00" }),
            );

            expect(error).instanceOf(ImplementationError);
            expect(server.requests).deep.equals([]);
        });
    });

    describe("onboarding payload parsing", () => {
        /** The `parse_onboarding_payload` result matterjs-server builds from the matter.js codec for `code`. */
        function serverParseOf(code: string): FakeServerReply {
            if (code.startsWith("MT:")) {
                return {
                    result: {
                        type: "qr",
                        payloads: QrPairingCodeCodec.decode(code).map(payload => ({
                            version: payload.version,
                            vendor_id: payload.vendorId,
                            product_id: payload.productId,
                            flow_type: payload.flowType,
                            discovery_capabilities: payload.discoveryCapabilities,
                            discriminator: payload.discriminator,
                            setup_pin_code: payload.passcode,
                        })),
                    },
                };
            }
            const { shortDiscriminator, passcode, vendorId, productId } = ManualPairingCodeCodec.decode(code);
            return {
                result: {
                    type: "manual",
                    short_discriminator: shortDiscriminator,
                    setup_pin_code: passcode,
                    vendor_id: vendorId,
                    product_id: productId,
                },
            };
        }

        const QR_CODES = [
            "MT:Y.K90AFN00KA0648G00",
            QrPairingCodeCodec.encode([
                {
                    version: 0,
                    flowType: CommissioningFlowType.UserIntent,
                    discoveryCapabilities: DiscoveryCapabilitiesSchema.encode({ onIpNetwork: true }),
                    discriminator: 0xabc,
                    passcode: 20202021,
                },
            ]),
            QrPairingCodeCodec.encode([
                {
                    version: 0,
                    vendorId: 0xfff1,
                    productId: 0x8001,
                    flowType: CommissioningFlowType.Standard,
                    discoveryCapabilities: DiscoveryCapabilitiesSchema.encode({ ble: true, onIpNetwork: true }),
                    discriminator: 3840,
                    passcode: 34567890,
                    tlvData: Bytes.fromHex("152c000a73657269616c2d313218"),
                },
            ]),
        ];

        const MANUAL_CODES = [
            "34970112332",
            ManualPairingCodeCodec.encode({
                discriminator: 3840,
                passcode: 20202021,
                vendorId: VendorId(0xfff1),
                productId: 0x8000,
            }),
        ];

        it("reports each field of a QR code as the in-process adapter does, through parse_onboarding_payload", async () => {
            const inProcess = new InProcessControllerAdapter("parse-reference");
            try {
                for (const code of QR_CODES) {
                    replies.parse_onboarding_payload = serverParseOf(code);
                    expect(await adapter.parseQrPayload(code), code).deep.equals(await inProcess.parseQrPayload(code));
                }
            } finally {
                await inProcess.close();
            }
            expect(sent()).deep.equals(QR_CODES.map(code => ({ command: "parse_onboarding_payload", args: { code } })));
        });

        it("reports each field of a manual pairing code as the in-process adapter does", async () => {
            const inProcess = new InProcessControllerAdapter("parse-reference");
            try {
                for (const code of MANUAL_CODES) {
                    replies.parse_onboarding_payload = serverParseOf(code);
                    expect(await adapter.parseManualPairingCode(code), code).deep.equals(
                        await inProcess.parseManualPairingCode(code),
                    );
                }
            } finally {
                await inProcess.close();
            }
        });

        it("reports a vendor and product the server left out as absent, and the ones it sent as given", async () => {
            replies.parse_onboarding_payload = {
                result: {
                    type: "qr",
                    payloads: [
                        {
                            version: 0,
                            flow_type: 2,
                            discovery_capabilities: 4,
                            discriminator: 3840,
                            setup_pin_code: 20202021,
                        },
                    ],
                },
            };
            const qr = await adapter.parseQrPayload("MT:Y.K90AFN00KA0648G00");
            expect(qr).deep.equals({
                version: 0,
                vendorId: undefined,
                productId: undefined,
                flowType: 2,
                discoveryCapabilities: 4,
                discriminator: 3840,
                passcode: 20202021,
            });

            replies.parse_onboarding_payload = {
                result: {
                    type: "manual",
                    short_discriminator: 15,
                    setup_pin_code: 20202021,
                    vendor_id: 0xfff1,
                    product_id: 0x8000,
                },
            };
            expect(await adapter.parseManualPairingCode(MANUAL_CODES[1])).deep.equals({
                shortDiscriminator: 15,
                passcode: 20202021,
                vendorId: 0xfff1,
                productId: 0x8000,
            });
        });

        it("refuses a code the server could not decode as the in-process adapter does", async () => {
            replies.parse_onboarding_payload = {
                errorCode: 8,
                details: "Invalid pairing code: bad checksum",
                failure: { reason: "invalid-payload" },
            };

            const qr = await rejectionOf(adapter.parseQrPayload("MT:Y.K90AFN00KA0648G01"));
            if (!(qr instanceof OnboardingPayloadRefusedError)) {
                expect.fail(`expected an OnboardingPayloadRefusedError, got ${messageOf(qr)}`);
            }
            expect(qr.cause).instanceOf(MatterServerCommandError);
            expect(await rejectionOf(adapter.parseManualPairingCode("34970112333"))).instanceOf(
                OnboardingPayloadRefusedError,
            );
        });

        it("surfaces a refusal without the invalid-payload reason as a command failure, not as a refused code", async () => {
            for (const failure of [undefined, { reason: "other" }]) {
                replies.parse_onboarding_payload = { errorCode: 8, details: "requires code as a string", failure };

                const error = await rejectionOf(adapter.parseQrPayload("MT:Y.K90AFN00KA0648G00"));
                expect(error, JSON.stringify(failure)).instanceOf(MatterServerCommandError);
                expect(error, JSON.stringify(failure)).not.instanceOf(OnboardingPayloadRefusedError);
            }
        });

        it("refuses a code the server read as the other code form, as the in-process codec of the asked form does", async () => {
            replies.parse_onboarding_payload = serverParseOf("34970112332");
            expect(await rejectionOf(adapter.parseQrPayload("34970112332"))).instanceOf(OnboardingPayloadRefusedError);

            replies.parse_onboarding_payload = serverParseOf("MT:Y.K90AFN00KA0648G00");
            expect(await rejectionOf(adapter.parseManualPairingCode("MT:Y.K90AFN00KA0648G00"))).instanceOf(
                OnboardingPayloadRefusedError,
            );
        });

        it("refuses a concatenated QR code before any command is sent, as the in-process adapter does", async () => {
            const error = await rejectionOf(adapter.parseQrPayload("MT:Y.K90AFN00KA0648G00*Y.K90AFN00KA0648G00"));

            expect(error).instanceOf(ImplementationError);
            expect(server.requests).deep.equals([]);
        });

        it("fails a parse result that does not have the documented shape", async () => {
            const payload = {
                version: 0,
                flow_type: 0,
                discovery_capabilities: 4,
                discriminator: 3840,
                setup_pin_code: 20202021,
            };
            for (const result of [
                null,
                { type: "bar" },
                { type: "qr" },
                { type: "qr", payloads: [] },
                { type: "qr", payloads: [payload, payload] },
                { type: "qr", payloads: ["x"] },
                { type: "qr", payloads: [{ ...payload, setup_pin_code: undefined }] },
                { type: "qr", payloads: [{ ...payload, discriminator: "3840" }] },
                { type: "qr", payloads: [{ ...payload, discriminator: 38.5 }] },
                { type: "qr", payloads: [{ ...payload, vendor_id: 0 }] },
                { type: "qr", payloads: [{ ...payload, product_id: null }] },
            ]) {
                replies.parse_onboarding_payload = { result };
                expect(await rejectionOf(adapter.parseQrPayload("MT:Y.K90AFN00KA0648G00")), show(result)).instanceOf(
                    UnexpectedDataError,
                );
            }

            for (const result of [
                { type: "manual", setup_pin_code: 20202021 },
                { type: "manual", short_discriminator: 15, setup_pin_code: "20202021" },
                { type: "manual", short_discriminator: 15, setup_pin_code: 20202021, vendor_id: 0, product_id: 0 },
            ]) {
                replies.parse_onboarding_payload = { result };
                expect(await rejectionOf(adapter.parseManualPairingCode("34970112332")), show(result)).instanceOf(
                    UnexpectedDataError,
                );
            }
        });
    });

    function readReply(attributes: object, extra: object = {}): FakeServerReply {
        return { result: { attributes, events: [], ...extra } };
    }

    describe("readAttribute", () => {
        it("reads a concrete path with read, fabric filtered by default", async () => {
            replies.read = readReply({ "1/6/0": true });

            expect(await node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 })).equals(true);
            expect(sent()).deep.equals([
                { command: "read", args: { node_id: 5, attribute_paths: ["1/6/0"], fabric_filtered: true } },
            ]);
        });

        it("passes fabricFiltered false through", async () => {
            replies.read = readReply({ "1/6/0": true });

            await node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }, { fabricFiltered: false });
            expect(sent()).deep.equals([
                { command: "read", args: { node_id: 5, attribute_paths: ["1/6/0"], fabric_filtered: false } },
            ]);
        });

        it("reads a wildcard path into entries without a data version, leaving its statuses out", async () => {
            replies.read = readReply(
                { "1/6/0": true, "1/6/16384": false },
                { attribute_status: { "1/6/16385": { status: 0x86 } } },
            );

            expect(await node().readAttribute({ endpoint: 1, cluster: ON_OFF })).deep.equals([
                { endpoint: 1, cluster: ON_OFF, attribute: 0, value: true },
                { endpoint: 1, cluster: ON_OFF, attribute: 0x4000, value: false },
            ]);
            expect(sent()).deep.equals([
                { command: "read", args: { node_id: 5, attribute_paths: ["1/6/*"], fabric_filtered: true } },
            ]);
        });

        it("fails a concrete path with the status and cluster status the device answered", async () => {
            replies.read = readReply({}, { attribute_status: { "1/6/0": { status: 0x86, cluster_status: 3 } } });

            const error = await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }));
            if (!(error instanceof StatusResponseError)) {
                expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
            }
            expect(error.code).equals(0x86);
            expect(error.clusterCode).equals(3);
        });

        it("fails a concrete path the result has neither a value nor a status for", async () => {
            replies.read = readReply({ "1/6/16384": false });

            const error = await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }));
            expect(error).instanceOf(MatterServerReadError);
            expect(messageOf(error)).contains("1/6/0");
        });

        it("answers a concrete path only with the value of that endpoint and cluster", async () => {
            for (const [other, value] of [
                ["0/6/0", true],
                ["1/8/0", 3],
            ] as const) {
                replies.read = readReply({ [other]: value });
                const error = await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }));
                expect(error, other).instanceOf(MatterServerReadError);
            }
        });

        it("fails a concrete path whose value does not decode", async () => {
            replies.read = readReply({ "1/6/0": "yes" });

            const error = await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }));
            expect(error).instanceOf(MatterServerWireError);
            expect(messageOf(error)).contains("1/6/0");
        });

        it("fails a wildcard read when one of its values does not decode", async () => {
            replies.read = readReply({ "1/6/0": true, "1/6/16384": "no" });

            const error = await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF }));
            expect(error).instanceOf(MatterServerWireError);
            expect(messageOf(error)).contains("1/6/16384");
        });

        it("fails a result that does not have the documented shape", async () => {
            replies.read = { result: { "1/6/0": true } };

            expect(await rejectionOf(node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }))).instanceOf(
                UnexpectedDataError,
            );
        });

        it("refuses largeMessage before any command is sent, for the reason it declares", async () => {
            const error = await rejectionOf(
                node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 }, { largeMessage: true }),
            );

            expectDeclaredRefusal(error, "tcp-transport");
            expect(server.requests).deep.equals([]);
        });

        it("reads a wildcard path reporting an attribute outside its model", async () => {
            replies.read = readReply({ "1/6/0": true, [`1/${UNMODELED}/0`]: { "1": 5 } });

            expect(await node().readAttribute({ endpoint: 1 })).deep.equals([
                { endpoint: 1, cluster: ON_OFF, attribute: 0, value: true },
                { endpoint: 1, cluster: UNMODELED, attribute: 0, value: { "1": 5 } },
            ]);
        });

        it("reads a concrete attribute outside its model", async () => {
            replies.read = readReply({ "1/6/61440": 3 });

            expect(await node().readAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 61440 })).equals(3);
        });

        it("refuses a concrete id the server reads as a wildcard before any command is sent", async () => {
            for (const path of [
                { endpoint: 0xffff, cluster: ON_OFF, attribute: 0 },
                { endpoint: 1, cluster: 0xffffffff, attribute: 0 },
                { endpoint: 1, cluster: ON_OFF, attribute: 0xffffffff },
            ]) {
                expectDeclaredRefusal(await rejectionOf(node().readAttribute(path)), "max-value-path-ids");
            }
            expect(server.requests).deep.equals([]);
        });
    });

    describe("readAttributes", () => {
        it("reads every path in one read", async () => {
            replies.read = readReply({ "1/6/0": true, "0/40/5": "kitchen" });

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
                { command: "read", args: { node_id: 5, attribute_paths: ["1/6/0", "0/40/5"], fabric_filtered: true } },
            ]);
        });

        it("sends more paths than the server's own read batches in the one read it promises", async () => {
            const paths = Array.from({ length: 10 }, (_, attribute) => ({ endpoint: 1, cluster: ON_OFF, attribute }));
            replies.read = readReply(Object.fromEntries(paths.map(({ attribute }) => [`1/6/${attribute}`, false])));

            await node().readAttributes(paths);
            expect(sent()).deep.equals([
                {
                    command: "read",
                    args: {
                        node_id: 5,
                        attribute_paths: paths.map(({ attribute }) => `1/6/${attribute}`),
                        fabric_filtered: true,
                    },
                },
            ]);
        });

        it("fails a concrete path the device answered with a status, and drops a wildcard path's statuses", async () => {
            replies.read = readReply(
                { "1/6/0": true },
                { attribute_status: { "1/6/16384": { status: 0x86 }, "0/40/5": { status: 0x7e } } },
            );

            const error = await rejectionOf(
                node().readAttributes([
                    { endpoint: 1, cluster: ON_OFF },
                    { endpoint: 0, cluster: 0x28, attribute: 5 },
                ]),
            );
            if (!(error instanceof StatusResponseError)) {
                expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
            }
            expect(error.code).equals(0x7e);
            expect(messageOf(error)).contains("0/40/5");

            replies.read = readReply({ "1/6/0": true }, { attribute_status: { "1/6/16384": { status: 0x86 } } });
            expect(await node().readAttributes([{ endpoint: 1, cluster: ON_OFF }])).deep.equals([
                { endpoint: 1, cluster: ON_OFF, attribute: 0, value: true },
            ]);
        });

        it("fails a concrete path the result has neither a value nor a status for", async () => {
            replies.read = readReply({ "1/6/0": true });

            const error = await rejectionOf(
                node().readAttributes([
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    { endpoint: 1, cluster: ON_OFF, attribute: ON_TIME },
                ]),
            );
            expect(error).instanceOf(MatterServerReadError);
            expect(messageOf(error)).contains("1/6/16385");
        });

        it("answers a string outside the model as the text the server sent", async () => {
            replies.read = readReply({ [`1/${UNMODELED}/25`]: "AQI=" });

            expect(await node().readAttributes([{ endpoint: 1, cluster: UNMODELED }])).deep.equals([
                { endpoint: 1, cluster: UNMODELED, attribute: 25, value: "AQI=" },
            ]);
        });

        it("decodes the UnitTesting attributes the server models by their model", async () => {
            replies.read = readReply({
                [`1/${UNIT_TESTING}/${UNIT_TESTING_OCTET_STRING}`]: "AQI=",
                [`1/${UNIT_TESTING}/${UNIT_TESTING_STRUCT}`]: {
                    "0": 7,
                    "1": true,
                    "2": 2,
                    "3": "3q0=",
                    "4": "",
                    "5": 5,
                    "6": 1.5,
                    "7": -0.25,
                },
            });

            expect(await node().readAttributes([{ endpoint: 1, cluster: UNIT_TESTING }])).deep.equals([
                {
                    endpoint: 1,
                    cluster: UNIT_TESTING,
                    attribute: UNIT_TESTING_OCTET_STRING,
                    value: Bytes.fromHex("0102"),
                },
                {
                    endpoint: 1,
                    cluster: UNIT_TESTING,
                    attribute: UNIT_TESTING_STRUCT,
                    value: { a: 7, b: true, c: 2, d: Bytes.fromHex("dead"), e: "", f: 5, g: 1.5, h: -0.25 },
                },
            ]);
        });

        it("fails a path whose value does not decode", async () => {
            replies.read = readReply({ "1/6/0": true, "1/6/16384": 3 });

            const error = await rejectionOf(node().readAttributes([{ endpoint: 1, cluster: ON_OFF }]));
            expect(error).instanceOf(MatterServerWireError);
        });

        it("gives each entry the data version of its own endpoint and cluster", async () => {
            replies.read = readReply(
                { "0/40/5": "kitchen", "1/8/16": 3, "2/8/16": 4 },
                { data_versions: { "0/40": 7, "1/8": 0xffffffff, "2/8": 0 } },
            );

            expect(
                await node().readAttributes(
                    [
                        { endpoint: 0, cluster: 0x28, attribute: 5 },
                        { cluster: 8, attribute: 16 },
                    ],
                    { dataVersions: true },
                ),
            ).deep.equals([
                { endpoint: 0, cluster: 0x28, attribute: 5, value: "kitchen", version: 7 },
                { endpoint: 1, cluster: 8, attribute: 16, value: 3, version: 0xffffffff },
                { endpoint: 2, cluster: 8, attribute: 16, value: 4, version: 0 },
            ]);
            expect(sent()).deep.equals([
                {
                    command: "read",
                    args: { node_id: 5, attribute_paths: ["0/40/5", "*/8/16"], fabric_filtered: true },
                },
            ]);
        });

        it("gives a wildcard readAttribute the data versions it was asked for, and fails where one is missing", async () => {
            const path = { cluster: 8, attribute: 16 };
            replies.read = readReply({ "1/8/16": 3, "2/8/16": 4 }, { data_versions: { "1/8": 9, "2/8": 10 } });

            expect(await node().readAttribute(path, { dataVersions: true })).deep.equals([
                { endpoint: 1, cluster: 8, attribute: 16, value: 3, version: 9 },
                { endpoint: 2, cluster: 8, attribute: 16, value: 4, version: 10 },
            ]);

            replies.read = readReply({ "1/8/16": 3 });
            expect(await rejectionOf(node().readAttribute(path, { dataVersions: true }))).instanceOf(
                MatterServerReadError,
            );
        });

        it("reports no version where the result carries none, and fails a read asking for versions on it", async () => {
            replies.read = readReply({ "1/6/0": true, "0/40/5": "kitchen" }, { data_versions: { "0/40": 7 } });
            const paths = [
                { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                { endpoint: 0, cluster: 0x28, attribute: 5 },
            ];

            expect(await node().readAttributes(paths)).deep.equals([
                { endpoint: 1, cluster: ON_OFF, attribute: 0, value: true },
                { endpoint: 0, cluster: 0x28, attribute: 5, value: "kitchen", version: 7 },
            ]);

            const error = await rejectionOf(node().readAttributes(paths, { dataVersions: true }));
            expect(error).instanceOf(MatterServerReadError);
            expect(messageOf(error)).contains("1/6/0");

            replies.read = readReply({ "1/6/0": true });
            expect(await rejectionOf(node().readAttributes(paths.slice(0, 1), { dataVersions: true }))).instanceOf(
                MatterServerReadError,
            );
        });

        it("fails a result with a malformed data version", async () => {
            replies.read = readReply({ "1/6/0": true }, { data_versions: { "1/6/0": 7 } });

            expect(
                await rejectionOf(node().readAttributes([{ endpoint: 1, cluster: ON_OFF, attribute: 0 }])),
            ).instanceOf(UnexpectedDataError);
        });
    });

    describe("subscriptions", () => {
        const SUBSCRIPTION = 0xaabbccdd;

        /** Answers `subscribe` with `id` and the priming report `priming`, as the server does. */
        function primeWith(priming: object, id = SUBSCRIPTION) {
            server.reply = request => {
                if (request.command === "subscribe") {
                    return { result: { subscription_id: id, attributes: {}, events: [], ...priming } };
                }
                return replies[request.command];
            };
        }

        function report(data: object, id = SUBSCRIPTION) {
            server.pushEvent("subscription_report", {
                node_id: 5,
                subscription_id: id,
                attributes: {},
                events: [],
                ...data,
            });
        }

        function event(eventNumber: number, softwareVersion: number) {
            return {
                node_id: 5,
                endpoint_id: 0,
                cluster_id: 0x28,
                event_id: 0,
                event_number: eventNumber,
                priority: 2,
                timestamp: 0,
                timestamp_type: 0,
                data: { softwareVersion },
            };
        }

        const unsubscribes = () => sent().filter(({ command }) => command === "unsubscribe");

        beforeEach(() => {
            replies.unsubscribe = { result: null };
        });

        describe("a node id the server refuses to address", () => {
            const refused = { errorCode: 8, details: "node_id cannot name one node" };

            it("surfaces the refusal of subscribe as a command failure, with nothing left to end", async () => {
                replies.subscribe = refused;

                const error = await rejectionOf(
                    node().subscribe(
                        { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                        { minIntervalFloorSeconds: 1, maxIntervalCeilingSeconds: 30 },
                    ),
                );

                if (!(error instanceof MatterServerCommandError)) {
                    expect.fail(`expected a MatterServerCommandError, got ${messageOf(error)}`);
                }
                expect(error).not.instanceOf(ControllerCommandError);
                expect(error.errorCode).equals(8);
                expect(unsubscribes()).deep.equals([]);
            });
        });

        describe("subscribe", () => {
            it("subscribes with subscribe, keeping other subscriptions, and resolves with the priming value", async () => {
                primeWith({ attributes: { "1/6/0": true } });

                expect(
                    await node().subscribe(
                        { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                        { minIntervalFloorSeconds: 1, maxIntervalCeilingSeconds: 30 },
                    ),
                ).equals(true);
                expect(sent()).deep.equals([
                    {
                        command: "subscribe",
                        args: {
                            node_id: 5,
                            attribute_paths: ["1/6/0"],
                            fabric_filtered: true,
                            min_interval: 1,
                            max_interval: 30,
                            keep_subscriptions: true,
                        },
                    },
                ]);
            });

            it("resolves a wildcard path with the priming entries and their data versions, dropping statuses", async () => {
                primeWith({
                    attributes: { "1/6/0": true, "1/6/16385": 0 },
                    attribute_status: { "1/6/16384": { status: 0x86 } },
                    data_versions: { "1/6": 42 },
                });
                const updates = new Array<unknown>();
                const ended = new Array<Error>();

                expect(
                    await node().subscribe(
                        { endpoint: 1, cluster: ON_OFF },
                        {
                            minIntervalFloorSeconds: 0,
                            maxIntervalCeilingSeconds: 10,
                            onUpdate: value => updates.push(value),
                            onEnded: cause => ended.push(cause),
                        },
                    ),
                ).deep.equals([
                    { endpoint: 1, cluster: ON_OFF, attribute: 0, value: true, version: 42 },
                    { endpoint: 1, cluster: ON_OFF, attribute: ON_TIME, value: 0, version: 42 },
                ]);
                expect(sent()).deep.equals([
                    {
                        command: "subscribe",
                        args: {
                            node_id: 5,
                            attribute_paths: ["1/6/*"],
                            fabric_filtered: true,
                            min_interval: 0,
                            max_interval: 10,
                            keep_subscriptions: true,
                        },
                    },
                ]);

                report({ attributes: { "1/6/0": false }, attribute_status: { "1/6/16384": { status: 0x86 } } });
                await waitFor(() => updates.length === 1, "one update");
                expect(updates).deep.equals([false]);
                expect(ended).deep.equals([]);
            });

            it("delivers each value of a later report to onUpdate and ignores reports of other subscriptions", async () => {
                primeWith({ attributes: { "1/6/0": true } });
                const updates = new Array<unknown>();

                await node().subscribe(
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    {
                        minIntervalFloorSeconds: 0,
                        maxIntervalCeilingSeconds: 10,
                        onUpdate: value => updates.push(value),
                    },
                );
                report({ attributes: { "1/6/0": true } }, SUBSCRIPTION + 1);
                report({ attributes: { "1/6/0": false } });
                report({ attributes: { "1/6/0": true } });

                await waitFor(() => updates.length === 2, "two updates");
                expect(updates).deep.equals([false, true]);
            });

            /** Subscribes to OnOff.onOff, primed with `true`, recording what reaches the step. */
            async function subscribeOnOff(onUpdate?: (value: unknown) => void) {
                primeWith({ attributes: { "1/6/0": true } });
                const updates = new Array<unknown>();
                const ended = new Array<Error>();
                await node().subscribe(
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    {
                        minIntervalFloorSeconds: 0,
                        maxIntervalCeilingSeconds: 10,
                        onUpdate: value => {
                            updates.push(value);
                            onUpdate?.(value);
                        },
                        onEnded: cause => ended.push(cause),
                    },
                );
                return { updates, ended };
            }

            it("ends the subscription with a later value that does not decode, and tells onEnded why", async () => {
                const { updates, ended } = await subscribeOnOff();

                report({ attributes: { "1/6/0": "no" } });
                report({ attributes: { "1/6/0": false } });
                await waitFor(() => ended.length === 1, "the end");

                expect(ended[0]).instanceOf(MatterServerWireError);
                expect(updates).deep.equals([]);
                await waitFor(() => unsubscribes().length === 1, "unsubscribe");
                expect(unsubscribes()).deep.equals([
                    { command: "unsubscribe", args: { node_id: 5, subscription_id: SUBSCRIPTION } },
                ]);
            });

            it("ends the subscription with a later status for the subscribed path, and tells onEnded the status", async () => {
                const { updates, ended } = await subscribeOnOff();

                report({ attribute_status: { "1/6/0": { status: 0x7e } } });
                await waitFor(() => ended.length === 1, "the end");

                if (!(ended[0] instanceof StatusResponseError)) {
                    expect.fail(`expected a StatusResponseError, got ${messageOf(ended[0])}`);
                }
                expect(ended[0].code).equals(0x7e);
                expect(updates).deep.equals([]);
                await waitFor(() => unsubscribes().length === 1, "unsubscribe");
            });

            it("ends the subscription when onUpdate throws, and tells onEnded the error", async () => {
                class ListenerBug extends ImplementationError {}
                const { updates, ended } = await subscribeOnOff(() => {
                    throw new ListenerBug("step bug");
                });

                report({ attributes: { "1/6/0": false } });
                report({ attributes: { "1/6/0": true } });
                await waitFor(() => ended.length === 1, "the end");

                expect(ended[0]).instanceOf(ListenerBug);
                expect(updates).deep.equals([false]);
                await waitFor(() => unsubscribes().length === 1, "unsubscribe");
            });

            it("fails a concrete path the device answered with a status and ends the subscription", async () => {
                primeWith({ attribute_status: { "1/6/0": { status: 0x86 } } });
                const updates = new Array<unknown>();

                const error = await rejectionOf(
                    node().subscribe(
                        { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                        {
                            minIntervalFloorSeconds: 0,
                            maxIntervalCeilingSeconds: 10,
                            onUpdate: value => updates.push(value),
                        },
                    ),
                );
                if (!(error instanceof StatusResponseError)) {
                    expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
                }
                expect(error.code).equals(0x86);
                expect(unsubscribes()).deep.equals([
                    { command: "unsubscribe", args: { node_id: 5, subscription_id: SUBSCRIPTION } },
                ]);

                report({ attributes: { "1/6/0": true } });
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(updates).deep.equals([]);
            });

            it("fails a concrete path its priming report left out, and ends the subscription", async () => {
                primeWith({ attributes: { "1/6/16384": false } });

                const error = await rejectionOf(
                    node().subscribe(
                        { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                        { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 },
                    ),
                );
                expect(error).instanceOf(MatterServerReadError);
                expect(messageOf(error)).contains("1/6/0");
                expect(unsubscribes()).deep.equals([
                    { command: "unsubscribe", args: { node_id: 5, subscription_id: SUBSCRIPTION } },
                ]);
            });

            it("delivers a value of an attribute outside the model as well", async () => {
                primeWith({ attributes: { "1/6/61440": { "0": 2 } } });
                const updates = new Array<unknown>();

                expect(
                    await node().subscribe(
                        { endpoint: 1, cluster: ON_OFF, attribute: 61440 },
                        {
                            minIntervalFloorSeconds: 0,
                            maxIntervalCeilingSeconds: 10,
                            onUpdate: value => updates.push(value),
                        },
                    ),
                ).deep.equals({ "0": 2 });
                report({ attributes: { "1/6/61440": { "0": 3 } } });

                await waitFor(() => updates.length === 1, "one update");
                expect(updates).deep.equals([{ "0": 3 }]);
            });

            it("fails a subscribe still waiting for its response when the adapter closes", async () => {
                server.reply = request => replies[request.command];
                const outcome = rejectionOf(
                    node().subscribe(
                        { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                        { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 },
                    ),
                );
                await waitFor(() => server.requests.length === 1, "subscribe request");

                await adapter.close();
                expect(await outcome).instanceOf(ClosedError);
                expect(unsubscribes()).deep.equals([]);
            });

            it("tells onEnded once the server ends the subscription, delivers nothing after, and does not unsubscribe it on close", async () => {
                primeWith({ attributes: { "1/6/0": true } });
                const updates = new Array<unknown>();
                const ended = new Array<Error>();

                await node().subscribe(
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    {
                        minIntervalFloorSeconds: 0,
                        maxIntervalCeilingSeconds: 10,
                        onUpdate: value => updates.push(value),
                        onEnded: cause => ended.push(cause),
                    },
                );
                server.pushEvent("subscription_ended", { node_id: 5, subscription_id: SUBSCRIPTION });
                report({ attributes: { "1/6/0": false } });
                await waitFor(() => ended.length === 1, "the end");

                await adapter.close();
                expect(ended[0]).instanceOf(MatterServerSubscriptionEndedError);
                expect(updates).deep.equals([]);
                expect(unsubscribes()).deep.equals([]);
            });

            it("ends every subscription still open when the adapter closes", async () => {
                primeWith({ attributes: { "1/6/0": true } });
                await node().subscribe(
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 },
                );
                primeWith({ attributes: { "1/6/0": true } }, SUBSCRIPTION + 1);
                await node().subscribe(
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 },
                );

                await adapter.close();
                expect(unsubscribes()).deep.equals([
                    { command: "unsubscribe", args: { node_id: 5, subscription_id: SUBSCRIPTION } },
                    { command: "unsubscribe", args: { node_id: 5, subscription_id: SUBSCRIPTION + 1 } },
                ]);
            });

            it("closes the connection when ending a subscription fails", async () => {
                primeWith({ attributes: { "1/6/0": true } });
                replies.unsubscribe = { errorCode: 9, details: "No subscription" };
                await node().subscribe(
                    { endpoint: 1, cluster: ON_OFF, attribute: 0 },
                    { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 },
                );

                await adapter.close();
                await waitFor(() => server.connections === 0, "connection closed");
            });

            it("refuses a concrete id the server reads as a wildcard before any command is sent", async () => {
                const error = await rejectionOf(
                    node().subscribe(
                        { endpoint: 0xffff, cluster: ON_OFF, attribute: 0 },
                        { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 },
                    ),
                );
                expectDeclaredRefusal(error, "max-value-path-ids");
                expect(server.requests).deep.equals([]);
            });
        });

        describe("subscribeAttributes", () => {
            const ON_OFF_PATH = { endpoint: 1, cluster: ON_OFF, attribute: 0 };
            const ON_TIME_PATH = { endpoint: 1, cluster: ON_OFF, attribute: ON_TIME };
            const INTERVALS = { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10 };

            it("subscribes to every path in one subscribe and names the attribute of each later value", async () => {
                primeWith({ attributes: { "1/6/0": true, "1/6/16385": 0 }, data_versions: { "1/6": 42 } });
                const updates = new Array<AttributeReadEntry>();

                expect(
                    await node().subscribeAttributes([ON_OFF_PATH, ON_TIME_PATH], {
                        ...INTERVALS,
                        onUpdate: entry => updates.push(entry),
                    }),
                ).deep.equals([
                    { ...ON_OFF_PATH, value: true, version: 42 },
                    { ...ON_TIME_PATH, value: 0, version: 42 },
                ]);
                expect(sent()).deep.equals([
                    {
                        command: "subscribe",
                        args: {
                            node_id: 5,
                            attribute_paths: ["1/6/0", "1/6/16385"],
                            fabric_filtered: true,
                            min_interval: 0,
                            max_interval: 10,
                            keep_subscriptions: true,
                        },
                    },
                ]);

                report({ attributes: { "1/6/16385": 5 } });
                report({ attributes: { "1/6/0": false } });
                await waitFor(() => updates.length === 2, "two updates");
                expect(updates).deep.equals([
                    { ...ON_TIME_PATH, value: 5 },
                    { ...ON_OFF_PATH, value: false },
                ]);
            });

            it("fails when the device answered one concrete path with a status, and ends the subscription", async () => {
                primeWith({ attributes: { "1/6/0": true }, attribute_status: { "1/6/16385": { status: 0x86 } } });

                const error = await rejectionOf(node().subscribeAttributes([ON_OFF_PATH, ON_TIME_PATH], INTERVALS));
                if (!(error instanceof StatusResponseError)) {
                    expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
                }
                expect(error.code).equals(0x86);
                expect(unsubscribes()).deep.equals([
                    { command: "unsubscribe", args: { node_id: 5, subscription_id: SUBSCRIPTION } },
                ]);
            });

            it("drops a wildcard path's statuses", async () => {
                primeWith({ attributes: { "1/6/0": true }, attribute_status: { "1/6/16384": { status: 0x86 } } });

                expect(
                    await node().subscribeAttributes([ON_OFF_PATH, { endpoint: 1, cluster: ON_OFF }], INTERVALS),
                ).deep.equals([{ ...ON_OFF_PATH, value: true }]);
                expect(unsubscribes()).deep.equals([]);
            });

            it("ends the subscription with a later status for one of its concrete paths", async () => {
                primeWith({ attributes: { "1/6/0": true, "1/6/16385": 0 } });
                const ended = new Array<Error>();
                await node().subscribeAttributes([ON_OFF_PATH, ON_TIME_PATH], {
                    ...INTERVALS,
                    onEnded: cause => ended.push(cause),
                });

                report({ attribute_status: { "1/6/16385": { status: 0x7e } } });
                await waitFor(() => ended.length === 1, "the end");
                if (!(ended[0] instanceof StatusResponseError)) {
                    expect.fail(`expected a StatusResponseError, got ${messageOf(ended[0])}`);
                }
                expect(ended[0].code).equals(0x7e);
            });

            it("refuses an empty path list before any command is sent", async () => {
                expect(await rejectionOf(node().subscribeAttributes([], INTERVALS))).instanceOf(ImplementationError);
                expect(server.requests).deep.equals([]);
            });
        });

        describe("readEvents", () => {
            it("reads every path in one read, without an event filter where the step gives none", async () => {
                replies.read = readReply({}, { events: [event(7, 2)] });

                expect(
                    await node().readEvents([{ endpoint: 0, cluster: 0x28, event: 0 }, { cluster: 0x3b }]),
                ).deep.equals([
                    { endpoint: 0, cluster: 0x28, event: 0, eventNumber: 7n, value: { softwareVersion: 2 } },
                ]);
                expect(sent()).deep.equals([
                    {
                        command: "read",
                        args: {
                            node_id: 5,
                            event_paths: [{ path: "0/40/0" }, { path: "*/59/*" }],
                            fabric_filtered: true,
                        },
                    },
                ]);
            });

            it("passes minEventNumber as event_min and fabricFiltered false through", async () => {
                replies.read = readReply({});

                await node().readEvents([{ endpoint: 0 }], { minEventNumber: 2n ** 60n, fabricFiltered: false });
                expect(sent()).deep.equals([
                    {
                        command: "read",
                        args: {
                            node_id: 5,
                            event_paths: [{ path: "0/*/*" }],
                            fabric_filtered: false,
                            event_min: 2n ** 60n,
                        },
                    },
                ]);
            });

            it("fails a concrete path the device answered with a status, and drops a wildcard path's statuses", async () => {
                replies.read = readReply({}, { event_status: { "0/40/0": { status: 0xc7, cluster_status: 1 } } });

                const error = await rejectionOf(node().readEvents([{ endpoint: 0, cluster: 0x28, event: 0 }]));
                if (!(error instanceof StatusResponseError)) {
                    expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
                }
                expect(error.code).equals(0xc7);
                expect(error.clusterCode).equals(1);

                expect(await node().readEvents([{ endpoint: 0, cluster: 0x28 }])).deep.equals([]);
            });

            it("reads the tag-keyed data of an event outside its model", async () => {
                replies.read = readReply({}, { events: [{ ...event(7, 2), cluster_id: UNMODELED, data: { "0": 2 } }] });

                expect(await node().readEvents([{ endpoint: 0 }])).deep.equals([
                    { endpoint: 0, cluster: UNMODELED, event: 0, eventNumber: 7n, value: { "0": 2 } },
                ]);
            });

            it("refuses a concrete event id the server reads as a wildcard before any command is sent", async () => {
                const error = await rejectionOf(node().readEvents([{ endpoint: 0, cluster: 0x28, event: 0xffffffff }]));

                expectDeclaredRefusal(error, "max-value-path-ids");
                expect(server.requests).deep.equals([]);
            });
        });

        describe("subscribeEvents", () => {
            it("subscribes with subscribe, marking each path urgent where asked, and resolves with the priming events", async () => {
                primeWith({ events: [event(7, 2)] });

                expect(
                    await node().subscribeEvents([{ endpoint: 0, cluster: 0x28, event: 0 }, { endpoint: 1 }], {
                        minIntervalFloorSeconds: 0,
                        maxIntervalCeilingSeconds: 30,
                        urgent: true,
                        minEventNumber: 5n,
                    }),
                ).deep.equals([
                    { endpoint: 0, cluster: 0x28, event: 0, eventNumber: 7n, value: { softwareVersion: 2 } },
                ]);
                expect(sent()).deep.equals([
                    {
                        command: "subscribe",
                        args: {
                            node_id: 5,
                            event_paths: [
                                { path: "0/40/0", is_urgent: true },
                                { path: "1/*/*", is_urgent: true },
                            ],
                            fabric_filtered: true,
                            event_min: 5,
                            min_interval: 0,
                            max_interval: 30,
                            keep_subscriptions: true,
                        },
                    },
                ]);
            });

            it("leaves IsUrgent out where the step does not ask for it", async () => {
                primeWith({});

                await node().subscribeEvents([{ endpoint: 0 }], {
                    minIntervalFloorSeconds: 0,
                    maxIntervalCeilingSeconds: 30,
                });
                expect(server.requests[0].args).deep.include({ event_paths: [{ path: "0/*/*" }] });
            });

            it("delivers each later event to onUpdate in report order", async () => {
                primeWith({});
                const updates = new Array<unknown>();

                await node().subscribeEvents([{ endpoint: 0 }], {
                    minIntervalFloorSeconds: 0,
                    maxIntervalCeilingSeconds: 30,
                    onUpdate: entry => updates.push(entry),
                });
                report({ events: [event(8, 3), event(9, 4)] });

                await waitFor(() => updates.length === 2, "two events");
                expect(updates).deep.equals([
                    { endpoint: 0, cluster: 0x28, event: 0, eventNumber: 8n, value: { softwareVersion: 3 } },
                    { endpoint: 0, cluster: 0x28, event: 0, eventNumber: 9n, value: { softwareVersion: 4 } },
                ]);
            });

            it("tells onEnded once the server ends the subscription", async () => {
                primeWith({});
                const ended = new Array<Error>();

                await node().subscribeEvents([{ endpoint: 0 }], {
                    minIntervalFloorSeconds: 0,
                    maxIntervalCeilingSeconds: 30,
                    onEnded: cause => ended.push(cause),
                });
                server.pushEvent("subscription_ended", { node_id: 5, subscription_id: SUBSCRIPTION });

                await waitFor(() => ended.length === 1, "the end");
                expect(ended[0]).instanceOf(MatterServerSubscriptionEndedError);
            });

            it("ends the subscription with a later status for a concrete path, and tells onEnded the status", async () => {
                primeWith({});
                const updates = new Array<unknown>();
                const ended = new Array<Error>();

                await node().subscribeEvents([{ endpoint: 0, cluster: 0x28, event: 0 }], {
                    minIntervalFloorSeconds: 0,
                    maxIntervalCeilingSeconds: 30,
                    onUpdate: entry => updates.push(entry),
                    onEnded: cause => ended.push(cause),
                });
                report({ events: [event(8, 3)], event_status: { "0/40/0": { status: 0xc3 } } });

                await waitFor(() => ended.length === 1, "the end");
                expect(ended[0]).instanceOf(StatusResponseError);
                expect(updates).deep.equals([]);
                await waitFor(() => unsubscribes().length === 1, "unsubscribe");
            });

            it("fails a concrete path the device answered with a status, ends the subscription and reports nothing", async () => {
                primeWith({ event_status: { "0/40/0": { status: 0xc3 } } });
                const updates = new Array<unknown>();

                const error = await rejectionOf(
                    node().subscribeEvents([{ endpoint: 0, cluster: 0x28, event: 0 }], {
                        minIntervalFloorSeconds: 0,
                        maxIntervalCeilingSeconds: 30,
                        onUpdate: entry => updates.push(entry),
                    }),
                );
                expect(error).instanceOf(StatusResponseError);
                expect(unsubscribes()).deep.equals([
                    { command: "unsubscribe", args: { node_id: 5, subscription_id: SUBSCRIPTION } },
                ]);

                report({ events: [event(8, 3)] });
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(updates).deep.equals([]);
            });
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

        it("fails with the cluster status the device sent beside the status", async () => {
            replies.write_attribute = {
                result: [
                    {
                        Path: { EndpointId: 1, ClusterId: ON_OFF, AttributeId: ON_TIME },
                        Status: 0x01,
                        ClusterStatus: 0x02,
                    },
                ],
            };

            const error = await rejectionOf(
                node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2),
            );
            if (!(error instanceof StatusResponseError)) {
                expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
            }
            expect(error.code).equals(0x01);
            expect(error.clusterCode).equals(0x02);
        });

        it("fails with the status the device answered where the server reports it in the error", async () => {
            replies.write_attribute = {
                errorCode: 1,
                details: "write failed",
                failure: { status: 0x88, cluster_status: 4 },
            };

            const error = await rejectionOf(
                node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2),
            );
            if (!(error instanceof StatusResponseError)) {
                expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
            }
            expect(error.code).equals(0x88);
            expect(error.clusterCode).equals(4);
        });

        it("passes a timed request through", async () => {
            replies.write_attribute = {
                result: [{ Path: { EndpointId: 1, ClusterId: ON_OFF, AttributeId: ON_TIME }, Status: 0 }],
            };

            await node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2, {
                timedInteractionTimeoutMs: 500,
            });
            expect(sent()).deep.equals([
                {
                    command: "write_attribute",
                    args: { node_id: 5, attribute_path: "1/6/16385", value: 2, timed_request_timeout_ms: 500 },
                },
            ]);
        });

        it("refuses a zero timed-request timeout on a write before any command is sent", async () => {
            const error = await rejectionOf(
                node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2, {
                    timedInteractionTimeoutMs: 0,
                }),
            );

            expect(error).instanceOf(ImplementationError);
            expect(sent()).deep.equals([]);
        });

        it("fails an answer for another path than the one written", async () => {
            replies.write_attribute = {
                result: [{ Path: { EndpointId: 2, ClusterId: ON_OFF, AttributeId: ON_TIME }, Status: 0 }],
            };

            expect(
                await rejectionOf(node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2)),
            ).instanceOf(UnexpectedDataError);
        });

        it("fails an answer with more than one status for a concrete endpoint", async () => {
            const status = { Path: { EndpointId: 1, ClusterId: ON_OFF, AttributeId: ON_TIME }, Status: 0 };
            replies.write_attribute = { result: [status, status] };

            expect(
                await rejectionOf(node().writeAttribute({ endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, 2)),
            ).instanceOf(UnexpectedDataError);
        });

        it("writes a UnitTesting attribute the server models, struct fields by tag and bytes as base64", async () => {
            const path = `1/${UNIT_TESTING}/${UNIT_TESTING_STRUCT}`;
            replies.write_attribute = {
                result: [
                    { Path: { EndpointId: 1, ClusterId: UNIT_TESTING, AttributeId: UNIT_TESTING_STRUCT }, Status: 0 },
                ],
            };

            await node().writeAttribute(
                { endpoint: 1, cluster: UNIT_TESTING, attribute: UNIT_TESTING_STRUCT },
                { a: 7, b: true, c: 2, d: Bytes.fromHex("dead"), e: "", f: 5, g: 1.5, h: -0.25 },
            );
            expect(sent()).deep.equals([
                {
                    command: "write_attribute",
                    args: {
                        node_id: 5,
                        attribute_path: path,
                        value: { "0": 7, "1": true, "2": 2, "3": "3q0=", "4": "", "5": 5, "6": 1.5, "7": -0.25 },
                    },
                },
            ]);
        });

        it("refuses an attribute the server's model does not know before any command is sent", async () => {
            for (const path of [
                { endpoint: 1, cluster: ON_OFF, attribute: 0xf000 },
                { endpoint: 1, cluster: UNIT_TESTING, attribute: 0 },
                { endpoint: 1, cluster: UNMODELED, attribute: 0 },
            ]) {
                expectDeclaredRefusal(await rejectionOf(node().writeAttribute(path, 1)), "unmodeled-requests");
            }
            expect(server.requests).deep.equals([]);
        });
    });

    describe("writeAttributes", () => {
        it("writes a wildcard endpoint with one write_attribute and reports every endpoint the device answered for", async () => {
            replies.write_attribute = {
                result: [
                    { Path: { EndpointId: 0, ClusterId: ON_OFF, AttributeId: ON_TIME }, Status: 0 },
                    { Path: { EndpointId: 1, ClusterId: ON_OFF, AttributeId: ON_TIME }, Status: 0x88 },
                ],
            };

            expect(
                await node().writeAttributes([{ path: { cluster: ON_OFF, attribute: ON_TIME }, value: 2 }]),
            ).deep.equals([
                { endpoint: 0, cluster: ON_OFF, attribute: ON_TIME, status: 0 },
                { endpoint: 1, cluster: ON_OFF, attribute: ON_TIME, status: 0x88 },
            ]);
            expect(sent()).deep.equals([
                { command: "write_attribute", args: { node_id: 5, attribute_path: "*/6/16385", value: 2 } },
            ]);
        });

        it("reports no status where a wildcard endpoint reached no endpoint", async () => {
            replies.write_attribute = { result: [] };

            expect(
                await node().writeAttributes([{ path: { cluster: ON_OFF, attribute: ON_TIME }, value: 2 }]),
            ).deep.equals([]);
        });

        it("fails an answer for another attribute than the one written", async () => {
            for (const Path of [
                { EndpointId: 1, ClusterId: ON_OFF, AttributeId: 0 },
                { EndpointId: 1, ClusterId: 8, AttributeId: ON_TIME },
            ]) {
                replies.write_attribute = { result: [{ Path, Status: 0 }] };

                expect(
                    await rejectionOf(
                        node().writeAttributes([{ path: { cluster: ON_OFF, attribute: ON_TIME }, value: 2 }]),
                    ),
                    show(Path),
                ).instanceOf(UnexpectedDataError);
            }
        });

        it("refuses several entries or a data version before any command is sent", async () => {
            const path = { endpoint: 1, cluster: ON_OFF, attribute: ON_TIME };
            for (const entries of [
                [
                    { path, value: 1 },
                    { path: { ...path, endpoint: 2 }, value: 1 },
                ],
                [{ path, value: 1, dataVersion: 3 }],
            ]) {
                expectDeclaredRefusal(await rejectionOf(node().writeAttributes(entries)), "multi-path-write");
            }
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
        it("fails with the status and cluster status the device answered", async () => {
            replies.device_command = {
                errorCode: 1,
                details: "UNSUPPORTED_COMMAND",
                failure: { status: 0x81, cluster_status: 3 },
            };

            const error = await rejectionOf(node().invoke("OnOff", "on", undefined, 1));
            if (!(error instanceof StatusResponseError)) {
                expect.fail(`expected a StatusResponseError, got ${messageOf(error)}`);
            }
            expect(error.code).equals(0x81);
            expect(error.clusterCode).equals(3);
        });

        it("leaves a refusal of the server's own a command failure", async () => {
            replies.device_command = { errorCode: 3, details: "Invalid arguments" };

            expect(await rejectionOf(node().invoke("OnOff", "on", undefined, 1))).instanceOf(MatterServerCommandError);
        });

        describe("invokeBatch", () => {
            const BATCH = [
                { cluster: ON_OFF, command: "On", endpoint: 1 },
                { cluster: ON_OFF, command: "Off", endpoint: 1 },
                { cluster: ON_OFF, command: "Toggle", endpoint: 2 },
            ];

            it("sends one batched_device_commands and reports each answer by its request position", async () => {
                replies.batched_device_commands = {
                    result: [{ status: 0 }, { status: 0x01, cluster_status: 3 }, { status: 0xcc }],
                };

                expect(await node().invokeBatch(BATCH)).deep.equals([
                    { index: 0, status: 0, clusterStatus: undefined },
                    { index: 1, status: 0x01, clusterStatus: 3 },
                    { index: 2, status: 0xcc, clusterStatus: undefined },
                ]);
                expect(sent()).deep.equals([
                    {
                        command: "batched_device_commands",
                        args: {
                            node_id: 5,
                            commands: [
                                { endpoint_id: 1, cluster_id: ON_OFF, command_name: "On", payload: {} },
                                { endpoint_id: 1, cluster_id: ON_OFF, command_name: "Off", payload: {} },
                                { endpoint_id: 2, cluster_id: ON_OFF, command_name: "Toggle", payload: {} },
                            ],
                        },
                    },
                ]);
            });

            it("decodes a response payload and passes a timed request through", async () => {
                replies.batched_device_commands = {
                    result: [
                        {
                            status: 0,
                            response: {
                                groupKeySet: {
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
                        },
                        { status: 0, response: null },
                    ],
                };

                expect(
                    await node().invokeBatch(
                        [
                            { cluster: GROUP_KEY_MANAGEMENT, command: "KeySetRead", args: { groupKeySetId: 1 } },
                            { cluster: ON_OFF, command: "On", endpoint: 1 },
                        ],
                        { timedInteractionTimeoutMs: 500 },
                    ),
                ).deep.equals([
                    {
                        index: 0,
                        data: {
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
                        },
                    },
                    { index: 1, status: 0 },
                ]);
                expect(server.requests[0].args).deep.include({ timed_request_timeout_ms: 500 });
            });

            it("fails a result that does not answer every command", async () => {
                replies.batched_device_commands = { result: [{ status: 0 }, { status: 0 }] };

                expect(await rejectionOf(node().invokeBatch(BATCH))).instanceOf(UnexpectedDataError);
            });

            it("fails an answer without a status", async () => {
                replies.batched_device_commands = { result: [{ status: 0 }, {}, { status: 0 }] };

                expect(await rejectionOf(node().invokeBatch(BATCH))).instanceOf(UnexpectedDataError);
            });

            it("keeps a refusal of the server's own a MatterServerCommandError", async () => {
                replies.batched_device_commands = { errorCode: 8, details: "more commands than MaxPathsPerInvoke" };

                expect(await rejectionOf(node().invokeBatch(BATCH))).instanceOf(MatterServerCommandError);
            });

            it("refuses a cluster outside the server's model before any command is sent", async () => {
                registerCertCustomCluster(FaultInjectionCluster);

                const error = await rejectionOf(
                    node().invokeBatch([...BATCH, { cluster: "FaultInjection", command: "FailAtFault", args: {} }]),
                );

                expectDeclaredRefusal(error, "unmodeled-requests");
                expect(server.requests).deep.equals([]);
            });

            it("fails an empty batch as an implementation error before any command is sent", async () => {
                expect(await rejectionOf(node().invokeBatch([]))).instanceOf(ImplementationError);
                expect(server.requests).deep.equals([]);
            });
        });

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

        it("refuses a zero timed-request timeout before any command is sent", async () => {
            const error = await rejectionOf(
                node().invoke(ON_OFF, "On", undefined, 1, { timedInteractionTimeoutMs: 0 }),
            );

            expect(error).instanceOf(ImplementationError);
            expect(server.requests).deep.equals([]);
        });

        it("refuses a cluster outside the standard model before any command is sent", async () => {
            registerCertCustomCluster(FaultInjectionCluster);

            const error = await rejectionOf(node().invoke("FaultInjection", "FailAtFault", {}));

            expectDeclaredRefusal(error, "unmodeled-requests");
            expect(server.requests).deep.equals([]);
        });
    });

    it("decommissions with remove_node", async () => {
        replies.remove_node = { result: null };

        await node().decommission();
        expect(sent()).deep.equals([{ command: "remove_node", args: { node_id: 5 } }]);
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
    });

    it("refuses every unmapped operation before any command is sent, naming the capability it declares", async () => {
        // A command that does go out is answered, so the call settles and the checks below say what was sent
        server.reply = () => ({ errorCode: 1, details: "sent although the adapter should refuse it" });
        const n = node();
        const refusals: [MatterServerRefusal, () => unknown][] = [
            [
                "multi-path-write",
                () =>
                    n.writeAttributes([
                        { path: { endpoint: 1, cluster: ON_OFF, attribute: ON_TIME }, value: 1, dataVersion: 1 },
                    ]),
            ],
            ["sustained-subscription", () => n.observeEvents([{ endpoint: 1 }], {})],
            ["sustained-subscription", () => n.clientEndpoints()],
            ["sustained-subscription", () => n.clientAttribute({ endpoint: 1, cluster: ON_OFF, attribute: 0 })],
            ["session-introspection", () => n.sessions()],
            ["session-introspection", () => n.severTransportConnection(1)],
            ["basic-commissioning-window", () => n.openCommissioningWindow({ timeout: 180, enhanced: false })],
            ["ota-provider-script", () => n.announceOtaProvider()],
            ["ota-provider-script", () => n.scriptOtaProvider({})],
        ];

        for (const [capability, call] of refusals) {
            let error: unknown;
            try {
                await call();
            } catch (e) {
                error = e;
            }
            expectDeclaredRefusal(error, capability);
        }
        expect(server.requests).deep.equals([]);
    });

    describe("announceOtaProvider for another node", () => {
        const PROVIDER = "9";

        beforeEach(() => {
            server.reply = ({ command, args }) => {
                if (command === "device_command") {
                    return { result: null };
                }
                if (command !== "read" || !isObject(args)) {
                    return undefined;
                }
                if (args.node_id === 9) {
                    return readReply({ "0/29/1": [29, 31], "1/29/1": [6, 41] });
                }
                const [path] = Array.isArray(args.attribute_paths) ? args.attribute_paths : [];
                return path === "0/62/1"
                    ? readReply({ "0/62/1": [{ "1": "AQI=", "2": 0xfff1, "3": 1, "4": 7, "5": "", "254": 1 }] })
                    : readReply({ "0/29/1": [29, 42] });
            };
        });

        it("invokes AnnounceOTAProvider with the provider's endpoint and the server's vendor id on this fabric", async () => {
            const { announcement, exchanges, observedMs } = await node().announceOtaProvider({
                provider: PROVIDER,
                announcementReason: 0,
            });

            expect(announcement).deep.equals({
                providerNodeId: PROVIDER,
                vendorId: 0xfff1,
                announcementReason: 0,
                endpoint: 1,
            });
            expect(exchanges).deep.equals({ queryImage: [], applyUpdate: [], notifyUpdateApplied: [] });
            expect(observedMs).equals(0);

            const invoke = sent().find(({ command }) => command === "device_command");
            expect(invoke?.args).deep.equals({
                node_id: 5,
                endpoint_id: 0,
                cluster_id: 42,
                command_name: "AnnounceOtaProvider",
                payload: { providerNodeId: 9, vendorId: 0xfff1, announcementReason: 0, endpoint: 1 },
            });
        });

        it("invokes on the requestor's own endpoint and announces the provider's lowest endpoint", async () => {
            server.reply = ({ command, args }) => {
                if (command === "device_command") {
                    return { result: null };
                }
                if (command !== "read" || !isObject(args)) {
                    return undefined;
                }
                if (args.node_id === 9) {
                    return readReply({ "3/29/1": [41], "0/29/1": [29], "2/29/1": [6, 41] });
                }
                const [path] = Array.isArray(args.attribute_paths) ? args.attribute_paths : [];
                return path === "0/62/1"
                    ? readReply({ "0/62/1": [{ "1": "AQI=", "2": 0x1234, "3": 1, "4": 7, "5": "", "254": 1 }] })
                    : readReply({ "0/29/1": [29], "2/29/1": [42] });
            };

            const { announcement } = await node().announceOtaProvider({ provider: PROVIDER });

            expect(announcement.endpoint).equals(2);
            expect(announcement.vendorId).equals(0x1234);
            const invoke = sent().find(({ command }) => command === "device_command");
            expect(invoke?.args).deep.include({ endpoint_id: 2 });
        });

        it("fails without invoking where the fabric-filtered Fabrics read does not name exactly one entry with a vendor id", async () => {
            const entry = { "1": "AQI=", "2": 0xfff1, "3": 1, "4": 7, "5": "", "254": 1 };
            const { "2": _vendorId, ...withoutVendor } = entry;
            for (const fabrics of [[], [entry, { ...entry, "254": 2 }], [withoutVendor]]) {
                server.requests.length = 0;
                server.reply = ({ command, args }) => {
                    if (command !== "read" || !isObject(args)) {
                        return { result: null };
                    }
                    if (args.node_id === 9) {
                        return readReply({ "1/29/1": [41] });
                    }
                    const [path] = Array.isArray(args.attribute_paths) ? args.attribute_paths : [];
                    return path === "0/62/1" ? readReply({ "0/62/1": fabrics }) : readReply({ "0/29/1": [42] });
                };

                const error = await rejectionOf(node().announceOtaProvider({ provider: PROVIDER }));
                expect(error, JSON.stringify(fabrics)).instanceOf(UnexpectedDataError);
                expect(sent().some(({ command }) => command === "device_command")).equals(false);
            }
        });

        it("announces UpdateAvailable where the step names no reason", async () => {
            const { announcement } = await node().announceOtaProvider({ provider: PROVIDER });
            expect(announcement.announcementReason).equals(1);
        });

        it("fails for a provider that serves no OTA provider cluster", async () => {
            server.reply = ({ command, args }) =>
                command === "read" && isObject(args) && args.node_id === 9
                    ? readReply({ "0/29/1": [29] })
                    : command === "read"
                      ? readReply({ "0/62/1": [{ "1": "AQI=", "2": 0xfff1, "3": 1, "4": 7, "5": "", "254": 1 }] })
                      : undefined;

            const error = await rejectionOf(node().announceOtaProvider({ provider: PROVIDER }));
            expect(error).instanceOf(UnexpectedDataError);
            expect(sent().some(({ command }) => command === "device_command")).equals(false);
        });
    });

    it("feeds the server process's log follower to the adapter's log", () => {
        expect(adapter.log).equals(log);
    });
});

describe("MatterServerControllerAdapter construction", () => {
    it("refuses options the server cannot honour, for the reason it declares", () => {
        const cases: [ControllerAdapterOptions, MatterServerGap][] = [
            [{ transport: "tcp" }, "tcp-transport"],
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
                    httpUrl: server.httpUrl,
                    log: new LogFollower(lines.follow(), "dut"),
                    close: async () => {
                        closed = true;
                        await client.close();
                        lines.close();
                    },
                };
            });

            const starting = rejectionOf(adapter.start());
            const closing = adapter.close();
            finish();
            await closing;

            expect(closed).equals(true);
            expect(await starting).instanceOf(ClosedError);
        } finally {
            await server.close();
        }
    });

    it("aborts a server still starting when the adapter closes, and closes once it stopped", async () => {
        let stopped = false;
        const adapter = new MatterServerControllerAdapter(
            "dut",
            undefined,
            (_role, signal) =>
                new Promise((_resolve, reject) =>
                    signal.addEventListener("abort", () =>
                        setTimeout(() => {
                            stopped = true;
                            reject(new ClosedError("launch aborted"));
                        }, 20),
                    ),
                ),
        );

        const starting = rejectionOf(adapter.start());
        await adapter.close();

        expect(stopped).equals(true);
        expect(await starting).instanceOf(ClosedError);
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
                    httpUrl: server.httpUrl,
                    log: new LogFollower(lines.follow(), "dut"),
                    close: async () => {
                        await client.close();
                        lines.close();
                    },
                };
            });
            return { adapter, launches: () => launches, close: () => server.close() };
        }

        it("refuses to start against a server below schema 14, and closes it", async () => {
            const server = await FakeMatterServer.start({ ...FAKE_SERVER_INFO, schema_version: 13 });
            let closed = false;
            const adapter = new MatterServerControllerAdapter("dut", undefined, async () => {
                const client = await MatterServerClient.connect(server.url);
                return {
                    client,
                    entry: "old-entry",
                    httpUrl: server.httpUrl,
                    log: new LogFollower(new LineQueue().follow(), "dut"),
                    close: async () => {
                        closed = true;
                        await client.close();
                    },
                };
            });
            try {
                const error = await rejectionOf(adapter.start());
                expect(error).instanceOf(CertConfigError);
                expect(messageOf(error)).contains("schema 13").and.contains("schema 14");
                expect(closed).equals(true);
            } finally {
                await adapter.close();
                await server.close();
            }
        });

        it("reports the schema refusal when stopping the old server fails as well", async () => {
            const server = await FakeMatterServer.start({ ...FAKE_SERVER_INFO, schema_version: 13 });
            const adapter = new MatterServerControllerAdapter("dut", undefined, async () => {
                const client = await MatterServerClient.connect(server.url);
                return {
                    client,
                    entry: "old-entry",
                    httpUrl: server.httpUrl,
                    log: new LogFollower(new LineQueue().follow(), "dut"),
                    close: async () => {
                        await client.close();
                        throw new InternalError("stop failed");
                    },
                };
            });
            try {
                expect(await rejectionOf(adapter.start())).instanceOf(CertConfigError);
            } finally {
                await adapter.close();
                await server.close();
            }
        });

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
                expect(messageOf(error)).contains("start() was already called");
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

    it("declares batch invoke supported, and concatenated QR codes and basic commissioning windows unsupported", () => {
        expect(MATTERJS_SERVER_CONTROLLER_PICS).deep.include({
            "MCORE.IDM.C.InvokeRequest.BatchCommands": 1,
            "MCORE.DD.CTRL_CONCATENATED_QR_CODE_1": 0,
            "CADMIN.C.C01.Tx": 0,
        });
    });

    it("declares the Switch client of an action switch, as the other controllers do", () => {
        expect(MATTERJS_SERVER_CONTROLLER_PICS).deep.include({
            "SWTCH.C": 1,
            "SWTCH.C.F02": 0,
            "SWTCH.C.F05": 1,
        });
    });

    it("declares the roles it lacks only through this adapter as capability gaps, not as PICS it does not support", () => {
        expect(MATTERJS_SERVER_CONTROLLER_PICS).deep.include({
            "MCORE.OTA.Provider": 1,
            "MCORE.BDX.Sender": 1,
            "ICDB.C": 1,
            "MCORE.BRIDGECLIENT": 1,
            "MCORE.DEVLIST.UseDevices": 1,
        });
        expect(MATTERJS_SERVER_CONTROLLER_PICS).not.have.property("ICDM.C");
        expect(Object.keys(MATTERJS_SERVER_CAPABILITY_GAPS)).include("sustained-subscription");
    });

    it("declares the BDX sender roles only, and no Terms and Conditions client feature", () => {
        const bdx = Object.entries(MATTERJS_SERVER_CONTROLLER_PICS).filter(([key]) => key.startsWith("MCORE.BDX."));
        expect(Object.fromEntries(bdx)).deep.equal({
            "MCORE.BDX.Sender": 1,
            "MCORE.BDX.Responder": 1,
            "MCORE.BDX.SynchronousSender": 1,
            "MCORE.BDX.AsynchronousSender": 0,
            "MCORE.BDX.BlockQueryWithSkip": 0,
            "MCORE.BDX.Receiver": 0,
            "MCORE.BDX.Initiator": 0,
            "MCORE.BDX.Driver": 0,
            "MCORE.BDX.SynchronousReceiver": 0,
            "MCORE.BDX.AsynchronousReceiver": 0,
        });
        expect(MATTERJS_SERVER_CONTROLLER_PICS).deep.include({ "CGEN.C.F00": 0 });
    });

    it("declares scripted OTA provider answers out of scope, not a gap", () => {
        expect(MATTERJS_SERVER_OUT_OF_SCOPE).have.property("ota-provider-script");
        expect(MATTERJS_SERVER_CAPABILITY_GAPS).not.have.property("ota-provider-script");
    });
});

describe("MatterServerControllerAdapter group messaging", () => {
    const KEY_SET = {
        groupKeySetId: 1,
        groupKeySecurityPolicy: 0,
        epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
        epochStartTime0: 1_600_000_000_000_000n,
    };
    const GROUPS: ControllerAdapterOptions["groups"] = [{ groupId: 1, keySet: KEY_SET }];

    let server: FakeMatterServer;
    let adapter: MatterServerControllerAdapter | undefined;
    let launchedWith: { certContext?: CertContextFile }[];

    beforeEach(async () => {
        server = await FakeMatterServer.start();
        launchedWith = [];
    });

    afterEach(async () => {
        await adapter?.close();
        adapter = undefined;
        await server.close();
        expect(server.failures).deep.equals([]);
    });

    async function started(options?: ControllerAdapterOptions) {
        adapter = new MatterServerControllerAdapter("dut", options, async (_role, _signal, { certContext }) => {
            launchedWith.push({ certContext });
            const client = await MatterServerClient.connect(server.url);
            const lines = new LineQueue();
            return {
                client,
                entry: "fake-entry",
                httpUrl: server.httpUrl,
                log: new LogFollower(lines.follow(), "dut"),
                close: async () => {
                    await client.close();
                    lines.close();
                },
            };
        });
        await adapter.start();
        return adapter;
    }

    it("hands the server the declared key set and group map before it starts", async () => {
        await started({ groups: GROUPS });

        expect(launchedWith).deep.equals([
            {
                certContext: {
                    keySets: [
                        {
                            groupKeySetId: 1,
                            epochKey0: "d0d1d2d3d4d5d6d7d8d9dadbdcdddedf",
                            epochStartTime0: 1_600_000_000_000_000,
                            groupKeySecurityPolicy: "TrustFirst",
                        },
                    ],
                    groupKeyMap: [{ groupId: 1, groupKeySetId: 1 }],
                },
            },
        ]);
    });

    it("hands the server no file content where the case declares no groups", async () => {
        await started();

        expect(launchedWith).deep.equals([{ certContext: undefined }]);
    });

    it("lists a key set two groups share once and states a declared address policy", () => {
        expect(
            certContextFor([
                { groupId: 1, keySet: KEY_SET, addressPolicy: "ianaAddr" },
                { groupId: 2, keySet: KEY_SET, addressPolicy: "perGroupId" },
            ]),
        ).deep.equals({
            keySets: [
                {
                    groupKeySetId: 1,
                    epochKey0: "d0d1d2d3d4d5d6d7d8d9dadbdcdddedf",
                    epochStartTime0: 1_600_000_000_000_000,
                    groupKeySecurityPolicy: "TrustFirst",
                },
            ],
            groupKeyMap: [
                { groupId: 1, groupKeySetId: 1, addressPolicy: "IanaAddr" },
                { groupId: 2, groupKeySetId: 1, addressPolicy: "PerGroupId" },
            ],
        });
        // The server refuses the field as unknown; the address policy belongs on the group map entry only
        for (const keySet of certContextFor([{ groupId: 1, keySet: KEY_SET, addressPolicy: "ianaAddr" }]).keySets) {
            expect(keySet).not.have.property("groupKeyMulticastPolicy");
        }
        expect(certContextFor([{ groupId: 1, keySet: { ...KEY_SET, groupKeySecurityPolicy: 1 } }]).keySets[0])
            .property("groupKeySecurityPolicy")
            .equals("CacheAndSync");
    });

    it("refuses a declaration the server would refuse or read differently, before the server starts", () => {
        const refused: [string, ControllerAdapterOptions["groups"]][] = [
            [
                "group 1 twice",
                [
                    { groupId: 1, keySet: KEY_SET },
                    { groupId: 1, keySet: KEY_SET },
                ],
            ],
            [
                "key set 1 with two different keys",
                [
                    { groupId: 1, keySet: KEY_SET },
                    { groupId: 2, keySet: { ...KEY_SET, epochKey0: new Uint8Array(16) } },
                ],
            ],
            ["not Unix-epoch microseconds", [{ groupId: 1, keySet: { ...KEY_SET, epochStartTime0: 2_220_000n } }]],
            ["not Unix-epoch microseconds", [{ groupId: 1, keySet: { ...KEY_SET, epochStartTime0: 1n << 60n } }]],
            ["security policy 2", [{ groupId: 1, keySet: { ...KEY_SET, groupKeySecurityPolicy: 2 } }]],
            ["key set 0, which is the fabric's IPK", [{ groupId: 1, keySet: { ...KEY_SET, groupKeySetId: 0 } }]],
            ["group 65280, which is not an application group id", [{ groupId: 0xff00, keySet: KEY_SET }]],
            ["group 0, which is not an application group id", [{ groupId: 0, keySet: KEY_SET }]],
        ];
        for (const [message, groups] of refused) {
            expect(() => new MatterServerControllerAdapter("dut", { groups }), message)
                .throw(ImplementationError)
                .property("message")
                .contains(message);
        }
        expect(launchedWith).deep.equals([]);
    });

    it("accepts the declared key set without sending anything, and refuses any other", async () => {
        const dut = await started({ groups: GROUPS });

        await dut.group(1).defineKeySet(KEY_SET);
        expect(await rejectionOf(dut.group(1).defineKeySet({ ...KEY_SET, epochKey0: new Uint8Array(16) })))
            .instanceOf(ImplementationError)
            .property("message")
            .contains("epochKey0");
        expect(await rejectionOf(dut.group(2).defineKeySet(KEY_SET)))
            .instanceOf(ImplementationError)
            .property("message")
            .contains("controllerGroups");
        expect(server.requests).deep.equals([]);
    });

    it("sends a group invoke as device_command to the Group Node ID, without an endpoint", async () => {
        server.reply = () => ({ result: null });
        const dut = await started({ groups: GROUPS });

        await dut.group(1).defineKeySet(KEY_SET);
        await dut.group(1).invoke("Groups", "addGroup", { groupId: 2, groupName: "GroupTwo" });

        expect(server.requests.map(({ command, args }) => ({ command, args }))).deep.equals([
            {
                command: "device_command",
                args: {
                    node_id: 0xffff_ffff_ffff_0001n,
                    cluster_id: 4,
                    command_name: "AddGroup",
                    payload: { groupId: 2, groupName: "GroupTwo" },
                },
            },
        ]);
    });

    it("refuses a group invoke for an undeclared group before sending anything", async () => {
        const dut = await started({ groups: GROUPS });

        const error = await rejectionOf(dut.group(2).invoke("Groups", "addGroup", { groupId: 2, groupName: "x" }));

        expect(error).instanceOf(ImplementationError);
        expect(messageOf(error)).contains("was not built for group 2").not.contains("before defineKeySet");
        expect(server.requests).deep.equals([]);
    });

    it("refuses a group invoke before the case keyed the group, as the other controllers fail without the key", async () => {
        const dut = await started({ groups: GROUPS });

        expect(await rejectionOf(dut.group(1).invoke("Groups", "addGroup", { groupId: 2, groupName: "x" })))
            .instanceOf(ImplementationError)
            .property("message")
            .contains("before defineKeySet");
        expect(server.requests).deep.equals([]);
    });

    it("refuses a group invoke of a command the cluster does not have, or a cluster it does not know, before sending anything", async () => {
        const dut = await started({ groups: GROUPS });
        await dut.group(1).defineKeySet(KEY_SET);

        const unknownCommand = await rejectionOf(dut.group(1).invoke("Groups", "noSuchCommand", {}));
        expect(unknownCommand).instanceOf(ImplementationError);
        expect(messageOf(unknownCommand)).equals('Unknown command "noSuchCommand" on cluster Groups');

        const unknownCluster = await rejectionOf(dut.group(1).invoke("NoSuchCluster", "addGroup", {}));
        expect(unknownCluster).instanceOf(ImplementationError);
        expect(messageOf(unknownCluster)).equals('Unknown command "addGroup" on cluster NoSuchCluster');

        expect(server.requests).deep.equals([]);
    });

    it("fails a group invoke the server answers with something other than null", async () => {
        server.reply = () => ({ result: { status: 0 } });
        const dut = await started({ groups: GROUPS });
        await dut.group(1).defineKeySet(KEY_SET);

        expect(await rejectionOf(dut.group(1).invoke("Groups", "addGroup", { groupId: 2, groupName: "x" }))).instanceOf(
            UnexpectedDataError,
        );
    });
});

describe("MatterServerControllerAdapter attestation", () => {
    const REVOCATION_SET = JSON.stringify([
        {
            type: "revocation_set",
            issuer_subject_key_id: "63540E47F64B1C38D13884A462D16C195D8FFB3C",
            issuer_name: "MD0xJTAjBgNVBAMMHE1hdHRlciBEZXYgUEFJIDB4RkZGMSBubyBQSUQxFDASBgorBgEEAYKifAIBDARGRkYx",
            revoked_serial_numbers: ["19367D978EAC533A"],
        },
    ]);

    let server: FakeMatterServer;
    let adapter: MatterServerControllerAdapter | undefined;
    let launchedWith: (string | undefined)[];

    beforeEach(async () => {
        server = await FakeMatterServer.start();
        launchedWith = [];
    });

    afterEach(async () => {
        await adapter?.close();
        adapter = undefined;
        await server.close();
        expect(server.failures).deep.equals([]);
    });

    async function started(options?: ControllerAdapterOptions) {
        adapter = new MatterServerControllerAdapter("dut", options, async (_role, _signal, { revocationSet }) => {
            launchedWith.push(revocationSet);
            const client = await MatterServerClient.connect(server.url);
            const lines = new LineQueue();
            return {
                client,
                entry: "fake-entry",
                httpUrl: server.httpUrl,
                log: new LogFollower(lines.follow(), "dut"),
                close: async () => {
                    await client.close();
                    lines.close();
                },
            };
        });
        await adapter.start();
        return adapter;
    }

    it("hands the server the declared revocation set before it starts", async () => {
        await started({ attestation: true, revocationSet: REVOCATION_SET });

        expect(launchedWith).deep.equals([REVOCATION_SET]);
    });

    it("judges attestation only where asked, and hands the server no set where the case declares none", async () => {
        expect((await started()).attestation).undefined;
        await adapter?.close();

        expect((await started({ attestation: true })).attestation).not.undefined;
        expect(launchedWith).deep.equals([undefined, undefined]);
    });

    it("takes the declared set as installed, however its text is laid out", async () => {
        const dut = await started({ attestation: true, revocationSet: REVOCATION_SET });

        await dut.attestation?.installRevocations(JSON.stringify(JSON.parse(REVOCATION_SET), undefined, 4));
        expect(server.requests).deep.equals([]);
    });

    it("refuses to install a set other than the declared one, or any set where none was declared", async () => {
        const other = REVOCATION_SET.replace("19367D978EAC533A", "19367D978EAC533B");

        const declared = await started({ attestation: true, revocationSet: REVOCATION_SET });
        expect(await rejectionOf(declared.attestation!.installRevocations(other)))
            .instanceOf(ImplementationError)
            .property("message")
            .contains("differs from the one the case's revocationSet declares");
        await adapter?.close();

        const undeclared = await started({ attestation: true });
        expect(await rejectionOf(undeclared.attestation!.installRevocations(REVOCATION_SET)))
            .instanceOf(ImplementationError)
            .property("message")
            .contains("was not built with a revocation set");
    });

    it("refuses a declared set it cannot read, or one without attestation, before the server starts", () => {
        for (const [options, problem] of [
            [{ attestation: true, revocationSet: "{ not a revocation set }" }, "is not a revocation set"],
            [{ revocationSet: REVOCATION_SET }, "needs attestation"],
        ] as const) {
            expect(() => new MatterServerControllerAdapter("dut", options, () => expect.fail("launched")))
                .throws(ImplementationError)
                .property("message")
                .contains(problem);
        }
    });

    it("reports a refusal for revocation with the finding the server names", async () => {
        server.reply = ({ command }) =>
            command === "commission_with_code"
                ? {
                      errorCode: 1,
                      details:
                          "Commission failed: Device attestation refused: CertificateRevoked: Product Attestation " +
                          "Intermediate certificate has been revoked",
                      failure: { reason: "attestation-rejected" },
                  }
                : undefined;
        const dut = await started({ attestation: true, revocationSet: REVOCATION_SET });

        const error = await rejectionOf(dut.commission({ manualPairingCode: "34970112332" }));
        if (!(error instanceof MatterServerCommissioningError)) {
            expect.fail(`expected a MatterServerCommissioningError, got ${messageOf(error)}`);
        }
        expect(error.reason).equals("attestation-rejected");
        // TC-DA-1.9 tells a refusal for revocation from any other refusal by this name in the message
        expect(error.message).contains("CertificateRevoked");
    });
});

describe("MatterServerControllerAdapter started from the environment", () => {
    const ENTRY = fileURLToPath(new URL("./fixtures/fake-server-entry.mjs", import.meta.url));
    const REVOCATION_SET = JSON.stringify([
        {
            type: "revocation_set",
            issuer_subject_key_id: "63540E47F64B1C38D13884A462D16C195D8FFB3C",
            issuer_name: "MD0xJTAjBgNVBAMMHE1hdHRlciBEZXYgUEFJIDB4RkZGMSBubyBQSUQxFDASBgorBgEEAYKifAIBDARGRkYx",
            revoked_serial_numbers: ["19367D978EAC533A"],
        },
    ]);
    const KEY_SET = {
        groupKeySetId: 1,
        groupKeySecurityPolicy: 0,
        epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
        epochStartTime0: 1_600_000_000_000_000n,
    };

    const originalEntry = env.MATTER_CERT_SERVER_ENTRY;
    let adapter: MatterServerControllerAdapter | undefined;

    beforeEach(() => {
        env.MATTER_CERT_SERVER_ENTRY = `${process.execPath} ${ENTRY}`;
    });

    afterEach(async () => {
        await adapter?.close();
        adapter = undefined;
        if (originalEntry === undefined) {
            delete env.MATTER_CERT_SERVER_ENTRY;
        } else {
            env.MATTER_CERT_SERVER_ENTRY = originalEntry;
        }
    });

    it("hands the server process the key sets and the revocation set the case declared", async () => {
        adapter = new MatterServerControllerAdapter("dut", {
            groups: [{ groupId: 1, keySet: KEY_SET }],
            attestation: true,
            revocationSet: REVOCATION_SET,
        });

        await adapter.start();

        const texts = () => adapter?.log.lines.map(({ text }) => text) ?? [];
        await waitFor(() => texts().some(text => text.includes("Loaded revocation sets from")), "revocation line");
        expect(texts().some(text => text.includes("Loaded group key configuration"))).equals(true);
    });

    it("starts the server without either file where the case declares none", async () => {
        adapter = new MatterServerControllerAdapter("dut");

        await adapter.start();

        const texts = () => adapter?.log.lines.map(({ text }) => text) ?? [];
        await waitFor(() => texts().some(text => text.startsWith("fake-server args: ")), "args line");
        expect(texts().some(text => text.includes("Loaded group key configuration"))).equals(false);
        expect(texts().some(text => text.includes("--revocation-sets-dir"))).equals(false);
    });
});
