/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterType } from "#cluster/ClusterType.js";
import { TlvOfModel } from "#tlv/TlvOfModel.js";
import { ClusterModel } from "@matter/model";

const cluster = new ClusterModel({
    id: 0xfff1_fc10,
    name: "ObsoleteElements",
    revision: 1,
    children: [
        { tag: "attribute", id: 1, name: "LegacyAttr", type: "uint8", conformance: "Z" },
        { tag: "attribute", id: 2, name: "ForbiddenAttr", type: "uint8", conformance: "X" },
        {
            tag: "command",
            id: 1,
            name: "Configure",
            direction: "request",
            response: "status",
            conformance: "M",
            children: [
                { tag: "field", id: 0, name: "Current", type: "uint8", conformance: "M" },
                { tag: "field", id: 1, name: "Policy", type: "PolicyEnum", conformance: "Z" },
            ],
        },
        { tag: "command", id: 2, name: "LegacyCmd", direction: "request", response: "status", conformance: "Z" },
        { tag: "command", id: 3, name: "ForbiddenCmd", direction: "request", response: "status", conformance: "X" },
        { tag: "event", id: 1, name: "LegacyEvent", priority: "info", conformance: "Z" },
        { tag: "event", id: 2, name: "ForbiddenEvent", priority: "info", conformance: "X" },
        {
            tag: "datatype",
            name: "PolicyEnum",
            type: "enum8",
            children: [
                { tag: "field", id: 0, name: "PerGroupId", conformance: "Z" },
                { tag: "field", id: 1, name: "AllNodes", conformance: "M" },
            ],
        },
    ],
});

describe("ClusterType with obsolete elements", () => {
    it("keeps obsolete attributes, commands and events a client may still name (characterization)", () => {
        expect(Object.keys(ClusterType.attributes(cluster))).deep.equal(["legacyAttr"]);
        expect(Object.keys(ClusterType.commands(cluster))).deep.equal(["configure", "legacyCmd"]);
        expect(Object.keys(ClusterType.events(cluster))).deep.equal(["legacyEvent"]);
    });

    it("encodes an obsolete field with an obsolete enum value (characterization)", () => {
        const configure = cluster.commands.find(command => command.name === "Configure")!;
        const tlv = TlvOfModel(configure);
        const fields = { current: 1, policy: 0 };
        tlv.validate(fields);
        expect(tlv.decode(tlv.encode(fields))).deep.equal(fields);
    });
});
