/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { EndpointNumber } from "@matter/main/types";

/**
 * Hands out endpoint numbers as devices are created, so a device's child endpoints never take a number that a later
 * `--device type:N` asks for. A device's children follow it as with the `DynamicEndpointIdAllocator` of the CHIP
 * all-devices-app.
 */
export class EndpointNumberAllocator {
    readonly #reserved: ReadonlySet<number>;
    readonly #taken = new Set<number>();
    #next = 1;

    /**
     * @param reserved the numbers `--device type:N` flags ask for, which only {@link take} hands out
     */
    constructor(reserved: Iterable<number>) {
        this.#reserved = new Set(reserved);
    }

    /**
     * The lowest number that is neither reserved nor taken, for a device the command line gives no number. Its
     * children continue after it through {@link next}.
     */
    first(): EndpointNumber {
        this.#next = 1;
        return this.next();
    }

    /**
     * The next number after the last one handed out that is neither reserved nor taken, for a device's child
     * endpoints.
     */
    next(): EndpointNumber {
        while (this.#reserved.has(this.#next) || this.#taken.has(this.#next)) {
            this.#next++;
        }
        return this.#hand(this.#next);
    }

    /**
     * Hands out the reserved {@link number} and continues {@link next} after it, so a device's child endpoints follow
     * it as CHIP's `ForceNext` does.
     *
     * @throws {ImplementationError} when {@link number} is not reserved or is taken already
     */
    take(number: number): EndpointNumber {
        if (!this.#reserved.has(number)) {
            throw new ImplementationError(`Endpoint ${number} is not reserved, so it cannot be taken`);
        }
        if (this.#taken.has(number)) {
            throw new ImplementationError(`Endpoint ${number} is taken already`);
        }
        this.#next = number + 1;
        return this.#hand(number);
    }

    #hand(number: number) {
        this.#taken.add(number);
        return EndpointNumber(number);
    }
}
