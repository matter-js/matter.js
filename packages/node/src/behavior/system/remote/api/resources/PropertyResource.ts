/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { type ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { InternalError, NotImplementedError } from "#general";
import { DataModelPath, Metatype, Schema } from "#model";
import { Val } from "@matter/protocol";
import { StatusResponse } from "@matter/types";
import { ApiResource } from "../ApiResource.js";
import { Envelope } from "../Envelope.js";

/**
 * API item for sub-properties of collections (clusters, structs and lists in the Matter data model).
 */
export class PropertyResource extends ApiResource {
    id: string;
    supervisor: ValueSupervisor;
    dataModelPath: DataModelPath;

    get valueKind(): ApiResource.Kind {
        if (this.schema.tag === "attribute") {
            return "attribute";
        }
        return "field";
    }

    constructor(parent: ApiResource, id: string, supervisor: ValueSupervisor, path: DataModelPath) {
        super(parent);

        this.id = id;
        this.supervisor = supervisor;
        this.dataModelPath = path;
    }

    override get schema() {
        return this.supervisor.schema;
    }

    get value() {
        return (this.parent?.value as Val.Struct | undefined)?.[this.id];
    }

    override write(request: Envelope.Data) {
        const requestEnv = new Envelope({ supervisor: this.supervisor, ...request });
        requestEnv.validate();
        this.#target[this.id] = requestEnv.js;
    }

    override patch(request: Envelope) {
        request = new Envelope({ supervisor: this.supervisor, ...request });
        request.validate();
        this.#targetSupervisor.patch({ [this.id]: request.js }, this.#target, this.dataModelPath);
    }

    override add(request: Envelope) {
        const struct = this.#target;
        if (!Array.isArray(struct)) {
            throw new NotImplementedError();
        }

        request = new Envelope({ supervisor: this.supervisor, ...request });
        struct.push(request.js);
    }

    override delete() {
        const struct = this.#target;
        if (Array.isArray(struct)) {
            struct.splice(this.id as unknown as number, 1);
        } else {
            this.#target[this.id] = undefined;
        }
    }

    override async childFor(id: string): Promise<ApiResource | void> {
        let mySchema: Schema | undefined;
        switch (this.schema.effectiveMetatype) {
            case Metatype.object:
                mySchema = this.schema.conformant.properties.for(id);
                break;

            case Metatype.array:
                if (!id.match(/^\d+$/)) {
                    mySchema = undefined;
                } else {
                    mySchema = this.schema.conformant.properties.for("entry");
                }
                break;

            default:
                throw new NotImplementedError();
        }

        if (!mySchema) {
            throw new StatusResponse.NotFoundError();
        }

        const myCollection = this.#target[this.id];
        if (!myCollection) {
            return;
        }

        return new PropertyResource(this, id, this.supervisorFor(mySchema), this.dataModelPath.at(id));
    }

    get #target() {
        const collection = this.parent?.value as Val.Struct;
        if (!collection || typeof collection !== "object") {
            throw new InternalError("Value of property item has no collection");
        }
        return collection;
    }

    get #targetSupervisor() {
        const supervisor = RootSupervisor.for(this.parent?.schema);
        if (!supervisor) {
            throw new InternalError("No supervisor for parent collection");
        }
        return supervisor;
    }
}
