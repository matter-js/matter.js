/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandModel } from "#models/CommandModel.js";
import { Decorator } from "@matter/general";
import { element } from "./element.js";

/**
 * Decorates a method as a Matter command.
 */
export function command(...modifiers: element.Modifier<Decorator.MethodCollector>[]) {
    return element(CommandModel, ...modifiers);
}
