/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    asError,
    CancelablePromise,
    CanceledError,
    Diagnostic,
    Duration,
    Logger,
    MatterAggregateError,
    Time,
    Timespan,
} from "#general";
import { STANDARD_COMMISSIONING_TIMEOUT } from "#types";
import type { Advertiser } from "./Advertiser.js";
import { ServiceDescription } from "./ServiceDescription.js";

const logger = Logger.get("Advertisement");

/**
 * An advertisement for a discrete service.
 */
export abstract class Advertisement<T extends ServiceDescription = ServiceDescription> {
    /**
     * The service advertised.
     *
     * This is a unique ID associated with the advertisement.
     */
    readonly service: string;

    /**
     * The information advertised.
     */
    readonly description: T;

    /**
     * The {@link Advertiser} that owns this advertisement.
     */
    readonly advertiser: Advertiser;

    /**
     * Configuration options.
     */
    readonly options: Advertisement.Options;

    #isBroadcasting = false;
    #closed?: Promise<void>;
    #startedAt = Time.nowMs;

    /**
     * Current activity.  This is a promise with helpers for base implementations.
     */
    #activity?: ActivityContext;

    constructor(advertiser: Advertiser, service: string, description: T, options?: Advertisement.Options) {
        this.options = options ?? {};
        this.service = service;
        this.advertiser = advertiser;
        this.description = description;

        advertiser.advertisements.add(this);

        // Initial activity just handles async setup
        this.#start(this.onCreate.bind(this));
    }

    /**
     * Begin automatic broadcast.
     */
    start(event: Advertiser.BroadcastEvent) {
        if (this.#closed) {
            return;
        }

        // If we are already broadcasting, do not reset the schedule.  In cases where the schedule should reset,
        // higher-level components replace the advertisement or stop manually
        if (this.isBroadcasting) {
            return;
        }

        // Run broadcast as the current activity
        this.#start(context => this.#run(context, event));
    }

    /**
     * End automatic broadcast.
     */
    stop() {
        this.#activity?.cancel();
        this.#isBroadcasting = false;
    }

    /**
     * Notify the advertiser that a client connection to the advertised service is established.
     */
    serviceConnected() {
        // No default behavior
    }

    /**
     * Notify the advertiser that there is no client connection to the advertised service.
     */
    serviceDisconnected() {
        // No default behavior
    }

    /**
     * Close the advertisement but do not wait for the close to finish.
     *
     * The advertisement is still tracked by the advertiser until closed.
     */
    cancel() {
        this.close().catch(e => {
            // This shouldn't happen because close should log errors itself
            logger.error("Unhandled error closing advertisement for", Diagnostic.strong(this.service), e);
        });
    }

    /**
     * Close the advertisement.
     */
    close() {
        if (this.#closed) {
            return this.#closed;
        }

        return (this.#closed = this.#close());
    }

    async #close() {
        try {
            this.#activity?.cancel();
            await this.#activity;

            try {
                await this.onClose();
            } catch (e) {
                logger.error("Unhandled error closing advertisement for", Diagnostic.strong(this.service), e);
            }
        } finally {
            this.advertiser.advertisements.delete(this);
        }
    }

    /**
     * Async setup logic.
     */
    protected async onCreate() {
        // Deduplicate advertisements.  There may only be a single commissioning advertisement per advertiser and a
        // single operational advertisement per advertiser+service
        const duplicates = [...this.advertiser.advertisements].filter(this.isDuplicate.bind(this));
        if (duplicates.length) {
            await Advertisement.closeAll(duplicates);
        }
    }

    /**
     * Async cleanup logic.
     */
    protected async onClose() {}

    /**
     * Indicates that broadcasts should omit private details.
     */
    protected get isPrivacyMasked() {
        // Private broadcast configured explicitly
        if (this.options.omitPrivateDetails) {
            return true;
        }

        // Extended announcement
        if (this.duration >= STANDARD_COMMISSIONING_TIMEOUT) {
            return true;
        }

        return false;
    }

    /**
     * Implement automatic advertising.
     */
    protected abstract run(context: Advertisement.ActivityContext, event: Advertiser.BroadcastEvent): Promise<void>;

    isCommissioning(): this is
        | Advertisement<ServiceDescription.Commissionable>
        | Advertisement<ServiceDescription.Commissioner> {
        return ServiceDescription.isCommissioning(this.description);
    }

