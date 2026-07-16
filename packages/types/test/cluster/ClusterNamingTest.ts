/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterLookup } from "#cluster/ClusterHelper.js";
import { BooleanState } from "#clusters/boolean-state.js";
import { OnOff } from "#clusters/on-off.js";
import { ClusterId } from "#datatype/ClusterId.js";
import { ClusterModel, MatterModel } from "@matter/model";

const { attributeId, attributeName, commandId, commandName, eventId, eventName } = ClusterLookup;

describe("ClusterLookup", () => {
    const onOffId = OnOff.Cluster.id;
    const booleanStateId = BooleanState.Cluster.id;
    const unknownClusterId = ClusterId(0xffff, false);

    // Absent from the global Matter model, so resolving it only succeeds if the custom model argument is honored.
    const customClusterId = ClusterId(0xfffd, false);
    const customMatter = new MatterModel({
        name: "CustomMatter",
        children: [
            new ClusterModel({
                id: customClusterId,
                name: "CustomCluster",
                children: [{ tag: "attribute", id: 0x0000, name: "customAttr" }],
            }),
        ],
    });

    describe("attributeId / attributeName", () => {
        it("resolves a known attribute name to its id", () => {
            expect(attributeId(onOffId, "onOff")).equal(0x0000);
        });

        it("resolves a known attribute id to its name", () => {
            expect(attributeName(onOffId, 0x0000)).equal("onOff");
        });

        it("returns undefined for an unknown attribute name", () => {
            expect(attributeId(onOffId, "doesNotExist")).undefined;
        });

        it("returns undefined for an unknown attribute id", () => {
            expect(attributeName(onOffId, 0x1234)).undefined;
        });

        it("returns undefined for an unknown cluster", () => {
            expect(attributeId(unknownClusterId, "onOff")).undefined;
            expect(attributeName(unknownClusterId, 0x0000)).undefined;
        });

        it("resolves against an explicit, non-global MatterModel", () => {
            expect(attributeId(customClusterId, "customAttr")).undefined;
            expect(attributeId(customClusterId, "customAttr", customMatter)).equal(0x0000);
            expect(attributeName(customClusterId, 0x0000, customMatter)).equal("customAttr");
        });
    });

    describe("commandId / commandName", () => {
        it("resolves a known command name to its id", () => {
            expect(commandId(onOffId, "off")).equal(0x00);
            expect(commandId(onOffId, "on")).equal(0x01);
            expect(commandId(onOffId, "toggle")).equal(0x02);
        });

        it("resolves a known command id to its name", () => {
            expect(commandName(onOffId, 0x00)).equal("off");
        });

        it("returns undefined for an unknown command", () => {
            expect(commandId(onOffId, "doesNotExist")).undefined;
            expect(commandName(onOffId, 0xff)).undefined;
        });
    });

    describe("eventId / eventName", () => {
        it("round-trips a known event name to its id and back", () => {
            const id = eventId(booleanStateId, "stateChange");
            expect(id).not.undefined;
            expect(eventName(booleanStateId, id!)).equal("stateChange");
        });

        it("returns undefined for an unknown event", () => {
            expect(eventId(booleanStateId, "doesNotExist")).undefined;
            expect(eventName(booleanStateId, 0xff)).undefined;
        });

        it("returns undefined for an unknown cluster", () => {
            expect(eventId(unknownClusterId, "stateChange")).undefined;
        });
    });
});
