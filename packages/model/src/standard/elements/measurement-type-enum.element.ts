/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const MeasurementTypeEnum = Datatype(
    { name: "MeasurementTypeEnum", type: "enum16" },
    Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
    Field({ name: "Voltage", id: 0x1, conformance: "M" }),
    Field({ name: "ActiveCurrent", id: 0x2, conformance: "M" }),
    Field({ name: "ReactiveCurrent", id: 0x3, conformance: "M" }),
    Field({ name: "ApparentCurrent", id: 0x4, conformance: "M" }),
    Field({ name: "ActivePower", id: 0x5, conformance: "M" }),
    Field({ name: "ReactivePower", id: 0x6, conformance: "M" }),
    Field({ name: "ApparentPower", id: 0x7, conformance: "M" }),
    Field({ name: "RmsVoltage", id: 0x8, conformance: "M" }),
    Field({ name: "RmsCurrent", id: 0x9, conformance: "M" }),
    Field({ name: "RmsPower", id: 0xa, conformance: "M" }),
    Field({ name: "Frequency", id: 0xb, conformance: "M" }),
    Field({ name: "PowerFactor", id: 0xc, conformance: "M" }),
    Field({ name: "NeutralCurrent", id: 0xd, conformance: "M" }),
    Field({ name: "ElectricalEnergy", id: 0xe, conformance: "M" }),
    Field({ name: "ReactiveEnergy", id: 0xf, conformance: "M" }),
    Field({ name: "ApparentEnergy", id: 0x10, conformance: "M" }),
    Field({ name: "SoilMoisture", id: 0x11, conformance: "M" })
);

MatterDefinition.children.push(MeasurementTypeEnum);
