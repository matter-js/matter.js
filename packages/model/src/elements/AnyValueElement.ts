/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeElement } from "./AttributeElement.js";
import { CommandElement } from "./CommandElement.js";
import { DatatypeElement } from "./DatatypeElement.js";
import { EventElement } from "./EventElement.js";
import { FieldElement } from "./FieldElement.js";

/**
 * All Matter data elements.
 */
export type AnyValueElement = AttributeElement | CommandElement | EventElement | FieldElement | DatatypeElement;
