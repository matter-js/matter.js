/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Environment, ImplementationError, InternalError, UnexpectedDataError } from "@matter/main";
import { CertificateAuthority, getOperationalDeviceQname, Rcac } from "@matter/main/protocol";
import { FabricId, GlobalFabricId, NodeId, Status, StatusResponseError } from "@matter/main/types";
import { Matter } from "@matter/model";
import { UnsupportedByControllerError } from "@matter/testing";
import type { CertNodeApi } from "@matter/testing";
import { expect } from "chai";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import {
    ChipToolCommandError,
    ChipToolControllerAdapter,
    ChipToolUnmappedStatusError,
} from "../../src/cert/ChipToolControllerAdapter.js";
import { registerCertCustomCluster } from "../../src/cert/custom-clusters.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import { ChipToolExitError } from "../../src/chip-tool/chip-tool-client.js";
import { FaultInjectionCluster } from "../cert/fault-injection.js";
import { delay, FakeChipTool, waitFor, writeStandInBinary } from "./fake-chip-tool.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const LEVEL_CONTROL = Matter.clusters.require("LevelControl");
const ON_OFF = Matter.clusters.require("OnOff");
const IDENTIFY = Matter.clusters.require("Identify");
const GENERAL_COMMISSIONING = Matter.clusters.require("GeneralCommissioning");
const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const TRUSTED_ROOT_CERTIFICATES = OPERATIONAL_CREDENTIALS.attributes.require("trustedRootCertificates");
const FABRICS = OPERATIONAL_CREDENTIALS.attributes.require("fabrics");
const FABRIC_DESCRIPTOR = FABRICS.members.require("entry");
const OPTIONS = LEVEL_CONTROL.attributes.require("options");
const NODE_LABEL = BASIC_INFORMATION.attributes.require("nodeLabel");
const VENDOR_ID = BASIC_INFORMATION.attributes.require("vendorId");
const ON_LEVEL = LEVEL_CONTROL.attributes.require("onLevel");
const ON_OFF_ATTRIBUTE = ON_OFF.attributes.require("onOff");
const IDENTIFY_TIME = IDENTIFY.attributes.require("identifyTime");
const ARM_FAIL_SAFE = GENERAL_COMMISSIONING.commands.require("armFailSafe");
const START_UP = BASIC_INFORMATION.events.require("startUp");
const BOOLEAN_STATE = Matter.clusters.require("BooleanState");
const STATE_CHANGE = BOOLEAN_STATE.events.require("stateChange");

/** The node id the first {@link ChipToolControllerAdapter.commission} of an adapter mints. */
const FIRST_NODE = "4097";

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (e) {
        return e;
    }
    throw new InternalError("Expected the operation to reject but it resolved");
}

/** The operation an {@link UnsupportedByControllerError} names, so a test asserts on it without a cast. */
function unsupportedOperationOf(failure: unknown) {
    if (!(failure instanceof UnsupportedByControllerError)) {
        throw new InternalError(`Expected an UnsupportedByControllerError, got ${failure}`);
    }
    return failure.operation;
}

/** The discriminator argument of an `open-commissioning-window` command line, given the args before it. */
function discriminatorOf(command: string, prefixArgs: string) {
    const match = new RegExp(`^pairing open-commissioning-window ${prefixArgs} (\\d+)$`).exec(command);
    if (match === null) {
        throw new InternalError(`Not an open-commissioning-window command with "${prefixArgs}": ${command}`);
    }
    return Number.parseInt(match[1], 10);
}

function requireId(id: number | undefined, what: string) {
    if (id === undefined) {
        throw new InternalError(`Model element ${what} has no id`);
    }
    return id;
}

/** A `FabricDescriptorStruct` field's key in chip-tool's output, which renders a struct by field id. */
function fabricField(name: string) {
    return String(requireId(FABRIC_DESCRIPTOR.members.require(name).id, `FabricDescriptorStruct.${name}`));
}

/** What chip-tool answers a read of `OperationalCredentials.Fabrics` with. */
function fabricsReply(entries: unknown[]) {
    return {
        results: [
            {
                clusterId: OPERATIONAL_CREDENTIALS.id,
                endpointId: 0,
                attributeId: requireId(FABRICS.id, "fabrics"),
                value: entries,
            },
        ],
    };
}

function fabricEntry(rootPublicKey: Bytes, fabricId: number, fabricIndex = 1) {
    return {
        [fabricField("rootPublicKey")]: `base64:${Bytes.toBase64(rootPublicKey)}`,
        [fabricField("vendorId")]: 0xfff1,
        [fabricField("fabricId")]: fabricId,
        [fabricField("nodeId")]: 112233,
        [fabricField("label")]: "",
        [fabricField("fabricIndex")]: fabricIndex,
    };
}

