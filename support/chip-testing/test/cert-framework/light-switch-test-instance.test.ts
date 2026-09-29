/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeApi, CertNodeRef } from "@matter/testing";
import { expect } from "chai";
import { AllClustersTestInstance } from "../../src/AllClustersTestInstance.js";
import { InProcessControllerAdapter } from "../../src/cert/InProcessControllerAdapter.js";
import { BindingSendError, LightSwitchTestInstance } from "../../src/LightSwitchTestInstance.js";
import { requireId, runCleanups } from "../cert/tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");
const BINDING = Matter.clusters.require("Binding");
const ACCESS_CONTROL = Matter.clusters.require("AccessControl");
const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const LEVEL_CONTROL_ID = requireId(Matter.clusters.require("LevelControl").id, "LevelControl cluster");

const ON_OFF_PATH = {
    endpoint: 1,
    cluster: ON_OFF_ID,
    attribute: requireId(ON_OFF.attributes.require("onOff").id, "OnOff.onOff"),
};
const BINDING_PATH = {
    endpoint: 1,
    cluster: requireId(BINDING.id, "Binding cluster"),
    attribute: requireId(BINDING.attributes.require("binding").id, "Binding.binding"),
};
const ACL_PATH = {
    endpoint: 0,
    cluster: requireId(ACCESS_CONTROL.id, "AccessControl cluster"),
    attribute: requireId(ACCESS_CONTROL.attributes.require("acl").id, "AccessControl.acl"),
};

const PRIVILEGE_OPERATE = 3;
const AUTH_MODE_CASE = 2;

// Kept clear of the 5540 other subjects default to, so a start here cannot lose a port race
const SWITCH = { discriminator: 3870, passcode: 20202031, port: 5570 };
const LIGHT = { discriminator: 3871, passcode: 20202032, port: 5571 };

describe("LightSwitchTestInstance", () => {
    let lightSwitch: LightSwitchTestInstance;
    let light: AllClustersTestInstance;
    let adapter: InProcessControllerAdapter;
    let switchRef: CertNodeRef | undefined;
    let lightRef: CertNodeRef;

    beforeEach(async function () {
        this.timeout(60_000);

        const suffix = Math.random().toString(36).slice(2);
        lightSwitch = new LightSwitchTestInstance({
            domain: `light-switch-test-${suffix}`,
            commandPipeFactory: async () => {},
            ...SWITCH,
        });
        light = new AllClustersTestInstance({
            domain: `light-switch-test-light-${suffix}`,
            commandPipeFactory: async () => {},
            ...LIGHT,
        });
        await lightSwitch.initialize();
        await lightSwitch.start();
        await light.initialize();
        await light.start();

        adapter = new InProcessControllerAdapter("light-switch-th");
        await adapter.start();

        switchRef = undefined;
        lightRef = await adapter.commission(LIGHT);
    });

    afterEach(async function () {
        this.timeout(30_000);

        await runCleanups(
            async () => {
                if (switchRef !== undefined) {
                    await adapter?.node(switchRef).decommission();
                }
            },
            async () => {
                await adapter?.node(lightRef).decommission();
            },
            async () => {
                await adapter?.close();
            },
            async () => {
                await lightSwitch?.close();
            },
            async () => {
                await light?.close();
            },
        );
    });

    /** Commissions the switch and admits it to operate the light. */
    async function commissionSwitch() {
        const ref = await adapter.commission(SWITCH);
        switchRef = ref;

        const node = adapter.node(lightRef);
        const acl = await node.readAttribute(ACL_PATH);
        if (!Array.isArray(acl)) {
            throw new InternalError(`The light answered its ACL with ${String(acl)}`);
        }
        await node.writeAttribute(ACL_PATH, [
            ...acl,
            { privilege: PRIVILEGE_OPERATE, authMode: AUTH_MODE_CASE, subjects: [BigInt(ref)], targets: null },
        ]);
        return adapter.node(ref);
    }

    function send(command: "on" | "off") {
        return lightSwitch.backchannel({ name: "sendOnOffToBindings", endpointId: 1, command });
    }

    async function lightIsOn() {
        return adapter.node(lightRef).readAttribute(ON_OFF_PATH);
    }

    function bindTo(node: CertNodeApi, entries: { node: bigint; endpoint: number; cluster: number }[]) {
        return node.writeAttribute(BINDING_PATH, entries);
    }

    it("sends to a unicast binding written just before the command", async function () {
        this.timeout(60_000);

        const switchNode = await commissionSwitch();
        expect(await lightIsOn()).equal(false);

        await bindTo(switchNode, [{ node: BigInt(lightRef), endpoint: 1, cluster: ON_OFF_ID }]);
        await send("on");

        expect(await lightIsOn()).equal(true);
    });

    it("does not send to an entry removed just before the command", async function () {
        this.timeout(60_000);

        const switchNode = await commissionSwitch();
        await bindTo(switchNode, [{ node: BigInt(lightRef), endpoint: 1, cluster: ON_OFF_ID }]);
        await send("on");

        await bindTo(switchNode, []);
        await send("off");

        expect(await lightIsOn()).equal(true);
    });

    it("ignores an entry for a cluster other than OnOff", async function () {
        this.timeout(60_000);

        await bindTo(await commissionSwitch(), [
            { node: BigInt(lightRef), endpoint: 1, cluster: LEVEL_CONTROL_ID },
            { node: BigInt(lightRef), endpoint: 1, cluster: ON_OFF_ID },
        ]);
        await send("on");

        expect(await lightIsOn()).equal(true);
    });

    it("sends through a binding written after a factory reset, not through one resolved before it", async function () {
        this.timeout(60_000);

        const binding = [{ node: BigInt(lightRef), endpoint: 1, cluster: ON_OFF_ID }];
        await bindTo(await commissionSwitch(), binding);
        await send("on");
        expect(await lightIsOn()).equal(true);

        await lightSwitch.backchannel({ name: "factoryReset" });
        switchRef = undefined;

        // The same entry again: same fabric index, same light, so it has the key the pre-reset resolution had
        await bindTo(await commissionSwitch(), binding);
        await send("off");

        expect(await lightIsOn()).equal(false);
    });

    it("sends nothing and succeeds without bindings", async function () {
        this.timeout(60_000);

        await commissionSwitch();
        await send("on");

        expect(await lightIsOn()).equal(false);
    });

    it("fails the command when a send to a target fails", async function () {
        this.timeout(60_000);

        // No ACL entry admits the switch, so the light refuses the command
        switchRef = await adapter.commission(SWITCH);
        await bindTo(adapter.node(switchRef), [{ node: BigInt(lightRef), endpoint: 1, cluster: ON_OFF_ID }]);

        await expect(send("on")).rejectedWith(BindingSendError);
        expect(await lightIsOn()).equal(false);
    });
});
