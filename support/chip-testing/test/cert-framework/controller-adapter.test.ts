/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, InternalError } from "@matter/main";
import { QrPairingCodeCodec, Status, StatusResponseError } from "@matter/main/types";
import { Matter } from "@matter/model";
import { PicsExpression, PicsFile } from "@matter/testing";
import {
    controllerPicsOverridesFor,
    createControllerAdapter,
    LineQueue,
    LogFollower,
    registerControllerAdapterFactory,
    resetControllerAdapterFactoryForTesting,
} from "@matter/testing";
import type { AttributePathSpec, CertNodeApi, ControllerAdapter, EventReadEntry } from "@matter/testing";
import { expect } from "chai";
import { env } from "node:process";
import { AllClustersTestInstance } from "../../src/AllClustersTestInstance.js";
import { CHIP_TOOL_CONTROLLER_PICS, ChipToolControllerAdapter } from "../../src/cert/ChipToolControllerAdapter.js";
import { InProcessControllerAdapter, MATTERJS_CONTROLLER_PICS } from "../../src/cert/InProcessControllerAdapter.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import { manualPairingCode } from "../cert/tc-dd-support.js";

function fakeControllerAdapter(id: string): ControllerAdapter {
    return {
        id,
        log: new LogFollower(new LineQueue(), id),
        async start() {},
        async close() {},
        async commission() {
            throw new InternalError("not used in this test");
        },
        async parseQrPayload() {
            throw new InternalError("not used in this test");
        },
        async parseManualPairingCode(): Promise<never> {
            throw new InternalError("not used in this test");
        },
        node() {
            throw new InternalError("not used in this test");
        },
    };
}

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BOOLEAN_STATE = Matter.clusters.require("BooleanState");
const ON_OFF = Matter.clusters.require("OnOff");
const IDENTIFY = Matter.clusters.require("Identify");
const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const VENDOR_ID_ATTRIBUTE = BASIC_INFORMATION.attributes.require("vendorId");
const ON_OFF_ATTRIBUTE = ON_OFF.attributes.require("onOff");
const NODE_LABEL_ATTRIBUTE = BASIC_INFORMATION.attributes.require("nodeLabel");
const FABRICS_ATTRIBUTE = OPERATIONAL_CREDENTIALS.attributes.require("fabrics");
const IDENTIFY_TIME_ATTRIBUTE = IDENTIFY.attributes.require("identifyTime");
const START_UP_EVENT = BASIC_INFORMATION.events.require("startUp");
const STATE_CHANGE_EVENT = BOOLEAN_STATE.events.require("stateChange");

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (e) {
        return e;
    }
    throw new InternalError("Expected the operation to reject but it resolved");
}

async function waitFor(condition: () => boolean) {
    const deadline = Date.now() + 5_000;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new InternalError("Timed out waiting for a subscription update");
        }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

/** The data version the peer reports for a path's cluster, read through a cluster-level (non-concrete) path. */
async function versionOf(node: CertNodeApi, path: AttributePathSpec) {
    const entries = await node.readAttribute({ endpoint: path.endpoint, cluster: path.cluster });
    if (!Array.isArray(entries)) {
        throw new InternalError("Expected a cluster-level read to return entries");
    }
    for (const entry of entries) {
        if (typeof entry === "object" && entry !== null && "version" in entry && typeof entry.version === "number") {
            return entry.version;
        }
    }
    throw new InternalError(`No data version reported for cluster ${path.cluster}`);
}

