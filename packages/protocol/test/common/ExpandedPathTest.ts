/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpandedPath } from "#common/ExpandedPath.js";
import { Diagnostic, LogFormat } from "@matter/general";
import { AttributeId, ClusterId, CommandId, EndpointNumber, EventId } from "@matter/types";

describe("ExpandedPath", () => {
    describe("attribute paths", () => {
        it("renders endpoint, cluster and attribute by name", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x6),
                    attributeId: AttributeId(0x0),
                },
            });

            expect(path.toString()).equal("0.onOff.state.onOff");
        });

        it("renders [ADD] marker without separator for listIndex === null", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x1f), // Access Control
                    attributeId: AttributeId(0x0), // ACL
                    listIndex: null,
                },
            });

            expect(path.toString()).equal("0.accessControl.state.acl[ADD]");
        });

        it("renders wildcard endpoint as *", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: undefined,
                    clusterId: ClusterId(0x6),
                    attributeId: AttributeId(0x0),
                },
            });

            expect(path.toString()).equal("*.onOff.state.onOff");
        });

        it("renders unknown cluster id as hex", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: 0xabcd as ClusterId,
                    attributeId: AttributeId(0x0),
                },
            });

            expect(path.toString()).equal("0.0xabcd.state.0x0");
        });

        it("renders unknown attribute id as hex", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x6),
                    attributeId: AttributeId(0xff),
                },
            });

            expect(path.toString()).equal("0.onOff.state.0xff");
        });
    });

    describe("event paths", () => {
        // Switch cluster (0x3b) has events: switchLatched=0, initialPress=1, ...
        it("renders event path with name", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x3b),
                    eventId: EventId(0x0),
                },
            });

            expect(path.toString()).equal("0.switch.events.switchLatched");
        });

        it("renders ! marker without separator when isUrgent is true", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x3b),
                    eventId: EventId(0x0),
                    isUrgent: true,
                },
            });

            expect(path.toString()).equal("0.switch.events.switchLatched!");
        });
    });

    describe("command paths", () => {
        it("renders command path", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x6),
                    commandId: CommandId(0x1), // on
                },
            });

            expect(path.toString()).equal("0.onOff.on");
        });
    });

    describe("Diagnostic rendering", () => {
        // Ensures DataModelPath emitted by ExpandedPath renders properly when wrapped in Diagnostic helpers
        // (i.e. not as "{}" — see https://github.com/matter-js/matter.js/pull/3664)
        it("renders attribute path inline via plaintext formatter", () => {
            const path = ExpandedPath({
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x6),
                    attributeId: AttributeId(0x0),
                },
            });

            const text = LogFormat.formats.plain(Diagnostic.message({ values: [Diagnostic.strong(path), " = true"] }));

            expect(text).contains("0.onOff.state.onOff = true");
        });
    });
});
