/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldModel } from "#models/FieldModel.js";
import { element } from "./element.js";

/**
 * Decorates a property as a Matter field.
 *
 * If you don't assign a field ID using this decorator, matter.js treats the field as internal and it is not
 * accessible via the Matter protocol.
 */
export const field = element.property(FieldModel);
