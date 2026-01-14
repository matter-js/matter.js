/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Decorator } from "#general";
import { element } from "./element.js";

/**
 * Specify the response type for a command.
 */
export function response(...modifiers: element.Modifier<Decorator.MethodCollector>[]) {
    return element({ Tag: "response" }, ...modifiers);
}
