/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import type { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { Abort, MaybePromise, NotImplementedError } from "#general";
import { any, DataModelPath, Schema } from "#model";
import { Envelope } from "./Envelope.js";
import { LocalResponse } from "./LocalResponse.js";

/**
 * A node in the logical API tree structure.
 *
 * {@link ApiResource}s are ephemeral objects created on-demand as the server navigates paths.
 */
export abstract class ApiResource {
    /**
     * The item's identifier in the logical model path.
     */
    abstract readonly id: string;

    /**
     * The item's owner, if any.
     */
    readonly parent?: ApiResource;

    /**
     * Data model path used for diagnostics.
     */
    abstract readonly dataModelPath: DataModelPath;

    /**
     * Value supervisor, if any.
     */
    abstract readonly supervisor?: ValueSupervisor;

    /**
     * Data value.
     */
    abstract readonly value: unknown;

    /**
     * Indicates whether this is an RPC endpoint.
     */
    readonly isInvocable: boolean = false;

    /**
     * Indicates whether this is an event endpoint.
     */
    readonly isSubscribable: boolean = false;

    /**
     * The {@link ApiResource.Kind} for {@link value}.
     */
    abstract readonly valueKind: ApiResource.Kind;

    constructor(parent: undefined | ApiResource) {
        this.parent = parent;
    }

    /**
     * Retrieve the body of the item.
     */
    read() {
        if (this.value === undefined) {
            return;
        }

        return new Envelope({
            supervisor: this.supervisor ?? RootSupervisor.for(any),
            js: this.value,
        });
    }

    /**
     * Create or replace item.
     */
    write(_request: Envelope.Data): void {
        throw new NotImplementedError();
    }

    /**
     * Update item using matter.js patch semantics.
     */
    patch(_request: Envelope.Data): MaybePromise<void> {
        throw new NotImplementedError();
    }

    /**
     * Add a child item of this item.
     */
    add(_request: Envelope.Data): MaybePromise<void> {
        throw new NotImplementedError();
    }

    /**
     * Remove this item.
     */
    delete(): MaybePromise<void> {
        throw new NotImplementedError();
    }

    /**
     * The {@link Schema} for this resource subtree.
     */
    get schema() {
        return this.supervisor?.schema;
    }

    /**
     * Obtain the appropriate {@link ValueSupervisor} for a {@link Schema} in this subtree.
     */
    supervisorFor(schema: Schema) {
        return this.rootSupervisor?.get(schema) ?? RootSupervisor.for(schema);
    }

    /**
     * The {@link RootSupervisor} for this resource subtree.
     */
    get rootSupervisor(): RootSupervisor | undefined {
        return this.parent?.rootSupervisor;
    }

    /**
     * Execute a procedure.
     */
    async invoke(_request?: Envelope.Data): Promise<undefined | Envelope> {
        throw new NotImplementedError();
    }

    /**
     * Subscribe to events.
     */
    // eslint-disable-next-line require-yield
    async *subscribe(
        _abort: Abort.Signal,
        _request?: Envelope.Data,
    ): AsyncGenerator<Envelope<LocalResponse>, void, void> {
        throw new NotImplementedError();
    }

    /**
     * Retrieve a child with the specified ID.
     */
    async childFor(_id: string): Promise<ApiResource | void> {
        return undefined;
    }
}

export namespace ApiResource {
    /**
     * "Kind" values provided in response JSON payloads.
     */
    export type Kind =
        | "ok"
        | "node"
        | "endpoint"
        | "index"
        | "cluster"
        | "attribute"
        | "field"
        | "error"
        | "command"
        | "response"
        | "changes";
}