describe("InProcessControllerAdapter", () => {
    let device: AllClustersTestInstance;
    let adapter: InProcessControllerAdapter;

    beforeEach(async function () {
        this.timeout(20_000);

        device = new AllClustersTestInstance({
            domain: `controller-adapter-test-${Math.random().toString(36).slice(2)}`,
            commandPipeFactory: async () => {},
            discriminator: 3840,
            passcode: 20202021,
        });
        await device.initialize();
        await device.start();

        adapter = new InProcessControllerAdapter("dut");
        await adapter.start();
    });

    afterEach(async function () {
        this.timeout(20_000);

        await adapter?.close();
        await device?.close();
    });

    // Guards the regression the per-step flag exists to prevent: the bound is short enough to rule out a retry, so a
    // commissioning that expects to succeed has to fit inside it, discovery included. It does not prove the option
    // reaches commissioning — a healthy device commissions either way — only that requesting it breaks nothing.
    it("still commissions a healthy device when asked for a single handshake attempt", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({
            passcode: 20202021,
            discriminator: 3840,
            singleHandshakeAttempt: true,
        });

        await adapter.node(ref).decommission();
    });

    it("commissions from the device's own QR onboarding payload", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ qrPairingCode: device.commissioning.qrPairingCode });

        await adapter.node(ref).decommission();
    });

    it("reports the fields it reads out of a manual pairing code", async () => {
        const code = manualPairingCode({
            vidPidPresent: true,
            discriminator: device.commissioning.discriminator,
            passcode: device.commissioning.passcode,
            vendorId: 0xfff1,
            productId: 0x8001,
        });

        expect(await adapter.parseManualPairingCode(code)).deep.equal({
            shortDiscriminator: device.commissioning.discriminator >> 8,
            passcode: device.commissioning.passcode,
            vendorId: 0xfff1,
            productId: 0x8001,
        });
    });

    it("marks its own refusal of an onboarding payload, so a later failure cannot pass for one", async () => {
        // Version 2, which QrPairingCodeCodec rejects. matter.js raises UnexpectedDataError from the
        // commissioning flow too, so the refusal has to carry its own marker.
        const refusal = await rejectionOf(adapter.commission({ qrPairingCode: "MT:034J042C00KA0648G00" }));

        expect(refusal).instanceOf(OnboardingPayloadRefusedError);
        expect(await rejectionOf(adapter.parseQrPayload("MT:034J042C00KA0648G00"))).instanceOf(
            OnboardingPayloadRefusedError,
        );
    });

    it("reports the fields it reads out of an onboarding payload", async function () {
        const parsed = await adapter.parseQrPayload(device.commissioning.qrPairingCode);

        expect(parsed).deep.equal({
            version: 0,
            vendorId: 0xfff1,
            productId: 0x8001,
            flowType: 0,
            discoveryCapabilities: 0b100,
            discriminator: 3840,
            passcode: 20202021,
        });
    });

    it("refuses a concatenated onboarding payload, which names more than one device", async function () {
        const [payload] = QrPairingCodeCodec.decode(device.commissioning.qrPairingCode);

        await expect(adapter.commission({ qrPairingCode: QrPairingCodeCodec.encode([payload, payload]) })).rejectedWith(
            ImplementationError,
            /carries 2 payloads/,
        );
    });

    it("commissions, reads an attribute, invokes a command, and decommissions", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        const vendorId = await node.readAttribute({
            endpoint: 0,
            cluster: BASIC_INFORMATION.id,
            attribute: VENDOR_ID_ATTRIBUTE.id,
        });
        expect(vendorId).to.equal(0xfff1);

        await node.invoke("OnOff", "on", {}, 1);

        const onOffState = await node.readAttribute({
            endpoint: 1,
            cluster: ON_OFF.id,
            attribute: ON_OFF_ATTRIBUTE.id,
        });
        expect(onOffState).to.equal(true);

        await node.writeAttribute(
            { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL_ATTRIBUTE.id },
            "cert-adapter-test",
        );
        const nodeLabel = await node.readAttribute({
            endpoint: 0,
            cluster: BASIC_INFORMATION.id,
            attribute: NODE_LABEL_ATTRIBUTE.id,
        });
        expect(nodeLabel).to.equal("cert-adapter-test");

        const fabrics = await node.readAttribute(
            { endpoint: 0, cluster: OPERATIONAL_CREDENTIALS.id, attribute: FABRICS_ATTRIBUTE.id },
            { fabricFiltered: false },
        );
        expect(fabrics).to.have.lengthOf(1);

        const logLines = new Array<string>();
        for await (const line of adapter.log.follow()) {
            logLines.push(line);
            if (logLines.length >= 1) break;
        }
        expect(logLines.length).to.be.greaterThan(0);

        await node.decommission();
    });

    it("decommissions after subscribing, so the adapter's own subscription settings can't strand the node", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        const value = await node.subscribe(
            { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id },
            { minIntervalFloorSeconds: 1, maxIntervalCeilingSeconds: 10 },
        );
        expect(value).to.be.a("boolean");

        await node.decommission();
    });

    // Characterization: the rejection comes from the interaction layer, not from this adapter, so the
    // test guards the behavior rather than proving adapter code. It matters because
    // `ChipToolControllerAdapter` rejects the same case explicitly — a step that needs a subscription and
    // does not get one must fail identically on both controllers, or a difference between adapters reads
    // as an interop finding.
    it("rejects a concrete-path subscribe the device refused", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        // Endpoint 1 has no BasicInformation, so the device answers this path with a status
        const rejection = await rejectionOf(
            node.subscribe(
                { endpoint: 1, cluster: BASIC_INFORMATION.id, attribute: VENDOR_ID_ATTRIBUTE.id },
                { minIntervalFloorSeconds: 1, maxIntervalCeilingSeconds: 10 },
            ),
        );
        expect(rejection).to.be.instanceOf(StatusResponseError);

        await node.decommission();
    });

    it("throws a StatusResponseError when the device rejects an invoke", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        expect(await rejectionOf(node.invoke("OnOff", "on", {}, 0))).to.be.instanceOf(StatusResponseError);

        await node.decommission();
    });

    it("throws when the device rejects a write", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        expect(
            await rejectionOf(
                node.writeAttribute(
                    { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: VENDOR_ID_ATTRIBUTE.id },
                    1,
                ),
            ),
        ).to.be.instanceOf(Error);

        await node.decommission();
    });

    it("throws on a concrete read the device declines but tolerates statuses in a wildcard expansion", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        expect(
            await rejectionOf(node.readAttribute({ endpoint: 0, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id })),
        ).to.be.instanceOf(StatusResponseError);

        const wildcard = await node.readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION.id });
        expect(wildcard).to.be.an("array").that.is.not.empty;

        await node.decommission();
    });

    it("reports later changes as updates but not the seeding report", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        const updates = new Array<unknown>();
        const seed = await node.subscribe(
            { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id },
            { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10, onUpdate: value => updates.push(value) },
        );
        expect(seed).to.be.a("boolean");
        expect(updates).to.be.empty;

        await node.invoke("OnOff", "toggle", {}, 1);
        await waitFor(() => updates.length > 0);
        expect(updates).to.deep.equal([!seed]);

        await node.decommission();
    });

    it("reads an event the device recorded", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        const events = await node.readEvents([
            { endpoint: 0, cluster: BASIC_INFORMATION.id, event: START_UP_EVENT.id },
        ]);

        expect(events).to.not.be.empty;
        for (const event of events) {
            expect(event.endpoint).equal(0);
            expect(event.cluster).equal(BASIC_INFORMATION.id);
            expect(event.event).equal(START_UP_EVENT.id);
            expect(event.eventNumber).to.be.a("bigint");
        }

        await node.decommission();
    });

    it("reads no event, rather than failing, for a path the device has no record of", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        expect(await node.readEvents([{ endpoint: 1, cluster: BOOLEAN_STATE.id, event: STATE_CHANGE_EVENT.id }])).to.be
            .empty;

        await node.decommission();
    });

    it("rejects a concrete-path event read the device refused", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        // Endpoint 1 has no BasicInformation, so the device answers this path with a status
        const rejection = await rejectionOf(
            node.readEvents([{ endpoint: 1, cluster: BASIC_INFORMATION.id, event: START_UP_EVENT.id }]),
        );
        expect(rejection).to.be.instanceOf(StatusResponseError);

        await node.decommission();
    });

    it("rejects a multi-path read whose concrete path the device refused", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        // The first path the device answers, so the read as a whole succeeds and only this one's status
        // says the second went unanswered — endpoint 1 has no BasicInformation
        const rejection = await rejectionOf(
            node.readAttributes([
                { endpoint: 1, cluster: ON_OFF.id, attribute: ON_OFF_ATTRIBUTE.id },
                { endpoint: 1, cluster: BASIC_INFORMATION.id, attribute: VENDOR_ID_ATTRIBUTE.id },
            ]),
        );
        expect(rejection).to.be.instanceOf(StatusResponseError);
        expect(StatusResponseError.of(rejection)?.code).equal(Status.UnsupportedCluster);

        await node.decommission();
    });

    it("rejects a multi-path event subscribe whose concrete path the device refused", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        // The subscription the device did establish cannot be revoked, so its reports must not reach the
        // step that already failed on this rejection — which is what chip-tool does as well
        const updates = new Array<EventReadEntry>();
        const rejection = await rejectionOf(
            node.subscribeEvents(
                [
                    { endpoint: 1, cluster: BOOLEAN_STATE.id, event: STATE_CHANGE_EVENT.id },
                    { endpoint: 1, cluster: BASIC_INFORMATION.id, event: START_UP_EVENT.id },
                ],
                { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10, onUpdate: event => updates.push(event) },
            ),
        );
        expect(rejection).to.be.instanceOf(StatusResponseError);

        await device.backchannel({ name: "setBooleanState", endpointId: 1, newState: true });
        await new Promise(resolve => setTimeout(resolve, 1_000));
        expect(updates).to.be.empty;

        await node.decommission();
    });

    it("rejects a concrete-path event subscribe the device refused", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        const rejection = await rejectionOf(
            node.subscribeEvents([{ endpoint: 1, cluster: BASIC_INFORMATION.id, event: START_UP_EVENT.id }], {
                minIntervalFloorSeconds: 1,
                maxIntervalCeilingSeconds: 10,
            }),
        );
        expect(rejection).to.be.instanceOf(StatusResponseError);

        await node.decommission();
    });

    it("reports later events as updates but not the priming report", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        // Recorded before the subscription exists, so it can only reach the caller as a priming event
        await device.backchannel({ name: "setBooleanState", endpointId: 1, newState: true });

        const updates = new Array<EventReadEntry>();
        const priming = await node.subscribeEvents(
            [{ endpoint: 1, cluster: BOOLEAN_STATE.id, event: STATE_CHANGE_EVENT.id }],
            { minIntervalFloorSeconds: 0, maxIntervalCeilingSeconds: 10, onUpdate: event => updates.push(event) },
        );
        expect(priming.map(({ value }) => value)).to.deep.equal([{ stateValue: true }]);
        expect(updates).to.be.empty;

        await device.backchannel({ name: "setBooleanState", endpointId: 1, newState: false });
        await waitFor(() => updates.length > 0);

        expect(updates[0].endpoint).equal(1);
        expect(updates[0].cluster).equal(BOOLEAN_STATE.id);
        expect(updates[0].event).equal(STATE_CHANGE_EVENT.id);
        expect(updates[0].eventNumber > priming[0].eventNumber).equal(true);
        expect(updates[0].value).to.deep.equal({ stateValue: false });

        await node.decommission();
    });

    it("writes one attribute across every endpoint that has the cluster", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        const statuses = await node.writeAttributes([
            { path: { cluster: IDENTIFY.id, attribute: IDENTIFY_TIME_ATTRIBUTE.id }, value: 5 },
        ]);

        const written = statuses.filter(({ status }) => status === Status.Success);
        expect(written.length).to.be.greaterThan(1);
        for (const { endpoint } of written) {
            expect(
                await node.readAttribute({
                    endpoint,
                    cluster: IDENTIFY.id,
                    attribute: IDENTIFY_TIME_ATTRIBUTE.id,
                }),
            ).to.be.a("number");
        }

        await node.decommission();
    });

    it("honors a data version, rejecting a write that carries a stale one", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        const path = { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL_ATTRIBUTE.id };
        const version = await versionOf(node, path);

        expect(await node.writeAttributes([{ path, value: "version-a", dataVersion: version }])).to.deep.equal([
            { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL_ATTRIBUTE.id, status: Status.Success },
        ]);

        const stale = await node.writeAttributes([{ path, value: "version-b", dataVersion: version }]);
        expect(stale.map(({ status }) => status)).to.deep.equal([Status.DataVersionMismatch]);
        expect(await node.readAttribute(path)).to.equal("version-a");

        await node.decommission();
    });

    // Characterization: § 8.9.2.8.1 is enforced by matter.js's own write action, not by this adapter, so
    // a guard added here would be dead code.
    it("refuses a data version on a wildcard endpoint path, which the specification forbids", async function () {
        this.timeout(30_000);

        const ref = await adapter.commission({ passcode: 20202021, discriminator: 3840 });
        const node = adapter.node(ref);

        await expect(
            node.writeAttributes([
                {
                    path: { cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL_ATTRIBUTE.id },
                    value: "wildcard",
                    dataVersion: 1,
                },
            ]),
        ).rejectedWith(/must target a concrete endpoint/);

        await node.decommission();
    });

    it("throws when constructing a second adapter with an id already registered", () => {
        expect(() => new InProcessControllerAdapter("dut")).to.throw(InternalError, /already registered/);
    });
});

