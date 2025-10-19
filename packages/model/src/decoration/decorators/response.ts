/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldSemantics } from "#decoration/semantics/FieldSemantics.js";
import { CommandElement } from "#elements/CommandElement.js";
import { Decorator } from "#general";
import { CommandModel } from "#models/CommandModel.js";
import { DatatypeModel } from "#models/DatatypeModel.js";

/**
 * Specify the response type for a command.
 */
export function response(type: DatatypeModel): Decorator.ClassMethod {
    return Decorator((_target, context) => {
        const requestSemantics = FieldSemantics.of(context);

        requestSemantics.modelType = CommandModel;
        const request = requestSemantics.mutableModel as CommandModel;

        const name = `${request.name}Response`;
        new CommandModel({
            name,
            id: request.id,
            parent: request.parent,
            direction: CommandElement.Direction.Response,
            operationalBase: type,
        });

        request.response = name;
    });
}
