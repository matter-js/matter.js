/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueElement } from "../elements/ValueElement.js";
import { ValueModel } from "./ValueModel.js";

/**
 * This is the base class for fields and attributes, both of which define subvalues of logical structs.
 */
export abstract class PropertyModel<T extends ValueElement = any> extends ValueModel<T> {}