describe("ChipToolControllerAdapter", function () {
    // Every test spawns a stand-in process and opens a socket; the default 2s budget is not enough
    // for the first of them on a cold host
    this.timeout(15_000);

    const ENV_KEYS = ["MATTER_CERT_APP_DIR", "MATTER_CHIP_BINS_SOURCE", "MATTER_CHIP_TOOL_PORT_DUT"] as const;
    const originalEnv = new Map<string, string | undefined>();

    let fake: FakeChipTool;
    let dir: string;
    let adapter: ChipToolControllerAdapter | undefined;

    beforeEach(async () => {
        for (const key of ENV_KEYS) {
            originalEnv.set(key, env[key]);
        }

        fake = await FakeChipTool.start();
        dir = await mkdtemp(join(tmpdir(), "matter-chip-tool-adapter-test-"));
        await writeStandInBinary(dir, join(dir, "pid"));

        delete env.MATTER_CHIP_BINS_SOURCE;
        env.MATTER_CERT_APP_DIR = dir;
        env.MATTER_CHIP_TOOL_PORT_DUT = String(fake.port);
    });

    // Each step is guarded, so one failing teardown cannot strand the rest: leaving
    // MATTER_CERT_APP_DIR pointed at a deleted directory breaks sibling specs that key off it, and
    // ws's server.close() does not resolve while an upgraded client socket is still open, which is
    // why the adapter (and with it its socket) must close first.
    afterEach(async () => {
        const failures = new Array<unknown>();
        const attempt = async (what: () => Promise<void>) => {
            try {
                await what();
            } catch (e) {
                failures.push(e);
            }
        };

        await attempt(async () => {
            await adapter?.close();
        });
        adapter = undefined;
        await attempt(() => fake.close());
        await attempt(() => rm(dir, { recursive: true, force: true }));

        for (const key of ENV_KEYS) {
            const original = originalEnv.get(key);
            if (original === undefined) {
                delete env[key];
            } else {
                env[key] = original;
            }
        }

        // A fixture that recorded a protocol violation or threw while serving invalidates whatever
        // the test just asserted
        expect(fake.violations).deep.equal([]);
        expect(fake.failures).deep.equal([]);
        if (failures.length) {
            throw failures[0];
        }
    });

    async function start() {
        const started = new ChipToolControllerAdapter("dut");
        adapter = started;
        await started.start();
        return started;
    }

    /** Commissions a node and clears the recorded frames, so a test asserts only on its own command. */
    async function commissioned(): Promise<{ ref: string; node: CertNodeApi }> {
        const started = await start();
        const ref = await started.commission({ passcode: 20202021, discriminator: 3840 });
        fake.commands.splice(0);
        fake.frames.splice(0);
        return { ref, node: started.node(ref) };
    }

    it("mints a node id and pairs with the device's original setup code", async () => {
        const started = await start();

        const ref = await started.commission({ passcode: 20202021, discriminator: 3840 });

        expect(ref).equal(FIRST_NODE);
        expect(fake.commands).deep.equal([`pairing onnetwork-long ${FIRST_NODE} 20202021 3840`]);
        expect(await started.commission({ manualPairingCode: "36217551633" })).equal("4098");
        expect(fake.commands[1]).equal("pairing code 4098 36217551633");
    });

    it("does not report a successful frame as a failure, which would hide a real one", async () => {
        // ws hands its callback `null` on success rather than leaving the argument out
        const started = await start();
        await started.commission({ passcode: 20202021, discriminator: 3840 });

        await new Promise(resolve => setImmediate(resolve));
        expect(started.log.count(/failed to send/, 0)).equal(0);
    });

    it("pairs from a QR onboarding payload, which chip-tool reads with the same command", async () => {
        const started = await start();

        const ref = await started.commission({ qrPairingCode: "MT:-24J042C00KA0648G00" });

        expect(ref).equal(FIRST_NODE);
        expect(fake.commands).deep.equal([`pairing code ${FIRST_NODE} MT:-24J042C00KA0648G00`]);
    });

    it("reads an onboarding payload through chip-tool's own parser", async () => {
        const started = await start();

        // `SetupPayloadParseCommand::Print`'s own lines, as chip-tool logs them
        fake.reply = () => ({
            logs: [
                "Version:             0",
                "VendorID:            65521",
                "ProductID:           32769",
                "Custom flow:         0    (STANDARD)",
                "Discovery Bitmask:   0x04 (On IP network)",
                "Long discriminator:  3840   (0xf00)",
                "Passcode:            20202021",
            ],
        });

        expect(await started.parseQrPayload("MT:-24J042C00KA0648G00")).deep.equal({
            version: 0,
            vendorId: 65521,
            productId: 32769,
            flowType: 0,
            discoveryCapabilities: 0x04,
            discriminator: 3840,
            passcode: 20202021,
        });
        expect(fake.commands).deep.equal(["payload parse-setup-payload MT:-24J042C00KA0648G00"]);
    });

    it("rejects a payload chip-tool parsed into something other than a QR code's fields", async () => {
        const started = await start();

        // A manual code parses to a short discriminator, which no caller of this can act on
        fake.reply = () => ({
            logs: [
                "Version:             0",
                "VendorID:            65521",
                "ProductID:           32769",
                "Custom flow:         0    (STANDARD)",
                "Discovery Bitmask:   0x04 (On IP network)",
                "Short discriminator: 15   (0xf)",
                "Passcode:            20202021",
            ],
        });

        expect(await rejectionOf(started.parseQrPayload("MT:-24J042C00KA0648G00"))).instanceOf(InternalError);
    });

    it("refuses a concatenated onboarding payload instead of letting chip-tool choose a device", async () => {
        const started = await start();

        await expect(started.commission({ qrPairingCode: "MT:-24J042C00KA0648G00*-24J042C00KA0648G00" })).rejectedWith(
            ImplementationError,
            /carries 2 payloads/,
        );
        expect(fake.commands).deep.equal([]);
    });

    it("leaves a payload chip-tool would refuse for chip-tool to refuse", async () => {
        const started = await start();

        // Version 2, which chip-tool's own `SetupPayload::FromStringRepresentation` rejects. A refusal
        // raised here instead would put matter.js's verdict in a cert test's evidence in place of the
        // controller's.
        const ref = await started.commission({ qrPairingCode: "MT:034J042C00KA0648G00" });

        expect(ref).equal(FIRST_NODE);
        expect(fake.commands).deep.equal([`pairing code ${FIRST_NODE} MT:034J042C00KA0648G00`]);
    });

    it("reads a 21-digit manual pairing code through chip-tool's own parser", async () => {
        const started = await start();

        fake.reply = () => ({
            logs: [
                "Version:             0",
                "VendorID:            65521",
                "ProductID:           32769",
                "Custom flow:         2    (CUSTOM)",
                "Discovery Bitmask:   UNKNOWN",
                "Short discriminator: 15   (0xf)",
                "Passcode:            20202021",
            ],
        });

        expect(await started.parseManualPairingCode("749701123365521327694")).deep.equal({
            shortDiscriminator: 15,
            passcode: 20202021,
            vendorId: 65521,
            productId: 32769,
        });
        expect(fake.commands).deep.equal(["payload parse-setup-payload 749701123365521327694"]);
    });

    it("reports no identity for an 11-digit code, which chip-tool prints as zeroes", async () => {
        const started = await start();

        fake.reply = () => ({
            logs: [
                "Version:             0",
                "VendorID:            0",
                "ProductID:           0",
                "Custom flow:         0    (STANDARD)",
                "Discovery Bitmask:   UNKNOWN",
                "Short discriminator: 15   (0xf)",
                "Passcode:            20202021",
            ],
        });

        expect(await started.parseManualPairingCode("34970112332")).deep.equal({
            shortDiscriminator: 15,
            passcode: 20202021,
            vendorId: undefined,
            productId: undefined,
        });
    });

    it("separates chip-tool refusing the payload from chip-tool failing later", async () => {
        const started = await start();

        // `SetupPayload::FromStringRepresentation`'s own refusal, as chip-tool renders a CHIP_ERROR
        fake.reply = () => ({
            status: 1,
            logs: [
                "Run command failure: src/setup_payload/SetupPayload.cpp:361: CHIP Error 0x0000002F: Invalid argument",
            ],
        });

        const refusal = await rejectionOf(started.commission({ qrPairingCode: "MT:034J042C00KA0648G00" }));
        expect(refusal).instanceOf(OnboardingPayloadRefusedError);
    });

    it("does not report a handshake failure as a refused payload", async () => {
        const started = await start();

        // A commissioner that took the code and only then failed reaching the device
        fake.reply = () => ({
            status: 1,
            logs: [
                "Run command failure: src/protocols/secure_channel/PASESession.cpp:610: CHIP Error 0x00000032: Timeout",
            ],
        });

        const failure = await rejectionOf(started.commission({ qrPairingCode: "MT:-24J042C00KA0648G00" }));
        expect(failure).instanceOf(ChipToolCommandError);
        expect(failure).not.instanceOf(OnboardingPayloadRefusedError);
    });

    it("reads a concrete path and decodes the value through the model", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({
            results: [
                {
                    clusterId: BASIC_INFORMATION.id,
                    endpointId: 0,
                    attributeId: requireId(VENDOR_ID.id, "vendorId"),
                    dataVersion: 7,
                    value: 0xfff1,
                },
            ],
        });

        expect(await node.readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: VENDOR_ID.id })).equal(
            0xfff1,
        );
        expect(fake.commands).deep.equal([`any read-by-id 0x28 0x2 ${ref} 0`]);
    });

    it("decodes a base64 octet string and a bitmap on read, as chip-tool's own output encodes them", async () => {
        const { node } = await commissioned();
        const certificate = Bytes.fromHex("15300101f0240201");

        fake.reply = () => ({
            results: [
                {
                    clusterId: OPERATIONAL_CREDENTIALS.id,
                    endpointId: 0,
                    attributeId: requireId(TRUSTED_ROOT_CERTIFICATES.id, "trustedRootCertificates"),
                    value: [`base64:${Bytes.toBase64(certificate)}`],
                },
            ],
        });

        const roots = await node.readAttribute({
            endpoint: 0,
            cluster: OPERATIONAL_CREDENTIALS.id,
            attribute: TRUSTED_ROOT_CERTIFICATES.id,
        });
        expect(Array.isArray(roots)).equal(true);
        expect(Bytes.toHex(Bytes.of(Array.isArray(roots) ? roots[0] : roots))).equal("15300101f0240201");

        fake.reply = () => ({
            results: [
                {
                    clusterId: LEVEL_CONTROL.id,
                    endpointId: 1,
                    attributeId: requireId(OPTIONS.id, "options"),
                    value: 1,
                },
            ],
        });

        expect(await node.readAttribute({ endpoint: 1, cluster: LEVEL_CONTROL.id, attribute: OPTIONS.id })).deep.equal({
            executeIfOff: true,
            coupleColorTempToLevel: false,
        });
    });

    it("encodes an octet string as hex:, the only prefix chip-tool's argument parser accepts", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({ results: [] });

        await node.writeAttribute(
            { endpoint: 0, cluster: OPERATIONAL_CREDENTIALS.id, attribute: TRUSTED_ROOT_CERTIFICATES.id },
            [Bytes.fromHex("15300101f0240201")],
        );
        await node.writeAttribute(
            { endpoint: 1, cluster: LEVEL_CONTROL.id, attribute: OPTIONS.id },
            {
                executeIfOff: true,
            },
        );

        expect(fake.commands).deep.equal([
            `any write-by-id 0x3e 0x4 ["hex:15300101f0240201"] ${ref} 0`,
            `any write-by-id 0x8 0xf 1 ${ref} 1`,
        ]);
    });

    it("passes fabric-filtered false through, and nothing when the default applies", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({ results: [] });

        await node.readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION.id });
        await node.readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION.id }, { fabricFiltered: false });
        await node.readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION.id }, { fabricFiltered: true });

        expect(fake.commands).deep.equal([
            `any read-by-id 0x28 0xffffffff ${ref} 0`,
            `any read-by-id 0x28 0xffffffff ${ref} 0 --fabric-filtered false`,
            `any read-by-id 0x28 0xffffffff ${ref} 0`,
        ]);
    });

    it("returns entries for a wildcard read without rejecting on the per-path statuses in it", async () => {
        const { ref, node } = await commissioned();

        // A per-path status makes chip-tool's own command exit non-zero, so the reply carries the
        // trailing bare failure entry too
        fake.reply = () => ({
            results: [
                {
                    clusterId: ON_OFF.id,
                    endpointId: 1,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    dataVersion: 3,
                    value: true,
                },
                {
                    clusterId: ON_OFF.id,
                    endpointId: 2,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    error: "UNSUPPORTED_ATTRIBUTE",
                },
            ],
            status: 1,
        });

        expect(await node.readAttribute({ cluster: ON_OFF.id })).deep.equal([
            { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id, value: true, version: 3 },
        ]);
        expect(fake.commands).deep.equal([`any read-by-id 0x6 0xffffffff ${ref} 0xffff`]);
    });

    it("answers a concrete read from the entry for its own path, not the first one in the reply", async () => {
        const { node } = await commissioned();

        // chip-tool appends a live subscription's report to whatever command is in flight, so a
        // reply's first entry is not necessarily the answer to the read that issued it
        fake.reply = () => ({
            results: [
                {
                    clusterId: ON_OFF.id,
                    endpointId: 2,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    value: false,
                },
                {
                    clusterId: ON_OFF.id,
                    endpointId: 1,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    value: true,
                },
            ],
        });

        expect(await node.readAttribute({ endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id })).equal(
            true,
        );

        // Likewise for a status: another path's rejection must not fail this read
        fake.reply = () => ({
            results: [
                {
                    clusterId: ON_OFF.id,
                    endpointId: 2,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    error: Status.UnsupportedAttribute,
                },
                {
                    clusterId: ON_OFF.id,
                    endpointId: 1,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    value: true,
                },
            ],
            status: 1,
        });

        expect(await node.readAttribute({ endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id })).equal(
            true,
        );
    });

    it("rejects a concrete read answered only by a status, whether or not it carries the path", async () => {
        const { node } = await commissioned();
        const path = { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id };

        fake.reply = () => ({ results: [{ error: "UNSUPPORTED_ATTRIBUTE" }], status: 1 });
        const bare = await rejectionOf(node.readAttribute(path));
        expect(bare).instanceOf(StatusResponseError);
        expect(StatusResponseError.of(bare)?.code).equal(Status.UnsupportedAttribute);

        fake.reply = () => ({
            results: [
                {
                    clusterId: ON_OFF.id,
                    endpointId: 1,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    error: Status.UnsupportedAttribute,
                },
            ],
            status: 1,
        });
        const scoped = await rejectionOf(node.readAttribute(path));
        expect(scoped).instanceOf(StatusResponseError);
        expect(StatusResponseError.of(scoped)?.code).equal(Status.UnsupportedAttribute);
    });

    it("reads paths spanning two clusters through one zipped id-list command", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({
            results: [
                {
                    clusterId: BASIC_INFORMATION.id,
                    endpointId: 0,
                    attributeId: requireId(NODE_LABEL.id, "nodeLabel"),
                    dataVersion: 11,
                    value: "a-label",
                },
                {
                    clusterId: LEVEL_CONTROL.id,
                    endpointId: 1,
                    attributeId: requireId(ON_LEVEL.id, "onLevel"),
                    dataVersion: 12,
                    value: 3,
                },
            ],
        });

        expect(
            await node.readAttributes([
                { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id },
                { endpoint: 1, cluster: LEVEL_CONTROL.id, attribute: ON_LEVEL.id },
            ]),
        ).deep.equal([
            { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id, value: "a-label", version: 11 },
            { endpoint: 1, cluster: LEVEL_CONTROL.id, attribute: ON_LEVEL.id, value: 3, version: 12 },
        ]);
        expect(fake.commands).deep.equal([`any read-by-id 0x28,0x8 0x5,0x11 ${ref} 0,1`]);
    });

    it("reports a read of more paths than chip-tool accepts as unsupported, without issuing it", async () => {
        const { node } = await commissioned();

        const paths = new Array<{ endpoint: number; cluster: number; attribute: number }>();
        for (let endpoint = 0; endpoint < 65; endpoint++) {
            paths.push({ endpoint, cluster: requireId(ON_OFF.id, "OnOff"), attribute: 0 });
        }

        expect(await rejectionOf(node.readAttributes(paths))).instanceOf(UnsupportedByControllerError);
        expect(fake.commands).deep.equal([]);
    });

    it("writes two attributes of two clusters, with their data versions, in one command", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({ results: [] });

        expect(
            await node.writeAttributes([
                {
                    path: { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id },
                    value: "a-label",
                    dataVersion: 11,
                },
                {
                    path: { endpoint: 1, cluster: LEVEL_CONTROL.id, attribute: ON_LEVEL.id },
                    value: 3,
                    dataVersion: 12,
                },
            ]),
        ).deep.equal([
            { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id, status: Status.Success },
            { endpoint: 1, cluster: LEVEL_CONTROL.id, attribute: ON_LEVEL.id, status: Status.Success },
        ]);
        expect(fake.commands).deep.equal([
            `any write-by-id 0x28,0x8 0x5,0x11 "a-label";3 ${ref} 0,1 --data-version 11,12`,
        ]);
    });

    it("reports the per-path status a write was rejected with instead of throwing", async () => {
        const { node } = await commissioned();

        fake.reply = () => ({
            results: [
                {
                    clusterId: BASIC_INFORMATION.id,
                    endpointId: 0,
                    attributeId: requireId(NODE_LABEL.id, "nodeLabel"),
                    error: Status.DataVersionMismatch,
                },
            ],
            status: 1,
        });

        expect(
            await node.writeAttributes([
                {
                    path: { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id },
                    value: "a-label",
                    dataVersion: 11,
                },
            ]),
        ).deep.equal([
            {
                endpoint: 0,
                cluster: BASIC_INFORMATION.id,
                attribute: NODE_LABEL.id,
                status: Status.DataVersionMismatch,
            },
        ]);
    });

    it("reports a wildcard-endpoint write as unsupported, without issuing it", async () => {
        const { node } = await commissioned();

        const failure = await rejectionOf(
            node.writeAttributes([{ path: { cluster: IDENTIFY.id, attribute: IDENTIFY_TIME.id }, value: 5 }]),
        );

        expect(unsupportedOperationOf(failure)).equal("writeAttributes");
        expect(fake.commands).deep.equal([]);
    });

    it("reports a write mixing versioned and unversioned paths as unsupported, without issuing it", async () => {
        const { node } = await commissioned();

        expect(
            await rejectionOf(
                node.writeAttributes([
                    {
                        path: { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id },
                        value: "a-label",
                        dataVersion: 11,
                    },
                    { path: { endpoint: 1, cluster: LEVEL_CONTROL.id, attribute: ON_LEVEL.id }, value: 3 },
                ]),
            ),
        ).instanceOf(UnsupportedByControllerError);
        expect(fake.commands).deep.equal([]);
    });

    it("rejects a single-attribute write the device answered with a status", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({
            results: [
                {
                    clusterId: BASIC_INFORMATION.id,
                    endpointId: 0,
                    attributeId: requireId(VENDOR_ID.id, "vendorId"),
                    error: Status.UnsupportedWrite,
                },
            ],
            status: 1,
        });

        const failure = await rejectionOf(
            node.writeAttribute({ endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: VENDOR_ID.id }, 1),
        );
        expect(failure).instanceOf(StatusResponseError);
        expect(StatusResponseError.of(failure)?.code).equal(Status.UnsupportedWrite);
        expect(fake.commands).deep.equal([`any write-by-id 0x28 0x2 1 ${ref} 0`]);
    });

    it("quotes a value containing whitespace, which chip-tool's tokenizer would otherwise split", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({ results: [] });

        await node.writeAttribute(
            { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id },
            "a label with spaces",
        );

        expect(fake.commands).deep.equal([`any write-by-id 0x28 0x5 '"a label with spaces"' ${ref} 0`]);
    });

    it("reports a value chip-tool's own value separator would split as unsupported", async () => {
        const { node } = await commissioned();

        expect(
            await rejectionOf(
                node.writeAttribute(
                    { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id },
                    "a;label",
                ),
            ),
        ).instanceOf(UnsupportedByControllerError);
        expect(fake.commands).deep.equal([]);
    });

    it("resolves an invoke with its decoded response payload, and undefined for a bare success", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({
            results: [
                {
                    clusterId: GENERAL_COMMISSIONING.id,
                    endpointId: 0,
                    commandId: requireId(ARM_FAIL_SAFE.responseModel?.id, "ArmFailSafeResponse"),
                    value: { "0": 0, "1": "ok" },
                },
            ],
        });

        expect(
            await node.invoke("GeneralCommissioning", "armFailSafe", { expiryLengthSeconds: 60, breadcrumb: 1n }, 0),
        ).deep.equal({ errorCode: 0, debugText: "ok" });
        expect(fake.commands).deep.equal([`any command-by-id 0x30 0x0 {"0":60,"1":1} ${ref} 0`]);

        fake.reply = () => ({ results: [] });
        expect(await node.invoke("OnOff", "on", {}, 1)).equal(undefined);
        expect(fake.commands[1]).equal(`any command-by-id 0x6 0x1 {} ${ref} 1`);
    });

    it("rejects an invoke the device answered with a command status", async () => {
        const { node } = await commissioned();

        fake.reply = () => ({
            results: [
                { clusterId: ON_OFF.id, endpointId: 3, commandId: 1, error: "UNSUPPORTED_ENDPOINT" },
                { error: "FAILURE" },
            ],
        });

        const failure = await rejectionOf(node.invoke("OnOff", "on", {}, 3));
        expect(failure).instanceOf(StatusResponseError);
        expect(StatusResponseError.of(failure)?.code).equal(Status.UnsupportedEndpoint);
    });

    it("fails an invoke that exited non-zero beside a response payload", async () => {
        const { node } = await commissioned();

        // `ClusterCommand::OnResponse` logs the response before decoding it for the text log, so a
        // response chip-tool could not decode reaches the reply beside the exit marker and nothing
        // else — and a payload is no account of the failure
        fake.reply = () => ({
            results: [
                {
                    clusterId: GENERAL_COMMISSIONING.id,
                    endpointId: 0,
                    commandId: requireId(ARM_FAIL_SAFE.responseModel?.id, "ArmFailSafeResponse"),
                    value: { "0": 0, "1": "ok" },
                },
            ],
            status: 1,
        });

        expect(
            await rejectionOf(
                node.invoke("GeneralCommissioning", "armFailSafe", { expiryLengthSeconds: 60, breadcrumb: 1n }, 0),
            ),
        ).instanceOf(ChipToolCommandError);
    });

    it("recovers the enhanced window's pairing codes from the reply's own logs", async () => {
        const { node } = await commissioned();

        // A reply's logs[] carries chip-tool's raw vsnprintf output, with no timestamp/module prefix
        // (`InteractiveServerLoggingCallback`), so both forms must parse
        fake.reply = () => ({
            logs: [
                "Successfully opened pairing window on the device",
                "Manual pairing code: [36217551633]",
                "[1755000000.002][1:1] CHIP:CTL: SetupQRCode: [MT:-24J0AFN00KA0648G00]",
            ],
        });

        expect(await node.openCommissioningWindow({ timeout: 180, enhanced: true })).deep.equal({
            manualPairingCode: "36217551633",
            qrPairingCode: "MT:-24J0AFN00KA0648G00",
        });
        expect(discriminatorOf(fake.commands[0], `${FIRST_NODE} 1 180 1000`)).within(0, 4095);
    });

    it("reports a pairing failure as a chip-tool command error, never as an interaction status", async () => {
        const started = await start();

        // chip-tool funnels discovery, PASE, attestation and CASE failures alike into the bare
        // failure marker its exit status appends, with no interaction-model status behind it
        fake.reply = () => ({ status: 1 });

        const failure = await rejectionOf(started.commission({ passcode: 20202021, discriminator: 3840 }));
        expect(failure).instanceOf(ChipToolCommandError);
        expect(failure).not.instanceOf(StatusResponseError);

        const node = started.node(FIRST_NODE);
        expect(await rejectionOf(node.decommission())).instanceOf(ChipToolCommandError);
        expect(await rejectionOf(node.openCommissioningWindow({ timeout: 180, enhanced: true }))).instanceOf(
            ChipToolCommandError,
        );
        expect(await rejectionOf(node.operationalMdnsInstanceName())).instanceOf(ChipToolCommandError);

        // A failed derivation must not become the cached answer: the next caller retries
        const ca = await CertificateAuthority.create(Environment.default.get(Crypto));
        fake.reply = () => fabricsReply([fabricEntry(Rcac.publicKeyOfTlv(ca.rootCert), 1)]);
        expect(await node.operationalMdnsInstanceName()).match(/\._matter\._tcp\.local$/);
    });

    it("reports an interaction status it cannot name rather than folding it into FAILURE", async () => {
        const { node } = await commissioned();
        const path = { endpoint: 1, cluster: 6, attribute: 0 };

        // A verbose-format build renders a code matter.js has no name for like this; collapsing it to
        // FAILURE would silently defeat a spec-negative TC asserting on the real code
        fake.reply = () => ({ results: [{ error: "Deprecated82" }], status: 1 });
        expect(StatusResponseError.of(await rejectionOf(node.readAttribute(path)))?.code).equal(0x82);

        fake.reply = () => ({ results: [{ error: "INVALID_TRANSPORT_TYPE" }], status: 1 });
        expect(StatusResponseError.of(await rejectionOf(node.readAttribute(path)))?.code).equal(0xd1);

        // WRITE_IGNORED is chip-internal and outside the specification, so matter.js names no such status
        fake.reply = () => ({ results: [{ error: "WRITE_IGNORED" }], status: 1 });
        expect(StatusResponseError.of(await rejectionOf(node.readAttribute(path)))?.code).equal(0xf0);

        // StatusName renders every code outside chip's own list this way, which is what a matter.js
        // device's UnsupportedNode, TermsAndConditionsChanged or MaintenanceRequired arrives as: the
        // code is already gone, so the name is all this can report — but report it, it must
        fake.reply = () => ({ results: [{ error: "Unallocated" }], status: 1 });
        const unmapped = await rejectionOf(node.readAttribute(path));
        expect(unmapped).instanceOf(ChipToolUnmappedStatusError);
        expect(String(unmapped)).contains("Unallocated");
    });

    it("returns a wildcard read's data even when one path's status is one chip could not name", async () => {
        const { node } = await commissioned();

        fake.reply = () => ({
            results: [
                {
                    clusterId: ON_OFF.id,
                    endpointId: 1,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    dataVersion: 3,
                    value: true,
                },
                {
                    clusterId: ON_OFF.id,
                    endpointId: 2,
                    attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                    error: "Unallocated",
                },
            ],
            status: 1,
        });

        expect(await node.readAttribute({ cluster: ON_OFF.id })).deep.equal([
            { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id, value: true, version: 3 },
        ]);
    });

    it("reports the bare failure marker as a chip-tool command error, never as an interaction Failure", async () => {
        const { ref, node } = await commissioned();
        const path = { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id };

        // chip-tool appends the bare marker for any non-zero exit — a discovery or CASE failure, a
        // command timeout, an argument-parse error — so nothing behind it says the device answered
        // Failure, and a spec-negative step asserting Failure must not pass on it
        fake.reply = () => ({ status: 1 });

        const operations: Array<[string, () => Promise<unknown>]> = [
            ["readAttribute", () => node.readAttribute(path)],
            ["readAttributes", () => node.readAttributes([path])],
            ["writeAttribute", () => node.writeAttribute(path, "a-label")],
            ["writeAttributes", () => node.writeAttributes([{ path, value: "a-label" }])],
            ["invoke", () => node.invoke("OnOff", "on", {}, 1)],
        ];

        for (const [operation, invoke] of operations) {
            const failure = await rejectionOf(invoke());
            expect(failure, operation).instanceOf(ChipToolCommandError);
            expect(failure, operation).not.instanceOf(StatusResponseError);
        }

        expect(fake.commands.length).equal(operations.length);
        expect(fake.commands[fake.commands.length - 1]).equal(`any command-by-id 0x6 0x1 {} ${ref} 1`);
    });

    it("reports a pathless status the device could have answered, and a bare pathless Failure as neither", async () => {
        const { node } = await commissioned();
        const path = { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: VENDOR_ID.id };

        // `ReportCommand::OnError` and its write and invoke siblings hand a raw CHIP_ERROR to
        // `RemoteDataModelLogger::LogErrorAsJSON`, where `ClusterStatusCode(CHIP_ERROR)` maps a
        // response timeout, a send failure or a dropped session to plain Failure too, so a bare
        // pathless FAILURE is no evidence the device answered anything
        fake.reply = () => ({ results: [{ error: "FAILURE" }], status: 1 });
        const ambiguous = await rejectionOf(node.readAttribute(path));
        expect(ambiguous).instanceOf(ChipToolCommandError);
        expect(ambiguous).not.instanceOf(StatusResponseError);

        // Only the IM global-status part of a CHIP_ERROR yields a status other than Failure
        fake.reply = () => ({ results: [{ error: "UNSUPPORTED_ACCESS" }], status: 1 });
        expect(StatusResponseError.of(await rejectionOf(node.readAttribute(path)))?.code).equal(
            Status.UnsupportedAccess,
        );

        // ...and only its IM cluster-status part yields a cluster code, which is how a device's
        // cluster-specific answer to an invoke reaches chip-tool's non-extendable CommandSender
        // callback (`CommandSender::ProcessInvokeResponseIB`)
        fake.reply = () => ({ results: [{ error: "FAILURE", clusterError: 3 }], status: 1 });
        const clusterSpecific = StatusResponseError.of(await rejectionOf(node.invoke("OnOff", "on", {}, 1)));
        expect(clusterSpecific?.code).equal(Status.Failure);
        expect(clusterSpecific?.clusterCode).equal(3);
    });

    it("rejects an enhanced window whose reply logged no pairing code", async () => {
        const { node } = await commissioned();

        fake.reply = () => ({ logs: ["[1755000000.000][1:1] CHIP:CTL: Successfully opened pairing window"] });

        expect(await rejectionOf(node.openCommissioningWindow({ timeout: 180, enhanced: true }))).instanceOf(
            InternalError,
        );
    });

    it("opens a basic window without needing a pairing code", async () => {
        const { node } = await commissioned();

        fake.reply = () => ({ logs: [] });

        expect(await node.openCommissioningWindow({ timeout: 180, enhanced: false })).deep.equal({});
        // chip-tool ignores the discriminator for a basic window, so it must not consume one
        expect(fake.commands[0]).equal(`pairing open-commissioning-window ${FIRST_NODE} 0 180 1000 0`);
    });

    it("derives the operational mDNS instance name from the fabric the node reports for this session", async () => {
        const started = await start();
        const ref = await started.commission({ passcode: 20202021, discriminator: 3840 });
        const node = started.node(ref);
        fake.commands.splice(0);
        const crypto = Environment.default.get(Crypto);
        const ca = await CertificateAuthority.create(crypto);
        const rootPublicKey = Rcac.publicKeyOfTlv(ca.rootCert);

        // A fabric id no commissioner-name mapping produces for this adapter: the name must come from
        // the descriptor the node reports, which is the only account of the fabric a command ran on
        const fabricId = 2;
        fake.reply = () => fabricsReply([fabricEntry(rootPublicKey, fabricId)]);

        const expected = getOperationalDeviceQname(
            await GlobalFabricId.compute(crypto, FabricId(fabricId), rootPublicKey),
            NodeId(ref),
        );

        expect(await node.operationalMdnsInstanceName()).equal(expected);
        // Fabric-filtered, so the one entry that comes back is the accessing fabric's own
        expect(fake.commands).deep.equal([`any read-by-id 0x3e 0x1 ${ref} 0`]);

        // A node's fabric cannot change, so concurrent and later callers must reuse one derivation
        // rather than each issuing the read again
        const second = node.operationalMdnsInstanceName();
        const third = started.node(ref).operationalMdnsInstanceName();
        expect(await second).equal(expected);
        expect(await third).equal(expected);
        expect(fake.commands.length).equal(1);

        // Another node of the same adapter answers for its own session rather than inheriting this one
        const secondRef = await started.commission({ passcode: 20202021, discriminator: 3840 });
        expect(await started.node(secondRef).operationalMdnsInstanceName()).equal(
            getOperationalDeviceQname(
                await GlobalFabricId.compute(crypto, FabricId(fabricId), rootPublicKey),
                NodeId(secondRef),
            ),
        );
        expect(fake.commands[fake.commands.length - 1]).equal(`any read-by-id 0x3e 0x1 ${secondRef} 0`);
    });

    it("rejects an instance name the reported fabrics cannot decide", async () => {
        const { node } = await commissioned();
        const crypto = Environment.default.get(Crypto);
        const rootPublicKey = Rcac.publicKeyOfTlv((await CertificateAuthority.create(crypto)).rootCert);

        // Neither an empty list nor one the device did not filter says which fabric this controller
        // acts on, and a guessed compressed id would attribute someone else's SRV record to this node
        fake.reply = () => fabricsReply([]);
        expect(await rejectionOf(node.operationalMdnsInstanceName())).instanceOf(UnexpectedDataError);

        fake.reply = () => fabricsReply([fabricEntry(rootPublicKey, 1, 1), fabricEntry(rootPublicKey, 2, 2)]);
        expect(await rejectionOf(node.operationalMdnsInstanceName())).instanceOf(UnexpectedDataError);

        // Nor does a descriptor missing the fields the compressed id is computed from
        fake.reply = () =>
            fabricsReply([{ [fabricField("rootPublicKey")]: `base64:${Bytes.toBase64(rootPublicKey)}` }]);
        expect(await rejectionOf(node.operationalMdnsInstanceName())).instanceOf(UnexpectedDataError);
    });

    describe("events", () => {
        const EVENT_PATH = { endpoint: 0, cluster: BASIC_INFORMATION.id, event: START_UP.id };
        const INTERVALS = { minIntervalFloorSeconds: 1, maxIntervalCeilingSeconds: 10 };

        /** An event of the shape `RemoteDataModelLogger::LogEventAsJSON` emits. */
        function event(eventNumber: number, softwareVersion: number) {
            return {
                clusterId: BASIC_INFORMATION.id,
                endpointId: 0,
                eventId: requireId(START_UP.id, "startUp"),
                eventNumber,
                value: { softwareVersion },
            };
        }

        it("reads events through read-event-by-id and decodes them through the model", async () => {
            const { ref, node } = await commissioned();

            fake.reply = () => ({ results: [event(4, 1)] });

            expect(await node.readEvents([EVENT_PATH])).deep.equal([
                {
                    endpoint: 0,
                    cluster: BASIC_INFORMATION.id,
                    event: START_UP.id,
                    eventNumber: 4n,
                    value: { softwareVersion: 1 },
                },
            ]);
            expect(fake.commands).deep.equal([`any read-event-by-id 0x28 0x0 ${ref} 0`]);
        });

        it("wildcards every path segment the caller left out", async () => {
            const { ref, node } = await commissioned();

            fake.reply = () => ({ results: [] });

            expect(await node.readEvents([{ cluster: BASIC_INFORMATION.id }])).deep.equal([]);
            expect(fake.commands).deep.equal([`any read-event-by-id 0x28 0xffffffff ${ref} 0xffff`]);
        });

        it("passes a non-default fabric filter and an event-number filter through", async () => {
            const { ref, node } = await commissioned();

            fake.reply = () => ({ results: [] });

            await node.readEvents([EVENT_PATH], { fabricFiltered: false, minEventNumber: 7n });
            expect(fake.commands).deep.equal([
                `any read-event-by-id 0x28 0x0 ${ref} 0 --fabric-filtered false --event-min 7`,
            ]);
        });

        it("rejects a concrete event read the device answered with a status", async () => {
            const { node } = await commissioned();

            fake.reply = () => ({
                results: [
                    {
                        clusterId: BASIC_INFORMATION.id,
                        endpointId: 0,
                        eventId: requireId(START_UP.id, "startUp"),
                        error: "UNSUPPORTED_ACCESS",
                    },
                ],
            });

            const rejection = await rejectionOf(node.readEvents([EVENT_PATH]));
            expect(rejection).instanceOf(StatusResponseError);
            expect((rejection as StatusResponseError).code).equal(Status.UnsupportedAccess);
        });

        it("fails a read whose event chip-tool reported without an event number", async () => {
            const { node } = await commissioned();

            fake.reply = () => ({
                results: [
                    {
                        clusterId: BASIC_INFORMATION.id,
                        endpointId: 0,
                        eventId: requireId(START_UP.id, "startUp"),
                        value: { softwareVersion: 1 },
                    },
                ],
            });

            expect(await rejectionOf(node.readEvents([EVENT_PATH]))).instanceOf(UnexpectedDataError);
        });

        it("returns the establishing report's events and hands later ones to onUpdate", async () => {
            const { ref, node } = await commissioned();
            const updates = new Array<unknown>();

            fake.reply = () => ({ results: [event(4, 1)] });
            const priming = await node.subscribeEvents([EVENT_PATH], {
                ...INTERVALS,
                onUpdate: report => updates.push(report),
            });

            expect(priming).deep.equal([
                {
                    endpoint: 0,
                    cluster: BASIC_INFORMATION.id,
                    event: START_UP.id,
                    eventNumber: 4n,
                    value: { softwareVersion: 1 },
                },
            ]);
            expect(updates).deep.equal([]);
            expect(fake.commands).deep.equal([
                `any subscribe-event-by-id 0x28 0x0 1 10 ${ref} 0 --keepSubscriptions true`,
            ]);

            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");
            expect(fake.pushReport(event(5, 2))).equal("sent");
            await waitFor(() => updates.length === 1, "the event report to reach onUpdate");

            expect(updates).deep.equal([
                {
                    endpoint: 0,
                    cluster: BASIC_INFORMATION.id,
                    event: START_UP.id,
                    eventNumber: 5n,
                    value: { softwareVersion: 2 },
                },
            ]);
        });

        it("rejects a subscribe whose own event path the device rejected, and registers nothing", async () => {
            const { node } = await commissioned();
            const abandoned = new Array<unknown>();

            function rejectedPath(status: number) {
                return {
                    results: [
                        {
                            clusterId: BASIC_INFORMATION.id,
                            endpointId: 0,
                            eventId: requireId(START_UP.id, "startUp"),
                            error: "UNSUPPORTED_ACCESS",
                        },
                    ],
                    status,
                };
            }

            // As for attributes: `SubscribeCommand::OnSubscriptionEstablished` sets a zero exit status,
            // so a device that answers the subscribed path with a status and establishes anyway leaves
            // the path status as the reply's only account of itself
            for (const status of [1, 0]) {
                fake.reply = () => rejectedPath(status);

                const failure = await rejectionOf(
                    node.subscribeEvents([EVENT_PATH], { ...INTERVALS, onUpdate: report => abandoned.push(report) }),
                );
                expect(failure, `exit status ${status}`).instanceOf(StatusResponseError);
                expect(StatusResponseError.of(failure)?.code, `exit status ${status}`).equal(Status.UnsupportedAccess);
            }

            await delay(50);
            expect(fake.armings).deep.equal([]);
            expect(fake.pushReport(event(6, 3))).equal("dropped");
            expect(abandoned).deep.equal([]);

            // A later subscription parks a frame, so a report on the refused path now reaches whoever
            // claims it — nobody, unless the failed subscribe registered itself anyway
            const claimed = new Array<unknown>();
            fake.reply = () => ({ results: [] });
            await node.subscribeEvents([{ endpoint: 1, cluster: BOOLEAN_STATE.id, event: STATE_CHANGE.id }], {
                ...INTERVALS,
                onUpdate: report => claimed.push(report),
            });
            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

            expect(fake.pushReport(event(7, 4))).equal("sent");
            await delay(50);
            expect(abandoned).deep.equal([]);
            expect(claimed).deep.equal([]);
        });

        it("does not hand an event of another path to a live subscription", async () => {
            const { node } = await commissioned();
            const updates = new Array<unknown>();

            fake.reply = () => ({ results: [] });
            await node.subscribeEvents([EVENT_PATH], { ...INTERVALS, onUpdate: report => updates.push(report) });
            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

            expect(fake.pushReport({ ...event(6, 3), endpointId: 1 })).equal("sent");
            await delay(50);

            expect(updates).deep.equal([]);
        });
    });

    describe("batched invoke", () => {
        it("refuses a batch, since chip-tool sends one command per request", async () => {
            const { node } = await commissioned();

            const rejection = await rejectionOf(
                node.invokeBatch([
                    { cluster: requireId(ON_OFF.id, "OnOff"), command: "on", endpoint: 1 },
                    { cluster: requireId(ON_OFF.id, "OnOff"), command: "off", endpoint: 1 },
                ]),
            );

            expect(rejection).instanceOf(UnsupportedByControllerError);
            expect(fake.commands).deep.equal([]);
        });
    });

    describe("custom clusters", () => {
        it("invokes a command of a cluster outside the standard model", async () => {
            registerCertCustomCluster(FaultInjectionCluster);
            const { ref, node } = await commissioned();

            fake.reply = () => ({ results: [] });
            await node.invoke(
                0xfff1fc06,
                "failAtFault",
                { type: 3, id: 12, numCallsToSkip: 3, numCallsToFail: 1, takeMutex: false },
                0,
            );

            expect(fake.commands).deep.equal([
                `any command-by-id 0xfff1fc06 0x0 {"0":3,"1":12,"2":3,"3":1,"4":false} ${ref} 0`,
            ]);
        });

        it("refuses a command of a cluster nobody registered", async () => {
            const { node } = await commissioned();

            expect(await rejectionOf(node.invoke(0xfff1fc07, "failAtFault", {}, 0))).instanceOf(ImplementationError);
            expect(fake.commands).deep.equal([]);
        });
    });

    describe("timed interactions", () => {
        it("asks chip-tool for a timed invoke and a timed write", async () => {
            const { ref, node } = await commissioned();

            fake.reply = () => ({ results: [] });
            await node.invoke(requireId(ON_OFF.id, "OnOff"), "on", undefined, 1, { timedInteractionTimeoutMs: 200 });
            await node.writeAttribute({ endpoint: 1, cluster: LEVEL_CONTROL.id, attribute: ON_LEVEL.id }, 5, {
                timedInteractionTimeoutMs: 200,
            });

            expect(fake.commands).deep.equal([
                `any command-by-id 0x6 0x1 {} ${ref} 1 --timedInteractionTimeoutMs 200`,
                `any write-by-id 0x8 0x11 5 ${ref} 1 --timedInteractionTimeoutMs 200`,
            ]);
        });

        it("sends nothing about timing for an interaction that asked for none", async () => {
            const { ref, node } = await commissioned();

            fake.reply = () => ({ results: [] });
            await node.invoke(requireId(ON_OFF.id, "OnOff"), "on", undefined, 1);

            expect(fake.commands).deep.equal([`any command-by-id 0x6 0x1 {} ${ref} 1`]);
        });

        it("refuses a timeout the wire cannot carry, before issuing anything", async () => {
            const { node } = await commissioned();

            for (const timedInteractionTimeoutMs of [200.5, -1, 0x10000]) {
                expect(
                    await rejectionOf(
                        node.invoke(requireId(ON_OFF.id, "OnOff"), "on", undefined, 1, { timedInteractionTimeoutMs }),
                    ),
                    `timeout ${timedInteractionTimeoutMs}`,
                ).instanceOf(ImplementationError);
            }

            expect(fake.commands).deep.equal([]);
        });
    });

    describe("subscribe", () => {
        const PATH = { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id };
        const INTERVALS = { minIntervalFloorSeconds: 1, maxIntervalCeilingSeconds: 10 };

        /** An attribute report of the shape `RemoteDataModelLogger::LogAttributeAsJSON` emits. */
        function report(endpoint: number, value: boolean, dataVersion?: number) {
            return {
                clusterId: ON_OFF.id,
                endpointId: endpoint,
                attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                dataVersion,
                value,
            };
        }

        function vendorIdValue() {
            return {
                clusterId: BASIC_INFORMATION.id,
                endpointId: 0,
                attributeId: requireId(VENDOR_ID.id, "vendorId"),
                value: 0xfff1,
            };
        }

        const VENDOR_ID_PATH = { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: VENDOR_ID.id };

        it("returns the establishing reply's value without reporting it as an update", async () => {
            const { ref, node } = await commissioned();
            const updates = new Array<unknown>();

            fake.reply = () => ({ results: [report(1, true, 5)] });

            expect(await node.subscribe(PATH, { ...INTERVALS, onUpdate: value => updates.push(value) })).equal(true);
            expect(updates).deep.equal([]);
            expect(fake.commands).deep.equal([`any subscribe-by-id 0x6 0x0 1 10 ${ref} 1 --keepSubscriptions true`]);
        });

        it("returns the establishing entries for a wildcard subscribe", async () => {
            const { ref, node } = await commissioned();
            const updates = new Array<unknown>();

            fake.reply = () => ({ results: [report(1, true, 3), report(2, false, 4)] });

            expect(
                await node.subscribe({ cluster: ON_OFF.id }, { ...INTERVALS, onUpdate: value => updates.push(value) }),
            ).deep.equal([
                { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id, value: true, version: 3 },
                { endpoint: 2, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id, value: false, version: 4 },
            ]);
            expect(updates).deep.equal([]);
            expect(fake.commands).deep.equal([
                `any subscribe-by-id 0x6 0xffffffff 1 10 ${ref} 0xffff --keepSubscriptions true`,
            ]);
        });

        it("hands each report that arrives after establishment to onUpdate", async () => {
            const { node } = await commissioned();
            const updates = new Array<unknown>();

            fake.reply = () => ({ results: [report(1, true)] });
            await node.subscribe(PATH, { ...INTERVALS, onUpdate: value => updates.push(value) });

            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");
            expect(fake.pushReport(report(1, false))).equal("sent");
            await waitFor(() => updates.length === 1, "the first report to reach onUpdate");

            // chip-tool disarms its result slot with the frame it answers a report through, so a
            // second report only arrives if the pump parked another frame
            await waitFor(() => fake.armings.length === 2, "the adapter to park another report frame");
            expect(fake.pushReport(report(1, true))).equal("sent");
            await waitFor(() => updates.length === 2, "the second report to reach onUpdate");

            expect(updates).deep.equal([false, true]);
        });

        it("serves a command while a subscription is live, and parks again afterwards", async () => {
            const { node } = await commissioned();
            const updates = new Array<unknown>();

            fake.reply = () => ({ results: [report(1, true)] });
            await node.subscribe(PATH, { ...INTERVALS, onUpdate: value => updates.push(value) });
            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

            fake.reply = () => ({ results: [vendorIdValue()] });
            expect(await node.readAttribute(VENDOR_ID_PATH)).equal(0xfff1);

            await waitFor(() => fake.armings.length === 2, "the adapter to park a report frame after the command");
            expect(fake.pushReport(report(1, false))).equal("sent");
            await waitFor(() => updates.length === 1, "the report to reach onUpdate");
        });

        it("routes a report riding along in a command's reply to onUpdate, not to the command's caller", async () => {
            const { node } = await commissioned();
            const updates = new Array<unknown>();

            fake.reply = () => ({ results: [report(1, true)] });
            await node.subscribe(PATH, { ...INTERVALS, onUpdate: value => updates.push(value) });
            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

            // chip-tool appends a report that arrives while a command is in flight to that command's
            // own results
            fake.reply = () => ({ results: [report(1, false), vendorIdValue()] });
            expect(await node.readAttribute(VENDOR_ID_PATH)).equal(0xfff1);

            expect(updates).deep.equal([false]);
        });

        it("parks nothing, and claims nothing, for a subscribe that never established", async () => {
            const { node } = await commissioned();
            const abandoned = new Array<unknown>();

            fake.reply = () => ({ status: 1 });
            expect(
                await rejectionOf(node.subscribe(PATH, { ...INTERVALS, onUpdate: value => abandoned.push(value) })),
            ).instanceOf(ChipToolCommandError);

            await delay(50);
            expect(fake.armings).deep.equal([]);
            expect(fake.pushReport(report(1, false))).equal("dropped");

            // A later subscription of the same path must not deliver to the callback of the one that
            // never established
            const updates = new Array<unknown>();
            fake.reply = () => ({ results: [report(1, true)] });
            await node.subscribe(PATH, { ...INTERVALS, onUpdate: value => updates.push(value) });

            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");
            expect(fake.pushReport(report(1, false))).equal("sent");
            await waitFor(() => updates.length === 1, "the report to reach onUpdate");

            expect(abandoned).deep.equal([]);
        });

        it("rejects a subscribe whose own path the device rejected, and registers nothing", async () => {
            const { node } = await commissioned();
            const abandoned = new Array<unknown>();

            function rejectedPath(status: number) {
                return {
                    results: [
                        {
                            clusterId: ON_OFF.id,
                            endpointId: 1,
                            attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                            error: "UNSUPPORTED_ATTRIBUTE",
                        },
                    ],
                    status,
                };
            }

            // `SubscribeCommand::OnSubscriptionEstablished` sets a zero exit status, so a device that
            // answers the subscribed path with a status and establishes anyway leaves the path status
            // as the reply's only account of itself
            for (const status of [1, 0]) {
                fake.reply = () => rejectedPath(status);

                const failure = await rejectionOf(
                    node.subscribe(PATH, { ...INTERVALS, onUpdate: value => abandoned.push(value) }),
                );
                expect(failure, `exit status ${status}`).instanceOf(StatusResponseError);
                expect(StatusResponseError.of(failure)?.code, `exit status ${status}`).equal(
                    Status.UnsupportedAttribute,
                );
            }

            // A subscription the device refused has no reports to pump, and a later report on its path
            // belongs to nobody
            await delay(50);
            expect(fake.armings).deep.equal([]);
            expect(fake.pushReport(report(1, false))).equal("dropped");
            expect(abandoned).deep.equal([]);
        });

        it("subscribes a wildcard the device rejected one path of, whose status is a per-item one", async () => {
            const { node } = await commissioned();

            fake.reply = () => ({
                results: [
                    report(1, true, 3),
                    {
                        clusterId: ON_OFF.id,
                        endpointId: 2,
                        attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                        error: "UNSUPPORTED_ACCESS",
                    },
                ],
                status: 1,
            });

            expect(await node.subscribe({ cluster: ON_OFF.id }, INTERVALS)).deep.equal([
                { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id, value: true, version: 3 },
            ]);
            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");
        });

        describe("a failed command whose reply carries a report", () => {
            /** A live subscription plus a reply that fails while carrying nothing but its report. */
            async function subscribedThenFailing() {
                const { ref, node } = await commissioned();

                fake.reply = () => ({ results: [report(1, true)] });
                await node.subscribe(PATH, INTERVALS);
                await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

                // chip-tool records a report into whatever command owns its result slot, so a failed
                // command's whole account of itself can be the exit marker beside someone else's
                // report — and that report is no evidence the command did anything
                fake.reply = () => ({ results: [report(1, false)], status: 1 });
                return { ref, node };
            }

            it("fails the decommission TC-IDM-4.1 cleans up with, rather than reporting it clean", async () => {
                const { ref, node } = await subscribedThenFailing();

                expect(await rejectionOf(node.decommission())).instanceOf(ChipToolCommandError);
                expect(fake.commands[fake.commands.length - 1]).equal(`pairing unpair ${ref}`);
            });

            it("does not fabricate a success status for every path of a write", async () => {
                const { node } = await subscribedThenFailing();

                expect(
                    await rejectionOf(
                        node.writeAttributes([
                            {
                                path: { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id },
                                value: "a-label",
                            },
                        ]),
                    ),
                ).instanceOf(ChipToolCommandError);
            });

            it("fails a read, whose own answer the report is not", async () => {
                const { node } = await subscribedThenFailing();

                expect(await rejectionOf(node.readAttribute(VENDOR_ID_PATH))).instanceOf(ChipToolCommandError);
            });

            it("fails a write to the subscribed path itself, which TC-IDM-4.1 performs", async () => {
                const { node } = await subscribedThenFailing();

                // The write asked about this path, so the report on it is the command's own — but a
                // value says nothing about why the command exited non-zero, and treating it as the
                // failure's account would report a failed write as a success
                expect(await rejectionOf(node.writeAttribute(PATH, true))).instanceOf(ChipToolCommandError);
                expect(await rejectionOf(node.writeAttributes([{ path: PATH, value: true }]))).instanceOf(
                    ChipToolCommandError,
                );
            });

            it("fails a read of the subscribed path itself, whose value the report is not", async () => {
                const { node } = await subscribedThenFailing();

                expect(await rejectionOf(node.readAttribute(PATH))).instanceOf(ChipToolCommandError);
            });

            it("reports the device's own status for a write to a path a subscription also covers", async () => {
                const { node } = await commissioned();

                fake.reply = () => ({ results: [report(1, true)] });
                await node.subscribe(PATH, INTERVALS);
                await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

                // The write asked about this path, so the status on it is the write's own account of
                // the non-zero exit however many subscriptions happen to cover the path too
                fake.reply = () => ({
                    results: [
                        {
                            clusterId: ON_OFF.id,
                            endpointId: 1,
                            attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                            error: Status.ConstraintError,
                        },
                    ],
                    status: 1,
                });

                const failure = await rejectionOf(node.writeAttribute(PATH, true));
                expect(failure).instanceOf(StatusResponseError);
                expect(StatusResponseError.of(failure)?.code).equal(Status.ConstraintError);
            });

            it("returns a wildcard read's data while a wildcard subscription covers the same cluster", async () => {
                const { node } = await commissioned();

                fake.reply = () => ({ results: [report(1, true, 1)] });
                await node.subscribe({ cluster: ON_OFF.id }, INTERVALS);
                await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

                fake.reply = () => ({
                    results: [
                        report(1, true, 3),
                        {
                            clusterId: ON_OFF.id,
                            endpointId: 2,
                            attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                            error: "UNSUPPORTED_ATTRIBUTE",
                        },
                    ],
                    status: 1,
                });

                expect(await node.readAttribute({ cluster: ON_OFF.id })).deep.equal([
                    { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id, value: true, version: 3 },
                ]);
            });

            it("still drops the marker when the reply carries an entry of the command's own", async () => {
                const { node } = await subscribedThenFailing();

                // A wildcard read's per-path status is the command's own account of its non-zero exit,
                // so here the marker is genuinely redundant and the read must not fail on it
                fake.reply = () => ({
                    results: [
                        report(1, false, 9),
                        {
                            clusterId: ON_OFF.id,
                            endpointId: 2,
                            attributeId: requireId(ON_OFF_ATTRIBUTE.id, "onOff"),
                            error: "UNSUPPORTED_ATTRIBUTE",
                        },
                    ],
                    status: 1,
                });

                expect(await node.readAttribute({ cluster: ON_OFF.id })).deep.equal([
                    { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id, value: false, version: 9 },
                ]);
            });
        });

        it("logs a report no live subscription claims, uint64 value and all", async () => {
            const { node } = await commissioned();
            const updates = new Array<unknown>();

            fake.reply = () => ({ results: [report(1, true)] });
            await node.subscribe(PATH, { ...INTERVALS, onUpdate: value => updates.push(value) });
            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

            // A uint64 attribute value decodes to a bigint, which JSON.stringify refuses outright
            const upTime = 2 ** 63;
            expect(fake.pushReport({ clusterId: 0x33, endpointId: 0, attributeId: 2, value: upTime })).equal("sent");

            await waitFor(
                () => adapter?.log.lines.some(line => line.text.includes("Unattributed")) === true,
                "the unclaimed report to reach the controller log",
            );
            const line = adapter?.log.lines.find(candidate => candidate.text.includes("Unattributed"))?.text;
            expect(line).contains(String(upTime));
            expect(updates).deep.equal([]);
        });

        it("leaves no report frame outstanding when it closes", async () => {
            const started = await start();
            const ref = await started.commission({ passcode: 20202021, discriminator: 3840 });

            fake.reply = () => ({ results: [report(1, true)] });
            await started.node(ref).subscribe(PATH, INTERVALS);
            await waitFor(() => fake.armings.length === 1, "the adapter to park a report frame");

            await started.close();
            adapter = undefined;

            const frames = fake.frames.length;
            await delay(50);
            expect(fake.closedSockets).equal(1);
            expect(fake.frames.length).equal(frames);
        });
    });

    it("decommissions through pairing unpair", async () => {
        const { ref, node } = await commissioned();

        fake.reply = () => ({ results: [] });

        await node.decommission();
        expect(fake.commands).deep.equal([`pairing unpair ${ref}`]);
    });

    it("closes cleanly after a failed start, removing its storage directory", async () => {
        // An app dir with no chip-tool in it: start() creates the storage directory, then the spawn
        // fails, so close() has a partially started adapter to clean up
        const emptyDir = await mkdtemp(join(tmpdir(), "matter-chip-tool-adapter-empty-"));
        env.MATTER_CERT_APP_DIR = emptyDir;

        try {
            const started = new ChipToolControllerAdapter("dut");
            adapter = started;
            await rejectionOf(started.start());

            const storageDirectory = started.storageDirectory;
            if (storageDirectory === undefined) {
                throw new InternalError("A failed start() left no storage directory to clean up");
            }
            expect(existsSync(storageDirectory)).equal(true);

            await started.close();
            adapter = undefined;

            expect(existsSync(storageDirectory)).equal(false);
            expect(started.storageDirectory).equal(undefined);
            // The spawn failure, not a generic Error: a closed adapter must still say why it is unusable
            expect(await rejectionOf(started.commission({ passcode: 1, discriminator: 1 }))).instanceOf(
                ChipToolExitError,
            );
        } finally {
            await rm(emptyDir, { recursive: true, force: true });
        }
    });

    it("releases its commissioner identity when start() fails, and refuses to restart after close", async () => {
        const emptyDir = await mkdtemp(join(tmpdir(), "matter-chip-tool-adapter-empty-"));
        env.MATTER_CERT_APP_DIR = emptyDir;

        try {
            const failed = new ChipToolControllerAdapter("dut");
            adapter = failed;
            await rejectionOf(failed.start());

            // A caller that abandons an adapter whose start() threw must not strand one of the three
            // names for the rest of the process
            const next = new ChipToolControllerAdapter("th_cr2");
            try {
                expect(next.commissionerName).equal("alpha");
            } finally {
                await next.close();
            }

            await failed.close();
            adapter = undefined;
            expect(await rejectionOf(failed.start())).instanceOf(ImplementationError);
        } finally {
            await rm(emptyDir, { recursive: true, force: true });
        }

        // An adapter closed before it ever started has no client to refuse on, but its log queue is
        // already closed, so starting one would spawn a process whose output goes nowhere
        const neverStarted = new ChipToolControllerAdapter("dut");
        await neverStarted.close();
        expect(await rejectionOf(neverStarted.start())).instanceOf(ImplementationError);
        expect(fake.commands).deep.equal([]);
    });

    it("rejects use before start", async () => {
        const started = new ChipToolControllerAdapter("dut");
        adapter = started;

        expect(await rejectionOf(started.commission({ passcode: 1, discriminator: 1 }))).instanceOf(
            ImplementationError,
        );
    });

    it("hands each live adapter its own commissioner identity, and releases it on close", async () => {
        const first = new ChipToolControllerAdapter("dut");
        const second = new ChipToolControllerAdapter("th_cr2");
        const third = new ChipToolControllerAdapter("th_cr3");

        try {
            expect([first.commissionerName, second.commissionerName, third.commissionerName]).deep.equal([
                "alpha",
                "beta",
                "gamma",
            ]);
            expect(() => new ChipToolControllerAdapter("th_cr4")).to.throw(InternalError, /alpha, beta, gamma/);
        } finally {
            await third.close();
            await second.close();
            await first.close();
        }

        const reused = new ChipToolControllerAdapter("dut");
        try {
            expect(reused.commissionerName).equal("alpha");

            // A second close() of the adapter that held "alpha" before must not release it under the
            // one holding it now, which would hand two live adapters the same fabric id
            await first.close();

            const next = new ChipToolControllerAdapter("th_cr2");
            try {
                expect(next.commissionerName).equal("beta");
            } finally {
                await next.close();
            }
        } finally {
            await reused.close();
        }
    });
});
