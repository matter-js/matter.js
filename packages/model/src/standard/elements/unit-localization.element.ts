/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const UnitLocalization = Cluster(
    { name: "UnitLocalization", id: 0x2d },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "TEMP", constraint: "0", title: "TemperatureUnit" })
    ),
    Attribute(
        { name: "TemperatureUnit", id: 0x0, type: "TempUnitEnum", access: "RW VM", conformance: "TEMP", quality: "N" }
    ),

    Attribute(
        {
            name: "SupportedTemperatureUnits", id: 0x1, type: "list", access: "R V", conformance: "P, TEMP",
            constraint: "2 to 3", quality: "F"
        },
        Field({ name: "entry", type: "TempUnitEnum" })
    ),

    Datatype(
        { name: "TempUnitEnum", type: "enum8" },
        Field({ name: "Fahrenheit", id: 0x0, conformance: "O.a2+" }),
        Field({ name: "Celsius", id: 0x1, conformance: "O.a2+" }),
        Field({ name: "Kelvin", id: 0x2, conformance: "O.a2+" })
    )
);

MatterDefinition.children.push(UnitLocalization);
