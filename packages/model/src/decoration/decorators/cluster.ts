/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel } from "#models/ClusterModel.js";
import { element } from "./element.js";

/**
 * Generates a decorator that marks a class as a Matter cluster.
 */
export const cluster = element.klass(ClusterModel);
