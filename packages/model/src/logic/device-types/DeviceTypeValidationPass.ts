/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceTypeModel, MatterModel, RequirementModel } from "../../models/index.js";
import type { ConditionAssertions } from "./ConditionAssertions.js";
import type { Component, Singleton } from "./DeviceTypeConformance.js";
import type { DeviceTypeFacts } from "./DeviceTypeFacts.js";
import type { DeviceTypeViolation } from "./DeviceTypeViolation.js";
import { Memo } from "./Memo.js";
import type { ResolvedEndpoint } from "./ResolvedEndpoint.js";

/**
 * One run of device type validation over one or more endpoints that {@link facts} describes, resolved in
 * {@link model}.
 *
 * The checks of a pass share what several endpoints read from the tree: the facts of each endpoint, the conditions
 * of each node scope and the composition facts of each composing endpoint. Judging the endpoints of a node scope one
 * by one otherwise repeats that work per endpoint.
 *
 * A pass must not outlive one synchronous run. The tree may change between runs, and nothing a pass memoizes of it is
 * invalidated. A lookup that reads only {@link model} — the cluster, feature or element a requirement names, for
 * example — outlives the pass and is shared with every other pass resolved in the same model; see
 * `ModelLookups`. What a pass created with a {@link memory} reads of a whole node scope outlives the pass too; see
 * {@link DeviceTypeValidationPass.Memory}.
 *
 * Mutating a model in place after it has validated an endpoint is unsupported: `ModelLookups` keys its entries by
 * model instance, not content, so a mutated model keeps serving lookups from before the mutation. Build a new model
 * instead, e.g. with {@link MatterModel.withClusters}, which already returns a copy.
 */
export class DeviceTypeValidationPass<E> {
    readonly facts: DeviceTypeFacts<E>;
    readonly model: MatterModel;
    readonly memory?: DeviceTypeValidationPass.Memory<E>;

    /** @internal */
    readonly resolved = new Memo<E, ResolvedEndpoint<E>>();

    /** @internal */
    readonly collections = new Memo<E, ConditionAssertions.Collection<E>>();

    /** @internal */
    readonly reaching = new Memo<E, E[]>();

    /** @internal */
    readonly applicationDeviceTypeCounts = new Memo<E, Map<number, number>>();

    /** @internal */
    readonly components = new Memo<E, Map<DeviceTypeModel, Component[]>>();

    /** @internal */
    readonly failures = new Memo<E, Map<RequirementModel, DeviceTypeViolation<E>[]>>();

    /** @internal */
    readonly singletons = new Memo<E, Map<number, Singleton<E>>>();

    /** @internal */
    readonly declarations = new Memo<E, Map<number, Singleton<E>>>();

    constructor(
        facts: DeviceTypeFacts<E>,
        model: MatterModel = MatterModel.standard,
        memory?: DeviceTypeValidationPass.Memory<E>,
    ) {
        this.facts = facts;
        this.model = model;
        this.memory = memory;
    }
}

export namespace DeviceTypeValidationPass {
    /**
     * Values derived from a tree that the passes created with this memory share, so a pass does not derive them again
     * from a whole node scope when the tree has not changed in a way that alters them.
     *
     * The owner of the memory reports the changes to endpoints it observes through {@link changed}; the reader of a
     * kept value must derive it only from facts whose changes the owner observes. A change is weighed only when a pass
     * next asks for a kept value, through {@link revise}: a change to an endpoint the values watch (see {@link hold})
     * discards them, and so does any change the reader's test says alters them. Discarded values are derived again on
     * the next read.
     *
     * @internal
     */
    export class Memory<E> {
        #generation = 0;
        #holds = false;
        readonly #watched = new Set<E>();
        readonly #changed = new Set<E>();
        readonly #reaching = new Map<E, E[]>();

        /**
         * Increases whenever the kept values are discarded.
         */
        get generation() {
            return this.#generation;
        }

        /**
         * The kept reaching endpoints per node endpoint, emptied whenever the kept values are discarded.
         */
        get reaching(): Map<E, E[]> {
            return this.#reaching;
        }

        /**
         * Record that a value of the current generation is kept, and the endpoints any change to which discards it.
         */
        hold(watched: Iterable<E>) {
            this.#holds = true;
            for (const endpoint of watched) {
                this.#watched.add(endpoint);
            }
        }

        /**
         * Note a change to {@link endpoint}, to be weighed by the next {@link revise}. Ignored while no value is held,
         * because the next read derives every value anew.
         */
        changed(endpoint: E) {
            if (this.#holds) {
                this.#changed.add(endpoint);
            }
        }

        /**
         * Discard the kept values when a change noted since the last revision is to a watched endpoint or
         * {@link alters} them.
         */
        revise(alters: (endpoint: E) => boolean) {
            for (const endpoint of this.#changed) {
                if (this.#watched.has(endpoint) || alters(endpoint)) {
                    this.clear();
                    return;
                }
            }
            this.#changed.clear();
        }

        /**
         * Discard every kept value.
         */
        clear() {
            this.#generation++;
            this.#holds = false;
            this.#watched.clear();
            this.#changed.clear();
            this.#reaching.clear();
        }
    }
}
