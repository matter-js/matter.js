/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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

    operationalResponse?: CommandModel | null;

    get fabricScoped() {
        return !!this.effectiveAccess.fabric;
    }

    get isRequest() {
        return this.effectiveDirection !== CommandElement.Direction.Response;
    }

    get isResponse() {
        return this.effectiveDirection === CommandElement.Direction.Response;
    }

    set isResponse(isResponse: boolean) {
        this.direction = isResponse ? CommandElement.Direction.Response : CommandElement.Direction.Request;
    }

    get responseModel() {
        switch (this.operationalResponse) {
            case undefined:
                return new ModelTraversal().findResponse(this);

            case null:
                return undefined;

            default:
                return this.operationalResponse;
        }
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

    constructor(definition: CommandModel.Definition, ...children: Model.ChildDefinition<CommandModel>[]) {
        super(definition, ...children);

        this.direction = definition.direction as CommandElement.Direction;
        this.response = definition.response;
        this.operationalResponse = definition.operationalResponse;
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            direction: this.direction,
            response: this.response,
            ...extra,
        });
    }

    override finalize() {
        if (this.isFinal) {
            return;
        }

        const operationalResponse = this.operationalResponse ?? (this.operationalResponse = this.responseModel ?? null);
        operationalResponse?.finalize();

        super.finalize();
    }

    static Tag = CommandElement.Tag;
    static requiresId = true;
}

export namespace CommandModel {
    export type Definition = Model.Definition<CommandModel> & { operationalResponse?: CommandModel };
}

CommandModel.register();
