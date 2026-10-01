/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NodeLifecycle } from "#node/NodeLifecycle.js";
import { deepCopy, StorageManager } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { NonvolatileEventStore, OccurrenceManager, VolatileEventStore } from "@matter/protocol";
import { Behavior } from "../../Behavior.js";

/**
 * Event handling configuration.
 */
export class EventsBehavior extends Behavior {
    static override readonly id = "events";
    static override early = true;

    declare readonly state: EventsBehavior.State;

    override async initialize() {
        this.reactTo((this.endpoint.lifecycle as NodeLifecycle).offline, this.#discardVolatileEvents);

        // A reset initializes again in the same environment.  Replacing the manager would strand everything that holds
        // it, such as the protocol's event reads and subscriptions; a factory reset clears it in resetStorage()
        if (this.env.owns(OccurrenceManager)) {
            return;
        }

        const storage = this.env.get(StorageManager).createContext("events");
        let store;
        if (this.state.nonvolatile) {
            store = new NonvolatileEventStore(storage, this.state.numberBlockSize);
        } else {
            store = new VolatileEventStore(storage, this.state.numberBlockSize);
        }

        const events = new OccurrenceManager({ store, bufferConfig: this.state.buffers });
        this.env.set(OccurrenceManager, events);
        await events.construction;
    }

    /**
     * A device reboot loses volatile events, so a node that goes offline and online again starts with none either.
     */
    async #discardVolatileEvents() {
        if (this.state.nonvolatile) {
            return;
        }
        await this.env.get(OccurrenceManager).clear({ keepNumbering: true });
    }

    static override schema = new DatatypeModel(
        {
            name: "EventsState",
            type: "struct",
        },
        FieldElement({ name: "nonvolatile", type: "bool" }),
        FieldElement({ name: "numberBlockSize", type: "uint16" }),
        FieldElement(
            { name: "buffers", type: "struct" },
            FieldElement({ name: "minEventAllowance", type: "uint32" }),
            FieldElement({ name: "maxEventAllowance", type: "uint32" }),
            FieldElement(
                { name: "minPriorityEventAllowance", type: "struct" },
                FieldElement({ name: "info", type: "uint32" }),
                FieldElement({ name: "debug", type: "uint32" }),
            ),
        ),
    );
}

export namespace EventsBehavior {
    export class State {
        nonvolatile = false;
        numberBlockSize = 1_000;
        buffers = deepCopy(OccurrenceManager.DefaultBufferConfig);
    }
}
