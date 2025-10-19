/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Decorator } from "#general";
import { CommandModel } from "#models/CommandModel.js";
import { element } from "./element.js";

/**
 * Decorates a method as a Matter command.
 */
export function command(...modifiers: element.Modifier<Decorator.MethodCollector>[]) {
    return element(CommandModel, ...modifiers);
}
