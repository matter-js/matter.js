/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandModel, InferredComponent, VarianceCondition, conditionToBitmaps } from "#model";
import { camelize } from "../util/string.js";
import type { InterfaceFile } from "./InterfaceFile.js";
import { TypeGenerator } from "./TypeGenerator.js";

export class InterfaceGenerator {
    interfaces = {} as Record<string, VarianceCondition>;
    types;

    constructor(private file: InterfaceFile) {
        this.types = new TypeGenerator(file);
    }

    generateComponent(name: string, component: InferredComponent) {
        const commands = [
            ...component.mandatory.filter(model => model instanceof CommandModel && model.isRequest),
            ...component.optional.filter(model => model instanceof CommandModel && model.isRequest),
        ] as CommandModel[];

        if (!commands.length) {
            return;
        }

        this.interfaces[name] = component.condition ?? {};

        const intf = this.file.ns.statements(`export interface ${name} {`, "}");

        for (const command of commands) {
            this.file.addImport("#general", "MaybePromise");

            let request = this.types.reference(command, "");
            if (request.length) {
                request = `request: ${request}`;
            }

            const response = this.types.reference(command.responseModel, "void");

            const returnType = response === "void" ? "MaybePromise" : `MaybePromise<${response}>`;

            intf.atom(`${camelize(command.name)}(${request}): ${returnType}`).document(command);
        }
    }

    generateInterface() {
        const intf = this.file.expressions(`export type ${this.file.definitionName} = {`, "}");
        const components = intf.expressions(`components: [`, "]");

        for (const name in this.interfaces) {
            const bitmaps = conditionToBitmaps(this.interfaces[name], this.file.cluster);
            for (const bitmap of bitmaps) {
                const entry = components.expressions("{", "}");
                entry.value(bitmap, "flags: ");
                entry.atom("methods", `${this.file.definitionName}.${name}`);
            }
        }
    }
}
