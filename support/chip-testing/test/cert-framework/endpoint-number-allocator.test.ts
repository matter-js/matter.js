/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { EndpointNumberAllocator } from "../../src/devices/EndpointNumberAllocator.js";

describe("EndpointNumberAllocator", () => {
    it("hands out the next free number, skipping reserved and taken ones", () => {
        const numbers = new EndpointNumberAllocator([2, 4]);

        expect([numbers.next(), numbers.next(), numbers.next()]).deep.equals([1, 3, 5]);
    });

    it("hands out a reserved number only when it is taken", () => {
        const numbers = new EndpointNumberAllocator([2]);

        expect(numbers.next()).equals(1);
        expect(numbers.take(2)).equals(2);
        expect(numbers.next()).equals(3);
    });

    it("continues after a taken number, so a device's children follow it", () => {
        const numbers = new EndpointNumberAllocator([3, 5]);

        expect(numbers.take(5)).equals(5);
        expect([numbers.next(), numbers.next()]).deep.equals([6, 7]);
    });

    it("never hands out a number again after it was taken", () => {
        const numbers = new EndpointNumberAllocator([1, 3]);

        expect(numbers.take(3)).equals(3);
        expect(numbers.take(1)).equals(1);
        expect(numbers.next()).equals(2);
        expect(numbers.next()).equals(4);
    });

    it("refuses to take a number that is taken already", () => {
        const numbers = new EndpointNumberAllocator([2]);
        numbers.take(2);

        expect(() => numbers.take(2)).throws(ImplementationError, "Endpoint 2 is taken already");
    });

    it("refuses to take a number that is not reserved", () => {
        const numbers = new EndpointNumberAllocator([2]);

        expect(() => numbers.take(3)).throws(ImplementationError, "Endpoint 3 is not reserved, so it cannot be taken");
    });
});
