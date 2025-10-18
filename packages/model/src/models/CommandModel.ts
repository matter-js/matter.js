/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandElement } from "../elements/index.js";
import { ModelTraversal } from "../logic/ModelTraversal.js";
import type { Model } from "./Model.js";
import { ValueModel } from "./ValueModel.js";

export class CommandModel extends ValueModel<CommandElement> implements CommandElement {
    override tag: CommandElement.Tag = CommandElement.Tag;
    direction?: CommandElement.Direction;
    response?: string;

    get fabricScoped() {
        return !!this.effectiveAccess.fabric;
    }

    get isRequest() {
        return this.effectiveDirection === CommandElement.Direction.Request;
    }

    get isResponse() {
        return this.effectiveDirection === CommandElement.Direction.Response;
    }

    get responseModel() {
        return new ModelTraversal().findResponse(this);
    }

    get effectiveDirection() {
        return this.direction ?? (this.base as CommandModel | undefined)?.direction;
    }

    override get requiredFields() {
        return { ...super.requiredFields, id: this.id };
    }

    /**
     * Commands may re-use the ID for request and response so identification requires the ID in conjunction with the
     * direction.
     */
    override get discriminator() {
        // If direction is not present, rely on naming convention for discrimination.  This allows overrides to omit
        // the direction without voiding matching
        if (this.direction === undefined) {
            if (this.name.endsWith("Response")) {
                return CommandElement.Direction.Response;
            }
            return CommandElement.Direction.Request;
        }

        return this.direction;
    }

    constructor(definition: Model.Definition<CommandModel>, ...children: Model.ChildDefinition<CommandModel>[]) {
        super(definition, ...children);

        this.direction = definition.direction as CommandElement.Direction;
        this.response = definition.response;
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            direction: this.direction,
            response: this.response,
            ...extra,
        });
    }

    static Tag = CommandElement.Tag;
    static requiresId = true;
}

CommandModel.register();
