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
    CommandElement as Command
} from "../../elements/index.js";

export const OvenCavityOperationalState = Cluster(
    { name: "OvenCavityOperationalState", id: 0x48, type: "OperationalState", classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Command({ name: "Pause", id: 0x0, conformance: "X" }),
    Command({ name: "Stop", id: 0x1 }),
    Command({ name: "Start", id: 0x2 }),
    Command({ name: "Resume", id: 0x3, conformance: "X" }),
    Command({ name: "OperationalCommandResponse", id: 0x4 })
);

MatterDefinition.children.push(OvenCavityOperationalState);
