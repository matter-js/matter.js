/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import type { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { asJson, Bytes } from "#general";
import { DataModelPath } from "#model";
import { StatusResponse, TlvOfModel } from "#types";

/**
 * Api data envelope packages used for request and response.
 *
 * This allows for transparent conversion between our three "native" formats -- JS values, serialized JSON and
 * serialized TLV.
 */
export class Envelope<T = unknown> {
    #supervisor: ValueSupervisor;
    #js?: T;
    #json?: string;
    #tlv?: Bytes;

    constructor({ supervisor, js, json, tlv }: Envelope.Definition<T>) {
        this.#supervisor = supervisor;
        this.#js = js;
        this.#json = json;
        this.#tlv = tlv;
    }

    /**
     * Validate against the schema.  Casts to appropriate types if necessary.
     */
    validate(path?: DataModelPath) {
        if (!path) {
            path = DataModelPath(this.#supervisor.schema.path);
        }

        this.#js = this.#supervisor.cast(this.#js) as T;
        this.#supervisor.validate?.(this.js, LocalActorContext.ReadOnly, { path });
    }

    /**
     * Convert a {@link js} value to {@link JSON}.
     *
     * This acts as a deep copy and optimizes JSON access.  If TLV becomes a priority then we can make this conversion
     * configurable.
     */
    convertToJson() {
        if (this.#js !== undefined) {
            void this.json;
        }
        this.#js = undefined;
    }

    /**
     * Native JS format.
     */
    get js() {
        if (this.#js === undefined) {
            if (this.#json) {
                try {
                    this.#js = JSON.parse(this.#json) as T;
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        throw new StatusResponse.FailureError(`Unparseable JSON: ${e.message}`);
                    }
                    throw e;
                }
            } else if (this.#tlv) {
                this.#js = TlvOfModel(this.#supervisor.schema).decode(this.#tlv) as T;
            } else {
                this.#js = null as T;
            }
        }
        return this.#js;
    }

    /**
     * JSON format.
     */
    get json() {
        if (this.#json === undefined) {
            this.#json = asJson(this.js);
        }
        return this.#json;
    }

    /**
     * Serialized TLV format.
     */
    get tlv() {
        if (this.#tlv === undefined) {
            this.#tlv = TlvOfModel(this.#supervisor.schema).encode(this.#js);
        }
        return this.#tlv;
    }
}

export namespace Envelope {
    export interface Data<T = unknown> {
        id?: string;
        js?: T;
        json?: string;
        tlv?: Bytes;
    }

    export interface Definition<T = unknown> extends Data<T> {
        supervisor: ValueSupervisor;
    }
}
