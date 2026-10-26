/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, ImplementationError, Logger, Seconds } from "@matter/main";
import type { CommissioningTarget, ControllerAdapter, LogFollower, LogLine } from "@matter/testing";
import { UnsupportedByControllerError } from "@matter/testing";
import { settleWithin } from "./tc-support.js";

const logger = Logger.get("TC-SC-3.5");

/** How long a retired attempt's commissioning may take to end once its controller closed. */
const ATTEMPT_SETTLE_TIMEOUT = Seconds(10);

/** The log of one attempt's controller, named for the evidence bundle. */
export interface AttemptLog {
    name: string;
    lines: LogLine[];
}

interface Attempt {
    index: number;
    adapter: ControllerAdapter;
    log?: LogFollower;
    outcome?: Promise<void>;
}

/**
 * Runs each commissioning attempt of TC-SC-3.5 on a DUT controller of its own and does not wait for its outcome.
 *
 * TC_SC_3_5.py judges every attempt on TH_SERVER's side and prompts for the next one once it has seen what it
 * expects. Starting an attempt closes the previous attempt's controller first, so no earlier attempt still discovers
 * TH_SERVER or retries its handshake while the next one runs.
 *
 * {@link start} and {@link retire} must not overlap.
 */
export class CommissioningAttempts {
    readonly #build: () => ControllerAdapter;
    readonly #settleTimeout: Duration;
    readonly #logs = new Array<AttemptLog>();
    #current?: Attempt;
    #started = 0;

    constructor(build: () => ControllerAdapter, settleTimeout: Duration = ATTEMPT_SETTLE_TIMEOUT) {
        this.#build = build;
        this.#settleTimeout = settleTimeout;
    }

    /** How many attempts were started. */
    get count() {
        return this.#started;
    }

    /** The log of every retired attempt's controller that started, in attempt order. */
    get logs(): readonly AttemptLog[] {
        return this.#logs;
    }

    /**
     * Retires the previous attempt, then starts a new controller and commissioning `target` on it. Resolves once the
     * commissioning was started, with the attempt's index and the controller's build. A rejection of the commissioning
     * never reaches the caller: it is logged at debug, or at warn where the controller refused the request itself.
     */
    async start(target: CommissioningTarget) {
        await this.retire();

        const adapter = this.#build();
        const attempt: Attempt = { index: this.#started++, adapter };
        this.#current = attempt;
        await attempt.adapter.start();
        attempt.log = attempt.adapter.log;
        attempt.outcome = attempt.adapter.commission(target).then(
            ref => logger.debug(`Commissioning attempt ${attempt.index} commissioned node ${ref}`),
            error => {
                if (error instanceof UnsupportedByControllerError || error instanceof ImplementationError) {
                    logger.warn(`Commissioning attempt ${attempt.index} was refused by its controller:`, error);
                } else {
                    logger.debug(`Commissioning attempt ${attempt.index} ended without commissioning:`, error);
                }
            },
        );

        return { index: attempt.index, build: attempt.adapter.build };
    }

    /**
     * Closes the current attempt's controller and keeps its log, then waits a bounded time for its commissioning to
     * end. Rethrows a failure to close; the attempt counts as retired either way.
     */
    async retire() {
        const attempt = this.#current;
        if (attempt === undefined) {
            return;
        }
        this.#current = undefined;

        try {
            await attempt.adapter.close();
        } finally {
            if (attempt.log !== undefined) {
                this.#logs.push({ name: `controller-dut-attempt-${attempt.index}`, lines: attempt.log.lines });
            }
        }

        if (attempt.outcome === undefined) {
            return;
        }
        const settled = await settleWithin(
            `TC-SC-3.5 commissioning attempt ${attempt.index}`,
            attempt.outcome,
            this.#settleTimeout,
        );
        if (settled.kind === "timeout") {
            logger.debug(
                `Commissioning attempt ${attempt.index} had not ended ${Duration.format(this.#settleTimeout)} after ` +
                    "its controller closed",
            );
        }
    }
}
