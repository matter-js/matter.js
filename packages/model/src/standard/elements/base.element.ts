/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    DeviceTypeElement as DeviceType,
    FieldElement as Field,
    RequirementElement as Requirement
} from "../../elements/index.js";

export const BaseDt = DeviceType(
    { name: "Base", classification: "base" },

    Field(
        { name: "conditions", type: "enum8" },
        Field({ name: "Zha" }),
        Field({ name: "Zse" }),
        Field({ name: "Gp" }),
        Field({ name: "Zigbee" }),
        Field({ name: "SuZi" }),
        Field({ name: "Matter" }),
        Field({ name: "LanguageLocale" }),
        Field({ name: "TimeLocale" }),
        Field({ name: "UnitLocale" }),
        Field({ name: "Sit" }),
        Field({ name: "Lit" }),
        Field({ name: "Active" }),
        Field({ name: "Node" }),
        Field({ name: "App" }),
        Field({ name: "Simple" }),
        Field({ name: "Dynamic" }),
        Field({ name: "Composed" }),
        Field({ name: "Client" }),
        Field({ name: "Server" }),
        Field({ name: "Duplicate" }),
        Field({ name: "BridgedPowerSourceInfo" })
    ),

    Requirement(
        { name: "Descriptor", id: 0x1d, conformance: "M", element: "serverCluster" },
        Requirement({ name: "TAGLIST", conformance: "Duplicate", element: "feature" })
    ),
    Requirement({ name: "Binding", id: 0x1e, conformance: "Simple & Client", element: "serverCluster" }),
    Requirement({ name: "FixedLabel", id: 0x40, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "UserLabel", id: 0x41, conformance: "O", element: "serverCluster" })
);

MatterDefinition.children.push(BaseDt);
