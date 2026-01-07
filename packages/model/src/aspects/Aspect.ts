/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDeepEqual, serialize } from "#general";
import { DefinitionError } from "../common/DefinitionError.js";

const empty = new Map<new (definition?: any) => Aspect, Aspect>();

// Aspects are immutable, there are not many permutations, and their definitions are largely normalized strings.  So we
// cache them to keep the object count down
const aspectCache = new Map<new (definition?: any) => Aspect, Record<string, Aspect>>();

/**
 * An "aspect" is metadata about a Matter element that affects implementation behavior.  Aspects are mostly "qualities"
 * in the Matter specification except for "constraint" which is not formally described as a quality.
 */
export abstract class Aspect<D = any> {
    definition: D;
    isEmpty = false;
    declare errors?: DefinitionError[];

    get valid() {
        return !this.errors;
    }

    constructor(definition: D) {
        this.definition = definition;
    }

    /**
     * Test for logical equivalence.
     */
    equals(other: any) {
        if (!(other instanceof this.constructor)) {
            return false;
        }
        return isDeepEqual(this.valueOf(), other.valueOf());
    }

    valueOf() {
        return this.isEmpty ? undefined : this.toString();
    }

    // Ensure derivatives implement toString()
    abstract toString(): string;

    error(code: string, message: string) {
        if (!this.errors) {
            this.errors = [];
        }
        this.errors.push({
            code,
            source: `${this.constructor.name} ${serialize(this.definition)}`,
            message,
        });
    }

    abstract extend(other: Aspect): Aspect;

    static create<D, T extends Aspect<D>, This extends new (definition: D) => T>(
        this: This,
        definition: D,
    ): InstanceType<This> {
        if (definition === undefined) {
            let none = empty.get(this);
            if (!none) {
                none = new this(definition);
                empty.set(this, none);
            }
            return none as InstanceType<This>;
        }

        if (definition instanceof this) {
            return definition as InstanceType<This>;
        }

        if (typeof definition === "string") {
            let slot = aspectCache.get(this);
            if (slot === undefined) {
                slot = {};
                aspectCache.set(this, slot);
            }

            let some = slot[definition];
            if (some) {
                return some as InstanceType<This>;
            }

            some = definition === "" ? (this as unknown as { create(): T }).create() : new this(definition);

            slot[definition] = some;

            return some as InstanceType<This>;
        }

        return new this(definition) as InstanceType<This>;
    }

    protected freeze() {
        Object.freeze(this);
    }
}
