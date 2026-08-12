/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
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

    it("throws when constructing a second adapter with an id already registered", () => {
        expect(() => new InProcessControllerAdapter("dut")).to.throw(InternalError, /already registered/);
    });
});
