/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Environmental, Millis, Semaphore } from "#general";

const CONCURRENT_QUEUED_INTERACTIONS = 4;
const INTERACTION_QUEUE_DELAY = Millis(100);

export class InteractionQueue extends Semaphore {
    constructor() {
        super(CONCURRENT_QUEUED_INTERACTIONS, INTERACTION_QUEUE_DELAY);
    }

    static [Environmental.create](env: Environment) {
        const instance = new InteractionQueue();
        env.set(InteractionQueue, instance);
        return instance;
    }
}
