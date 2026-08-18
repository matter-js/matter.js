/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeElement, ClusterElement, CommandElement, DatatypeElement, FieldElement } from "#elements/index.js";
import { ClusterModel } from "#models/index.js";

const cluster = new ClusterModel(
    ClusterElement({
        name: "Test",
        id: 0x1234,

        children: [
            AttributeElement({ name: "Administered", id: 0x0, type: "uint8", access: "A" }),
            AttributeElement({ name: "Unspecified", id: 0x1, type: "uint8" }),
            AttributeElement({
                name: "Writable",
                id: 0x2,
                type: "TestStruct",
                access: "RW VM",
            }),
            CommandElement({ name: "Operate", id: 0x0, access: "O", direction: "request" }),
            DatatypeElement({
                name: "TestStruct",
                type: "struct",
                children: [FieldElement({ name: "Sensitive", id: 0x0, type: "uint8", access: "S" })],
            }),
        ],
    }),
);

describe("effective access", () => {
    it("does not grant write to an attribute that states only a privilege", () => {
        const access = cluster.attributes.require("Administered").effectiveAccess;
        expect(`${access}`).equal("R A");
        expect(access.writable).equal(false);
    });

    it("retains the invoke privilege of a command that states only a privilege", () => {
        const access = cluster.commands.require("Operate").effectiveAccess;
        expect(access.writePriv).equal("O");
    });

    it("grants write to an attribute that states no access at all", () => {
        expect(cluster.attributes.require("Unspecified").effectiveAccess.writable).equal(true);
    });

    it("inherits read and write into a nested value that states only fabric access", () => {
        const sensitive = cluster.attributes.require("Writable").members.require("Sensitive");
        expect(sensitive.effectiveAccess.writable).equal(true);
    });
});