    isOperational(): this is Advertisement<ServiceDescription.Operational> {
        return ServiceDescription.isOperational(this.description);
    }

    /**
     * Cancel a set of advertisements.
     */
    static cancelAll(ads: Iterable<Advertisement>) {
        for (const ad of ads) {
            ad.cancel();
        }
    }

    /**
     * Cancel a set of advertisements and wait for them to complete.
     */
    static async closeAll(ads: Iterable<Advertisement>) {
        await MatterAggregateError.allSettled([...ads].map(ad => ad.close()));
    }

    /**
     * Identify other advertisers for the same service.  The advertiser will close these automatically.
     */
    abstract isDuplicate(other: Advertisement): boolean;

    /**
     * Total duration so far.
     */
    get duration() {
        return Timespan(this.#startedAt, Time.nowMs).duration;
    }

    /**
     * True if the advertisement is actively broadcasting.
     */
    get isBroadcasting() {
        return this.#isBroadcasting;
    }

    protected dict(values?: Record<string, unknown>) {
        return Diagnostic.dict({ kind: this.description.kind, service: this.service, ...values });
    }

    #start(executor: (context: ActivityContext) => Promise<void>) {
        // Only one activity may be active
        const previous = this.#activity;
        previous?.cancel();

        this.#activity = new ActivityContext(async context => {
            // Wait for previous activity to complete
            if (previous) {
                await previous;
            }

            // Run the new activity
            try {
                await executor(context);
            } finally {
                // Clear the current activity if it's this one
                if (this.#activity === context) {
                    this.#activity = undefined;
                }
            }
        });
    }

    async #run(context: ActivityContext, event: Advertiser.BroadcastEvent) {
        // Diagnostics
        const dict = this.dict();
        using advertising = this.advertiser.join("advertising");
        Object.assign(advertising.details, dict);
        logger.debug("Begin auto broadcast", dict);

        // Perform advertisement
        try {
            this.#isBroadcasting = true;
            await this.run(context, event);
        } catch (e) {
            if (!(e instanceof CanceledError)) {
                logger.error("Unhandled error during automatic advertisement for", Diagnostic.strong(this.service), e);
            }
        } finally {
            if (this.#activity === context) {
                // We clear this flag in stop() but it will still be set if the automatic broadcast period elapses
                this.#isBroadcasting = false;
            }
        }

        logger.debug("End auto broadcast", this.dict());
    }
}

export namespace Advertisement {
    export interface Options {
        /**
         * Set this to omit optional details from broadcasts that may affect privacy.
         *
         * Per core spec 5.4.2.3.1, the device always omits vendor ID, product ID and extended data during extended
         * announcement.  Set this value to omit this fields unconditionally.
         */
        omitPrivateDetails?: boolean;
    }

    export interface ActivityContext {
        /**
         * Enter cancelable sleep.
         *
         * Throws {@link CanceledError} if interrupted.  If thrown from {@link run} this will result in the promise
         * resolving.
         */
        sleep(name: string, duration: Duration): Promise<void>;

        /** True if the activity has been canceled. */
        cancelled: boolean;
    }
}

class ActivityContext extends CancelablePromise implements Advertisement.ActivityContext {
    #sleep?: CancelablePromise;
    #cancelReason?: Error;

    constructor(executor: (context: ActivityContext) => Promise<void>) {
        let resolve, reject;
        super((res, rej) => {
            resolve = res;
            reject = rej;
        });

        executor(this).then(resolve, cause => {
            if (cause instanceof CanceledError) {
                resolve!();
            } else {
                reject!(cause);
            }
        });
    }

    sleep(name: string, duration: Duration) {
        this.abortIfCanceled();

        const sleep = Time.sleep(name, duration).finally(() => {
            if (this.#sleep === sleep) {
                this.#sleep = undefined;
            }
        });

        this.#sleep = sleep;
        return sleep;
    }

    protected abortIfCanceled() {
        if (this.#cancelReason) {
            throw this.#cancelReason;
        }
    }

    protected override onCancel(reason: unknown) {
        if (this.#cancelReason) {
            return;
        }
        this.#cancelReason = asError(reason);

        if (this.#sleep) {
            this.#sleep.cancel(reason);
        }
    }

    get cancelled() {
        return this.#cancelReason !== undefined;
    }
}
