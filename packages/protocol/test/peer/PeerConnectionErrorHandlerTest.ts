/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelStatusResponseError } from "#securechannel/SecureChannelMessenger.js";
import { Duration, Minutes, Seconds } from "@matter/general";
import { GeneralStatusCode, SecureChannelStatusCode } from "@matter/types";

/**
 * Tests for per-connection handleError in PeerConnection.
 *
 * PeerConnection's handleConnectionError is a closure requiring full integration context.  These tests validate
 * the composable behaviors:
 *
 * 1. handleError precedence (per-connection options vs shared context)
 * 2. handleError delay override contract (return Duration to override, undefined to keep, throw to abort)
 * 3. The commissioning-specific handler correctly identifies NoSharedTrustRoots
 */

describe("PeerConnection error handler", () => {
    /**
     * Simulates the handleError selection logic from PeerConnection.handleConnectionError.
     */
    function selectHandler(
        optionsHandler?: (error: Error) => Duration | void,
        contextHandler?: (error: Error) => Duration | void,
    ) {
        return optionsHandler ?? contextHandler;
    }

    /**
     * Simulates the delay override logic from PeerConnection.handleConnectionError.
     */
    function applyHandler(
        handler: ((error: Error) => Duration | void) | undefined,
        error: Error,
        defaultDelay: Duration,
    ): { delay: Duration; aborted: boolean } {
        if (handler === undefined) {
            return { delay: defaultDelay, aborted: false };
        }
        try {
            const result = handler(error);
            return { delay: result ?? defaultDelay, aborted: false };
        } catch {
            return { delay: defaultDelay, aborted: true };
        }
    }

    describe("handler selection precedence", () => {
        it("prefers per-connection handler over context handler", () => {
            const optionsHandler = () => Seconds(1);
            const contextHandler = () => Seconds(99);

            expect(selectHandler(optionsHandler, contextHandler)).equals(optionsHandler);
        });

        it("falls back to context handler when no per-connection handler", () => {
            const contextHandler = () => Seconds(99);

            expect(selectHandler(undefined, contextHandler)).equals(contextHandler);
        });

        it("returns undefined when neither handler is set", () => {
            expect(selectHandler(undefined, undefined)).equals(undefined);
        });
    });

    describe("delay override contract", () => {
        const defaultDelay = Minutes(5);

        it("overrides delay when handler returns a duration", () => {
            const handler = () => Seconds(15);
            const error = new Error("test");

            const { delay, aborted } = applyHandler(handler, error, defaultDelay);
            expect(delay).equals(Seconds(15));
            expect(aborted).equals(false);
        });

        it("keeps default delay when handler returns undefined", () => {
            const handler = () => undefined;
            const error = new Error("test");

            const { delay, aborted } = applyHandler(handler, error, defaultDelay);
            expect(delay).equals(defaultDelay);
            expect(aborted).equals(false);
        });

        it("signals abort when handler throws", () => {
            const handler = () => {
                throw new Error("fatal");
            };
            const error = new Error("test");

            const { aborted } = applyHandler(handler, error, defaultDelay);
            expect(aborted).equals(true);
        });

        it("keeps default delay when no handler is set", () => {
            const error = new Error("test");

            const { delay, aborted } = applyHandler(undefined, error, defaultDelay);
            expect(delay).equals(defaultDelay);
            expect(aborted).equals(false);
        });
    });

    describe("commissioning NoSharedTrustRoots handler", () => {
        /**
         * Reproduces the handleError callback from ControllerCommissioner.transitionToCase.
         */
        function commissioningHandler(error: Error): Duration | void {
            const csre = ChannelStatusResponseError.of(error);
            if (csre?.protocolStatusCode === SecureChannelStatusCode.NoSharedTrustRoots) {
                return Seconds(15);
            }
        }

        it("returns 15s for NoSharedTrustRoots", () => {
            const error = new ChannelStatusResponseError(
                "no shared trust roots",
                GeneralStatusCode.Failure,
                SecureChannelStatusCode.NoSharedTrustRoots,
            );

            expect(commissioningHandler(error)).equals(Seconds(15));
        });

        it("returns undefined for other ChannelStatusResponseErrors", () => {
            const error = new ChannelStatusResponseError(
                "session not found",
                GeneralStatusCode.Failure,
                SecureChannelStatusCode.InvalidParam,
            );

            expect(commissioningHandler(error)).equals(undefined);
        });

        it("returns undefined for non-ChannelStatusResponseError", () => {
            const error = new Error("generic error");

            expect(commissioningHandler(error)).equals(undefined);
        });

        it("overrides default peer error delay in full flow", () => {
            const error = new ChannelStatusResponseError(
                "no shared trust roots",
                GeneralStatusCode.Failure,
                SecureChannelStatusCode.NoSharedTrustRoots,
            );
            const defaultDelay = Minutes(5);

            const { delay } = applyHandler(commissioningHandler, error, defaultDelay);
            expect(delay).equals(Seconds(15));
        });

        it("does not override delay for unrelated errors in commissioning", () => {
            const error = new Error("something else");
            const defaultDelay = Minutes(5);

            const { delay } = applyHandler(commissioningHandler, error, defaultDelay);
            expect(delay).equals(defaultDelay);
        });
    });
});
