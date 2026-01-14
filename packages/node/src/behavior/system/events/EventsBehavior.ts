/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { deepCopy, StorageManager } from "#general";
import { DatatypeModel, FieldElement } from "#model";
import { NonvolatileEventStore, OccurrenceManager, VolatileEventStore } from "#protocol";
import { Behavior } from "../../Behavior.js";

/**
 * Event handling configuration.
 */
export class EventsBehavior extends Behavior {
    static override readonly id = "events";
    static override early = true;

    declare state: EventsBehavior.State;

    override async initialize() {
        const storage = this.env.get(StorageManager).createContext("events");
        let store;
        if (this.state.nonvolatile) {
            store = new NonvolatileEventStore(storage);
        } else {
            store = new VolatileEventStore(storage, this.state.numberBlockSize);
        }

        const events = new OccurrenceManager({ store, bufferConfig: this.state.buffers });
        this.env.set(OccurrenceManager, events);
        await events.construction;
    }

    static override schema = new DatatypeModel(
        {
            name: "EventsState",
            type: "struct",
        },
        FieldElement({ name: "nonvolatile", type: "bool" }),
        FieldElement({ name: "numberBlockSize", type: "uint16" }),
        FieldElement(
            { name: "buffer", type: "struct" },
            FieldElement({ name: "minEventAllowance", type: "uint32" }),
            FieldElement({ name: "maxEventAllowance", type: "uint32" }),
            FieldElement(
                { name: "minPriorityEventAllowance", type: "struct" },
                FieldElement({ name: "critical", type: "uint32" }),
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
