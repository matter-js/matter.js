/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandElement } from "#elements/CommandElement.js";
import { CommandModel } from "#models/CommandModel.js";
import { Decorator } from "@matter/general";
import { element } from "./element.js";

/**
 * Decorates a method as a Matter command.
 */
export function command(...modifiers: element.Modifier<Decorator.MethodCollector>[]) {
    return element(CommandModel, ...modifiers);
}

/**
 * Decorates a method as a non-Matter command intended for remote invocation over privileged, non-Matter APIs (e.g.
 * WebSocket) rather than the Matter protocol.
 *
 * Works like {@link command} but automatically assigns {@link CommandId.NONE} (-1) as the command ID.  Since -1 is
 * not a valid MEI, these commands are invisible to the Matter protocol layer.
 */
export function method(...modifiers: element.Modifier<Decorator.MethodCollector>[]) {
    return element(CommandModel, CommandElement.NO_ID, ...modifiers);
}
