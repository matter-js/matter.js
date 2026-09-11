/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "@matter/main";
import { LineQueue } from "@matter/testing";

/**
 * What a registered log owner is, so a destination writes only the lines it owns.
 */
export type LogOwnerKind = "device" | "adapter";

interface Registration {
    kind: LogOwnerKind;
    queue: LineQueue;
}

const registrations = new Map<Environment, Registration>();

/**
 * Claim every log message a node's {@link Environment} emits for {@link queue}.
 *
 * matter.js stamps each message with the environment of the component that wrote it, so a line reaches the right log
 * even when it comes from a socket or timer callback, where no call stack identifies the node.
 */
export function registerLogOwner(env: Environment, kind: LogOwnerKind, queue: LineQueue) {
    registrations.set(env, { kind, queue });
}

export function unregisterLogOwner(env: Environment) {
    registrations.delete(env);
}

/**
 * The registration a message's owner belongs to, if any.
 *
 * A node may build services in a child environment, so this searches the environment's ancestors as well.
 */
export function registrationForOwner(owner: unknown): Registration | undefined {
    for (let env = owner instanceof Environment ? owner : undefined; env !== undefined; env = env.parent) {
        const registration = registrations.get(env);
        if (registration !== undefined) {
            return registration;
        }
    }
}
