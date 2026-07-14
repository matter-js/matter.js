/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { attributeId, attributeName, commandId, commandName, eventId, eventName } from "#node/client/ClusterNaming.js";
import { Matter } from "@matter/model";
import { ClusterId } from "@matter/types";
import { BooleanState } from "@matter/types/clusters/boolean-state";
import { OnOff } from "@matter/types/clusters/on-off";

describe("ClusterNaming", () => {
    const onOffId = OnOff.Cluster.id;
    const booleanStateId = BooleanState.Cluster.id;
    const unknownClusterId = ClusterId(0xffff, false);

    describe("attributeId / attributeName", () => {
        it("resolves a known attribute name to its id", () => {
            expect(attributeId(Matter, onOffId, "onOff")).equal(0x0000);
        });

        it("resolves a known attribute id to its name", () => {
            expect(attributeName(Matter, onOffId, 0x0000)).equal("onOff");
        });

        it("returns undefined for an unknown attribute name", () => {
            expect(attributeId(Matter, onOffId, "doesNotExist")).undefined;
        });

        it("returns undefined for an unknown attribute id", () => {
            expect(attributeName(Matter, onOffId, 0x1234)).undefined;
        });

        it("returns undefined for an unknown cluster", () => {
            expect(attributeId(Matter, unknownClusterId, "onOff")).undefined;
            expect(attributeName(Matter, unknownClusterId, 0x0000)).undefined;
        });
    });

    describe("commandId / commandName", () => {
        it("resolves a known command name to its id", () => {
            expect(commandId(Matter, onOffId, "off")).equal(0x00);
            expect(commandId(Matter, onOffId, "on")).equal(0x01);
            expect(commandId(Matter, onOffId, "toggle")).equal(0x02);
        });

        it("resolves a known command id to its name", () => {
            expect(commandName(Matter, onOffId, 0x00)).equal("off");
        });

        it("returns undefined for an unknown command", () => {
            expect(commandId(Matter, onOffId, "doesNotExist")).undefined;
            expect(commandName(Matter, onOffId, 0xff)).undefined;
        });
    });

    describe("eventId / eventName", () => {
        it("round-trips a known event name to its id and back", () => {
            const id = eventId(Matter, booleanStateId, "stateChange");
            expect(id).not.undefined;
            expect(eventName(Matter, booleanStateId, id!)).equal("stateChange");
        });

        it("returns undefined for an unknown event", () => {
            expect(eventId(Matter, booleanStateId, "doesNotExist")).undefined;
            expect(eventName(Matter, booleanStateId, 0xff)).undefined;
        });

        it("returns undefined for an unknown cluster", () => {
            expect(eventId(Matter, unknownClusterId, "stateChange")).undefined;
        });
    });
});
