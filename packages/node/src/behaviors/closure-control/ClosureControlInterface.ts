/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClosureControl } from "@matter/types/clusters/closure-control";

export namespace ClosureControlInterface {
    export interface Base {
        /**
         * On receipt of this command, the closure shall operate to update its position, latch state and/or motion
         * speed.
         *
         * The rationale behind defining the conformance as being purely optional in the table above is to ensure that
         * commands containing one or more fields related to unsupported features are still accepted, rather than being
         * rejected outright. For example, if a simple client, which is not able to determine the capabilities of the
         * server, invokes a command that includes both position and speed, a server that does not support the speed
         * feature would simply ignore the speed field while still adjusting its position as requested.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.2
         */
        moveTo(request: ClosureControl.MoveToRequest): MaybePromise;
    }

    export interface NotInstantaneous {
        /**
         * On receipt of this command, the closure shall stop its movement as fast as the closure is able too.
         *
         * If the server’s MainState attribute has one of the following values:
         *
         *   - Moving
         *
         *   - WaitingForMotion
         *
         *   - Calibrating
         *
         * then any motions shall be stopped and the MainState attribute shall be set to Stopped.
         *
         * A status code of SUCCESS shall always be returned, regardless of the value of the MainState attribute when
         * this command is received.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.1
         */
        stop(): MaybePromise;
    }

    export interface Calibration {
        /**
         * This command is used to trigger a calibration of the closure.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.3
         */
        calibrate(): MaybePromise;
    }
}

export type ClosureControlInterface = {
    components: [
        { flags: {}, methods: ClosureControlInterface.Base },
        { flags: { instantaneous: false }, methods: ClosureControlInterface.NotInstantaneous },
        { flags: { calibration: true }, methods: ClosureControlInterface.Calibration }
    ]
};
