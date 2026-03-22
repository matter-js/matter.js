/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    DeviceTypeElement as DeviceType,
    ConditionElement as Condition,
    RequirementElement as Requirement
} from "../../elements/index.js";

export const BaseDt = DeviceType(
    { name: "Base", classification: "base" },
    Condition({ name: "LanguageLocale" }),
    Condition({ name: "TimeLocale" }),
    Condition({ name: "UnitLocale" }),
    Condition({ name: "Sit" }),
    Condition({ name: "Lit" }),
    Condition({ name: "Active" }),
    Condition({ name: "Node" }),
    Condition({ name: "App" }),
    Condition({ name: "Simple" }),
    Condition({ name: "Dynamic" }),
    Condition({ name: "Composed" }),
    Condition({ name: "Client" }),
    Condition({ name: "Server" }),
    Condition({ name: "Duplicate" }),
    Condition({ name: "BridgedPowerSourceInfo" }),
    Requirement(
        { name: "Descriptor", id: 0x1d, conformance: "M", element: "serverCluster" },
        Requirement({ name: "TAGLIST", conformance: "Duplicate", element: "feature" })
    ),
    Requirement({ name: "Binding", id: 0x1e, conformance: "Simple & Client", element: "serverCluster" }),
    Requirement({ name: "FixedLabel", id: 0x40, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "UserLabel", id: 0x41, conformance: "O", element: "serverCluster" })
);

MatterDefinition.children.push(BaseDt);
