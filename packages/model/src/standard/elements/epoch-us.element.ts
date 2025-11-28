/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype } from "../../elements/index.js";

export const epochUs = Datatype({ name: "epoch-us", type: "uint64", default: 946684800000000, isSeed: true });
MatterDefinition.children.push(epochUs);