describe("ControllerAdapter registry", () => {
    const originalController = env.MATTER_CERT_CONTROLLER;

    afterEach(() => {
        if (originalController === undefined) {
            delete env.MATTER_CERT_CONTROLLER;
        } else {
            env.MATTER_CERT_CONTROLLER = originalController;
        }
    });

    it("throws when registering an implementation name that already has a factory", () => {
        // test/test.config.ts imports support/chip-testing/src/cert/index.ts once before any spec
        // file runs, which registers "matterjs" — so this throw needs no setup of its own here.
        expect(() => registerControllerAdapterFactory("matterjs", fakeControllerAdapter)).to.throw(
            /already registered/,
        );
    });

    it("dispatches through the matterjs factory by default", async () => {
        delete env.MATTER_CERT_CONTROLLER;

        const adapter = createControllerAdapter("registry-test-default");
        expect(adapter).to.be.instanceOf(InProcessControllerAdapter);
        await adapter.close();
    });

    it("dispatches through the chip-tool factory when the run selects it", async () => {
        env.MATTER_CERT_CONTROLLER = "chip-tool";

        const adapter = createControllerAdapter("registry-test-chip-tool");
        try {
            expect(adapter).to.be.instanceOf(ChipToolControllerAdapter);
        } finally {
            // Construction spawns nothing, but it does claim a commissioner identity
            await adapter.close();
        }
    });

    it("throws naming the implementation and where to register it when no factory is registered", () => {
        env.MATTER_CERT_CONTROLLER = "chip-tool";
        resetControllerAdapterFactoryForTesting("chip-tool");

        try {
            expect(() => createControllerAdapter("registry-test-unregistered")).to.throw(/chip-tool/);
            expect(() => createControllerAdapter("registry-test-unregistered")).to.throw(
                /registerControllerAdapterFactory/,
            );

            const builtIds = new Array<string>();
            registerControllerAdapterFactory("chip-tool", id => {
                builtIds.push(id);
                return fakeControllerAdapter(id);
            });

            const adapter = createControllerAdapter("registry-test-dispatch");
            expect(adapter.id).to.equal("registry-test-dispatch");
            expect(builtIds).to.deep.equal(["registry-test-dispatch"]);
        } finally {
            // Restore what src/cert/index.ts registered at load time, for any later suite that
            // resolves "chip-tool" through the registry.
            resetControllerAdapterFactoryForTesting("chip-tool");
            registerControllerAdapterFactory(
                "chip-tool",
                id => new ChipToolControllerAdapter(id),
                CHIP_TOOL_CONTROLLER_PICS,
            );
        }
    });

    it("reports the PICS each controller declares about itself", () => {
        expect(controllerPicsOverridesFor("matterjs")).deep.equal(MATTERJS_CONTROLLER_PICS);
        expect(controllerPicsOverridesFor("chip-tool")).deep.equal(CHIP_TOOL_CONTROLLER_PICS);
        expect(MATTERJS_CONTROLLER_PICS["MCORE.IDM.C.InvokeRequest.BatchCommands"]).equal(1);
        expect(CHIP_TOOL_CONTROLLER_PICS["MCORE.IDM.C.InvokeRequest.BatchCommands"]).equal(0);

        for (const pics of [MATTERJS_CONTROLLER_PICS, CHIP_TOOL_CONTROLLER_PICS]) {
            expect(pics["MCORE.ROLE.COMMISSIONER"]).equal(1);
            expect(pics["MCORE.DD.QR_COMMISSIONING"]).equal(1);
            expect(pics["MCORE.DD.MANUAL_PC_COMMISSIONING"]).equal(1);
            expect(pics["MCORE.DD.SCAN_QR_CODE"]).equal(1);
            expect(pics["MCORE.DD.CTRL_CONCATENATED_QR_CODE_1"]).equal(0);
        }
    });

    it("declares the client-side capabilities the device's own PICS file answers for a device", () => {
        // Every command TC-ACT-3.2 gates a step on, since a declaration missing from the middle of the
        // range skips that step as quietly as one missing from either end.
        const actionCommands = ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b"].map(
            id => `ACT.C.C${id}.Tx`,
        );

        // The CHIP file describes a device, which is not an Actions client, so it answers 0 for every
        // Actions command. The DUT of those steps is the controller, so its own declaration has to win.
        const asDevice = new PicsFile(actionCommands.map(key => `${key}=0`));

        for (const implementation of ["matterjs", "chip-tool"] as const) {
            const forRun = asDevice.with(controllerPicsOverridesFor(implementation));

            for (const key of actionCommands) {
                expect(new PicsExpression(key).evaluate(forRun), `${implementation} ${key}`).equal(true);
            }
        }
    });

    it("declares nothing about what the device advertises, which every run's report would inherit", () => {
        // certPicsFile() feeds every cert test's report, so a key describing the TH — what it
        // advertises, above all — has to come from the device's own file and never from an overlay.
        for (const implementation of ["matterjs", "chip-tool"] as const) {
            const declared = controllerPicsOverridesFor(implementation);

            expect("MCORE.DD.DISCOVERY_BLE" in declared, implementation).equal(false);
            expect("MCORE.DD.DISCOVERY_PAF" in declared, implementation).equal(false);
        }
    });

    it("reports no declarations for an implementation registered without them", () => {
        resetControllerAdapterFactoryForTesting("chip-tool");

        try {
            registerControllerAdapterFactory("chip-tool", fakeControllerAdapter);
            expect(controllerPicsOverridesFor("chip-tool")).deep.equal({});
        } finally {
            resetControllerAdapterFactoryForTesting("chip-tool");
            registerControllerAdapterFactory(
                "chip-tool",
                id => new ChipToolControllerAdapter(id),
                CHIP_TOOL_CONTROLLER_PICS,
            );
        }
    });
});
