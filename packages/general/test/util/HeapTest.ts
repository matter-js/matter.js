/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort } from "#util/Abort.js";
import { Heap } from "#util/Heap.js";

const ONE_TO_ONE_HUNDRED = Array.from({ length: 100 }, (_v, index) => index + 1);

function compareNumbers(a: number, b: number) {
    return a - b;
}

describe("Heap", () => {
    it("produces in correct order", () => {
        const numbers = scramble();

        const heap = new Heap(compareNumbers);
        heap.add(...numbers);
        expect(heap.size).equals(ONE_TO_ONE_HUNDRED.length);
        expect(heap.first).equals(1);

        const result = Array<number | undefined>();
        for (let i = 0; i < numbers.length; i++) {
            result.push(heap.shift());
        }

        expect(result).deep.equals(ONE_TO_ONE_HUNDRED);
        expect(heap.size).equals(0);
    });

    it("streams asynchronously and emits empty", async () => {
        const numbers = scramble();

        const heap = new Heap(compareNumbers);
        heap.add(...numbers);

        const collected = Array<number>();

        const abort = new Abort();

        heap.deleted.on(onFirstStageDelete);

        const done = (async () => {
            for await (const number of heap.stream(abort)) {
                collected.push(number);
            }
        })();

        await done;

        expect(collected).deep.equals([...ONE_TO_ONE_HUNDRED, ...ONE_TO_ONE_HUNDRED]);

        function onFirstStageDelete() {
            if (heap.size) {
                return;
            }

            heap.deleted.off(onFirstStageDelete);

            // Refill after setTimeout so it's async
            setTimeout(() => {
                heap.add(...numbers);
                heap.deleted.on(onSecondStageDelete);
            }, 0);
        }

        function onSecondStageDelete() {
            if (heap.size) {
                return;
            }

            abort();
        }
    });

    it("deletes", async () => {
        const numbers = scramble();

        const heap = new Heap(compareNumbers);
        heap.add(...numbers);

        // Delete all multiples of 10
        for (let i = 10; i < ONE_TO_ONE_HUNDRED.length + 1; i += 10) {
            heap.delete(i);
        }

        const withoutTens = ONE_TO_ONE_HUNDRED.filter(n => n % 10);

        const result = Array<number | undefined>();
        for (let i = 0; i < withoutTens.length; i++) {
            result.push(heap.shift());
        }

        try {
            expect(result).deep.equals(withoutTens);
        } catch (e) {
            console.error(`Failed heap delete input: ${JSON.stringify(numbers)}`);
            throw e;
        }
    });

    it("holds each item at most once", () => {
        const emitted = Array<number>();
        const heap = new Heap(compareNumbers);
        heap.added.on(n => {
            emitted.push(n);
        });

        heap.add(1, 2, 2, 3, 3, 3);

        expect(heap.size).equals(3);
        expect(emitted).deep.equals([1, 2, 3]); // no emit for the skipped duplicates

        const result = Array<number | undefined>();
        while (heap.size) {
            result.push(heap.shift());
        }
        expect(result).deep.equals([1, 2, 3]);
    });

    it("can delete an item added after an earlier delete", () => {
        const heap = new Heap(compareNumbers);
        heap.add(1, 2, 3, 4, 5);

        // Establish position tracking, then add a value large enough to remain at a leaf (it does not bubble, so its
        // position must be registered by add() itself).
        expect(heap.delete(2)).equals(true);
        heap.add(100);
        expect(heap.delete(100)).equals(true);

        const result = Array<number | undefined>();
        while (heap.size) {
            result.push(heap.shift());
        }
        expect(result).deep.equals([1, 3, 4, 5]);
    });

    it("supports delete then re-add of the same item", () => {
        const heap = new Heap(compareNumbers);
        heap.add(1, 2, 3);

        expect(heap.delete(2)).equals(true);
        heap.add(2); // allowed again: no longer present
        expect(heap.size).equals(3);
        expect(heap.delete(2)).equals(true);
        expect(heap.size).equals(2);
    });

    it("delete returns false for an absent item", () => {
        const heap = new Heap(compareNumbers);
        heap.add(1, 2, 3);

        expect(heap.delete(99)).equals(false);
        expect(heap.size).equals(3);
    });

    it("reports isEmpty", () => {
        const heap = new Heap(compareNumbers);
        expect(heap.isEmpty).equals(true);
        heap.add(1);
        expect(heap.isEmpty).equals(false);
        heap.shift();
        expect(heap.isEmpty).equals(true);
    });

    it("emits firstChanged on insert and delete", () => {
        const emitted = Array<number | undefined>();
        const heap = new Heap(compareNumbers);
        heap.firstChanged.on(num => {
            emitted.push(num);
        });

        heap.add(10);
        heap.add(20);
        heap.add(5);
        heap.shift();
        heap.shift();
        heap.shift();
        heap.shift();

        expect(emitted).deep.equals([10, 5, 10, 20, undefined]);
    });
});

function scramble() {
    const numbers = [...ONE_TO_ONE_HUNDRED];
    for (let i = 0; i < numbers.length; i++) {
        const swapWith = Math.floor(Math.random() * numbers.length);
        [numbers[i], numbers[swapWith]] = [numbers[swapWith], numbers[i]];
    }
    return numbers;
}
