/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, ObservableValue } from "#general";

/**
 * Tracks activity associated with a node.
 */
export class NodeActivity {
    #actors = new Set<NodeActivity.Activity>();
    #inactive = ObservableValue(true);

    get inactive() {
        return this.#inactive;
    }

    get actors() {
        return [...this.#actors.values()];
    }

    begin(description: unknown, onClose?: () => void) {
        const elapsed = Diagnostic.elapsed();
        const actor: NodeActivity.Activity = {
            stack: [description],

            get elapsed() {
                return elapsed;
            },

            get [Diagnostic.value]() {
                const result = Array<unknown>();

                for (const frame of this.stack) {
                    if (result.length) {
                        result.push("▸");
                    }
                    result.push(frame);
                }

                return result;
            },

            frame(description: unknown) {
                this.stack.push(description);
                return {
                    [Symbol.dispose]: () => {
                        this.stack.pop();
                    },
                };
            },

            close: () => {
                onClose?.();

                this.#actors.delete(actor);

                if (!this.#actors.size) {
                    this.#inactive.emit(true);
                }
            },

            [Symbol.dispose]: () => {
                actor.close();
            },
        };

        this.#actors.add(actor);

        if (this.#actors.size === 1) {
            this.#inactive.emit(false);
        }

        return actor;
    }

    get [Diagnostic.value]() {
        if (!this.#actors.size) {
            return Diagnostic.list([Diagnostic.weak("none")]);
        }

        return Diagnostic.list(this.actors);
    }
}

export namespace NodeActivity {
    export interface Activity extends Disposable {
        readonly stack: unknown[];
        readonly elapsed: Diagnostic.Elapsed;
        readonly [Diagnostic.value]: unknown;
        frame(description: unknown): Disposable;
        close(): void;
    }

    export const activityKey = Symbol("activity");

    export interface WithActivity {
        [activityKey]?: NodeActivity.Activity;
    }
}
