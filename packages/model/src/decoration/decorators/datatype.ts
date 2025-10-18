/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatatypeModel } from "#models/DatatypeModel.js";
import { element } from "./element.js";

/**
 * Decorates a class as a datatype.
 */
export const datatype = element.klass(DatatypeModel);
