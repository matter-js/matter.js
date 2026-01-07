/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Producer } from "./producer.js";
import { Style } from "./style.js";

export interface Consumer {
    /**
     * Add text.
     *
     * If tokenized, the tokens must be in the form returned by {@link tokenize} for correct processing.
     */
    write(...text: Producer.Sequence): void;

    /**
     * Current state of the destination.
     */
    readonly state: Consumer.State;

    /**
     * Settle output state after generating all output.
     */
    close(): void;
}

export namespace Consumer {
    export interface Options {
        linePrefix?: string;
        style?: Style;
        terminalWidth?: number;
        styleEnabled?: boolean;
        buffer?: boolean;
    }

    export interface State extends Options {
        (options?: Options): Context;
        (options?: Options, executor?: () => void): void;

        readonly availableWidth: number | undefined;
        readonly remainingWidth: number | undefined;

        onRevert(fn: () => void): void;
        offRevert(fn: () => void): void;
    }

    export interface Context {
        close(): void;
        [Symbol.dispose](): void;
    }
}
