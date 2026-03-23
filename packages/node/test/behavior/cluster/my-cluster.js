/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterNamespace } from "@matter/types";
import { MySchema } from "./my-schema.js";

export const My = ClusterNamespace(MySchema);
export const MyCluster = My;
