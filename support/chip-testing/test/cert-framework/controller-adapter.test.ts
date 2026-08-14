/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Status, StatusResponseError } from "@matter/main/types";
import { Matter } from "@matter/model";
import { expect } from "chai";
import { env } from "node:process";
import { AllClustersTestInstance } from "../../src/AllClustersTestInstance.js";
import { ChipToolControllerAdapter } from "../../src/cert/ChipToolControllerAdapter.js";
import { InProcessControllerAdapter } from "../../src/cert/InProcessControllerAdapter.js";
import {
    createControllerAdapter,
    LineQueue,
    LogFollower,
    registerControllerAdapterFactory,
    resetControllerAdapterFactoryForTesting,
} from "@matter/testing";
import type { AttributePathSpec, CertNodeApi, ControllerAdapter } from "@matter/testing";

function fakeControllerAdapter(id: string): ControllerAdapter {
    return {
        id,
        log: new LogFollower(new LineQueue(), id),
        async start() {},
        async close() {},
        async commission() {
            throw new InternalError("not used in this test");
        },
        node() {
            throw new InternalError("not used in this test");
        },
    };
}

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const ON_OFF = Matter.clusters.require("OnOff");
const IDENTIFY = Matter.clusters.require("Identify");
const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const VENDOR_ID_ATTRIBUTE = BASIC_INFORMATION.attributes.require("vendorId");
const ON_OFF_ATTRIBUTE = ON_OFF.attributes.require("onOff");
const NODE_LABEL_ATTRIBUTE = BASIC_INFORMATION.attributes.require("nodeLabel");
const FABRICS_ATTRIBUTE = OPERATIONAL_CREDENTIALS.attributes.require("fabrics");
const IDENTIFY_TIME_ATTRIBUTE = IDENTIFY.attributes.require("identifyTime");

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
            registerControllerAdapterFactory("chip-tool", id => new ChipToolControllerAdapter(id));
        }
    });
});
