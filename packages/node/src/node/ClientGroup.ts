/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ActionContext } from "#behavior/context/ActionContext.js";
import { Interactable } from "#protocol";
import { ServerNodeStore } from "#storage/index.js";
import { ClientNode } from "./ClientNode.js";
import { ClientGroupInteraction } from "./client/ClientGroupInteraction.js";

export class ClientGroup extends ClientNode {
    #interaction?: ClientGroupInteraction;

    override get isGroup() {
        return true;
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
