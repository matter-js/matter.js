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
