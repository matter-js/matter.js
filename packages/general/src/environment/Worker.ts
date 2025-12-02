/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagnosticPresentation } from "#log/DiagnosticPresentation.js";
import { Construction } from "#util/Construction.js";
import { Cancellable, Destructable } from "#util/Lifecycle.js";
import { Lifetime } from "#util/Lifetime.js";
import { MaybePromise } from "#util/Promises.js";

/**
 * An self-describing object that adheres to matter.js conventions for lifecycle and diagnostics.
 *
 * It's best to track workers as part of other components, but workers with no other home may be installed into
 * {@link RuntimeService}.  The state of the runtime is dependent on installed workers.  Any JS object may be a worker
 * but the runtime's interaction with workers varies as documented here.
 */
export interface Worker extends Partial<PromiseLike<any>>, Partial<Cancellable>, Partial<Destructable> {
    /**
     * If the worker supports {@link Construction}, the runtime will monitor the worker's lifecycle:
     *
     *   - If the worker crashed (e.g. experiences an error during initialization) the runtime will cancel all
     *     workers and exit
     *
     *   - If the worker is destroyed the runtime deletes it from the set of known workers
     */
    construction?: Construction<any>;

    /**
     * If the worker supports {@link Symbol.asyncDispose} the runtime will invoke when the worker is no longer
     * needed.  This happens if:
     *
     *   - The worker is a {@link PromiseLike} that resolves
     *
     *   - The worker's {@link construction} status changed as noted above
     *
     *   - The runtime is canceled via {@link RuntimeService.cancel}
     */
    [Symbol.asyncDispose]?: () => void | Promise<void>;

    /**
     * Workers may implement {@link Symbol.dispose} to handle disposal.  Works the same as the async equivalent.
     */
    [Symbol.dispose]?: () => void;

    /**
     * If label is present, it will be presented in diagnostics.  This takes precedence over [Diagnostic.value].
     */
    [DiagnosticPresentation.name]?: unknown;
}

/**
 * Create a {@link Worker} with {@link name} and lifetime that ends when {@link done} resolves.
 */
export function Worker({
    name,
    done,
    lifetime,
}: {
    name: string;
    done?: MaybePromise<void>;
    lifetime?: Lifetime.Owner;
}): Worker | undefined {
    if (!done) {
        return;
    }

    const ongoing = (lifetime ?? Lifetime.process).join(name);
    const worker = Promise.resolve(done).finally(() => ongoing[Symbol.dispose]()) as Worker;
    worker[DiagnosticPresentation.name] = name;

    return worker;
}
