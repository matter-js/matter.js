/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";

export namespace SmokeCoAlarmInterface {
    export interface Base {
        /**
         * This command shall initiate a device self-test. The return status shall indicate whether the test was
         * successfully initiated. Only one SelfTestRequest may be processed at a time. When the value of the
         * ExpressedState attribute is any of SmokeAlarm, COAlarm, Testing, InterconnectSmoke, InterconnectCO, the
         * device shall NOT execute the self-test, and shall return status code BUSY.
         *
         * Upon successful acceptance of SelfTestRequest, the TestInProgress attribute shall be set to True and
         * ExpressedState attribute shall be set to Testing. Any faults identified during the test shall be reflected in
         * the appropriate attributes and events. Upon completion of the self test procedure, the SelfTestComplete event
         * shall be generated, the TestInProgress attribute shall be set to False and ExpressedState attribute shall be
         * updated to reflect the current state of the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.7.1
         */
        selfTestRequest(): MaybePromise;
    }
}

export type SmokeCoAlarmInterface = { components: [{ flags: {}, methods: SmokeCoAlarmInterface.Base }] };
