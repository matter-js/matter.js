/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeModel } from "#models/AttributeModel.js";
import { element } from "./element.js";

/**
 * Decorates a property as a Matter attribute.
 */
export const attribute = element.property(AttributeModel);
