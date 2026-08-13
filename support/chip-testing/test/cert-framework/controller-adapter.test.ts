/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { StatusResponseError } from "@matter/main/types";
import { Matter } from "@matter/model";
import { expect } from "chai";
import { AllClustersTestInstance } from "../../src/AllClustersTestInstance.js";
import { InProcessControllerAdapter } from "../../src/cert/InProcessControllerAdapter.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const ON_OFF = Matter.clusters.require("OnOff");
const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const VENDOR_ID_ATTRIBUTE = BASIC_INFORMATION.attributes.require("vendorId");
const ON_OFF_ATTRIBUTE = ON_OFF.attributes.require("onOff");
const NODE_LABEL_ATTRIBUTE = BASIC_INFORMATION.attributes.require("nodeLabel");
const FABRICS_ATTRIBUTE = OPERATIONAL_CREDENTIALS.attributes.require("fabrics");

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

    it("throws when constructing a second adapter with an id already registered", () => {
        expect(() => new InProcessControllerAdapter("dut")).to.throw(InternalError, /already registered/);
    });
});
