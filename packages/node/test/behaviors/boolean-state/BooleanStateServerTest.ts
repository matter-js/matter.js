/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BooleanStateServer } from "#behaviors/boolean-state";
import { ContactSensorDevice } from "#devices/contact-sensor";
import { MockServerNode } from "@matter/node/testing";

describe("BooleanStateServer", () => {
    it("enables the ChangeEvent feature by default", async () => {
        const node = await MockServerNode.createOnline();
        const ep = await node.add(ContactSensorDevice, { booleanState: { stateValue: false } });
        // The StateChange event only exists when the ChangeEvent feature is enabled
        expect(ep.eventsOf(BooleanStateServer).stateChange).not.equals(undefined);
    });

    it("emits StateChange when stateValue changes", async () => {
        const node = await MockServerNode.createOnline();
        const ep = await node.add(ContactSensorDevice, { booleanState: { stateValue: false } });

        const emitted = new Array<boolean>();
        ep.eventsOf(BooleanStateServer).stateChange.on(({ stateValue }) => {
            emitted.push(stateValue);
        });

        await ep.act("change", agent => {
            agent.get(BooleanStateServer).state.stateValue = true;
        });

        expect(emitted).deep.equals([true]);
    });
});
