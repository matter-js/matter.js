/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { Interactable } from "@matter/protocol";
import { ClientGroupInteraction, InvalidGroupOperationError } from "./client/ClientGroupInteraction.js";
import { ClientNode } from "./ClientNode.js";

/**
 * A Matter group, addressed like a peer.  Commands through its endpoints are sent as group commands with no endpoint in
 * their paths, and nobody answers them: a command with a response resolves to `undefined`.  An attribute write to the
 * group goes through {@link interaction} with a group path (cluster and attribute, no endpoint); writing state on one
 * of its endpoints is not supported.  Reads and subscriptions are refused.
 */
export class ClientGroup extends ClientNode {
    #interaction?: ClientGroupInteraction;

    override readonly nodeType = "group" as const;

    override async get(_selector?: unknown, _options?: unknown): Promise<never> {
        throw new InvalidGroupOperationError("Groups do not support reading attributes");
    }

    override async getStateOf(_type?: unknown, _selector?: unknown, _options?: unknown): Promise<never> {
        throw new InvalidGroupOperationError("Groups do not support reading attributes");
    }

    override get interaction(): Interactable<ActionContext> {
        if (this.#interaction === undefined) {
            this.#interaction = new ClientGroupInteraction(this);
        }

        return this.#interaction;
    }

    protected override get store() {
        return this.env.get(ServerNodeStore).clientStores.storeForGroup(this);
    }
}

export namespace ClientGroup {
    export function is(value: unknown): value is ClientGroup {
        return value instanceof ClientGroup;
    }
}
