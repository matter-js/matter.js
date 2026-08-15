/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
    interface SymbolConstructor {
        /**
         * The standard "metadata" symbol.
         *
         * TypeScript emits Symbol.metadata for decorators but only declares it under
         * lib.esnext.decorators, which our lib configuration does not include.
         */
        readonly metadata: unique symbol;
    }

    // Must stay identical to lib.esnext.decorators' declaration on Function, which NewableFunction extends
    interface NewableFunction {
        [Symbol.metadata]: DecoratorMetadata | null;
    }
}

if (!(("metadata" in Symbol) as any)) {
    (Symbol as { metadata: symbol }).metadata = Symbol.for("Symbol.metadata");
}
