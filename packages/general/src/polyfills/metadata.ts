/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
    interface SymbolConstructor {
        /**
         * The standard "metadata" symbol.
         *
         * Strangely, TypeScript monkeypatches Symbol.metadata, but not the types.
         */
        readonly metadata: unique symbol;
    }

    interface NewableFunction {
        [Symbol.metadata]?: undefined | DecoratorMetadataObject;
    }
}

if (!(("metadata" in Symbol) as any)) {
    (Symbol as { metadata: symbol }).metadata = Symbol.for("Symbol.metadata");
}
