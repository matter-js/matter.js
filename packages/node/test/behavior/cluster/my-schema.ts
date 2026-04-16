/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeElement, ClusterModel, CommandElement, EventElement, FieldElement } from "@matter/model";

export const MySchema = new ClusterModel({
    id: 0x1234_fc01,
    name: "MyCluster",

    children: [
        AttributeElement({ id: 1, name: "ReqAttr", type: "string", conformance: "M", default: "hello" }),
        AttributeElement({ id: 2, name: "OptAttr", type: "bool", conformance: "O", default: true }),
        CommandElement({ id: 5, name: "ReqCmd", response: "ReqResponse", type: "string", conformance: "M" }),
        CommandElement({ id: 5, name: "ReqResponse", direction: "response", type: "string", conformance: "M" }),
        CommandElement({ id: 6, name: "OptCmd", response: "ReqResponse", type: "string", conformance: "O" }),
        CommandElement({ id: 6, name: "OptResponse", direction: "response", type: "string", conformance: "O" }),
        EventElement({ id: 7, name: "ReqEv", priority: "critical", type: "string", conformance: "M" }),
        EventElement({ id: 8, name: "OptEv", priority: "debug", type: "string", conformance: "O" }),

        AttributeElement(
            {
                name: "FeatureMap",
                id: 0xfffc,
                type: "FeatureMap",
            },

            FieldElement({
                name: "AWE",
                constraint: "0",
                description: "Awesome",
                details: "That which makes me more awesome.",
            }),
        ),

        AttributeElement({ id: 9, name: "AwesomeSauce", conformance: "AWE", type: "uint8" }),
        CommandElement({ id: 10, name: "BecomeAwesome", conformance: "AWE", type: "uint8" }),
        EventElement({ id: 11, name: "BecameAwesome", conformance: "AWE", type: "uint8", priority: "info" }),
        AttributeElement({ id: 12, name: "CondAttr", conformance: "OptAttr", type: "uint8", default: 4 }),
        AttributeElement({ id: 13, name: "CondOptAttr1", conformance: "[OptAttr]", type: "uint8", default: 4 }),
        AttributeElement({
            id: 14,
            name: "CondOptAttr2",
            conformance: "[CondOptAttr2 > 4]",
            type: "uint8",
            default: 4,
        }),
        AttributeElement({
            id: 20,
            name: "OptList",
            conformance: "O",
            type: "list",
            children: [FieldElement({ name: "entry", type: "octstr" })],
        }),
    ],
});
