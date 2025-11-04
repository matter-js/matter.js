/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { GeneralDiagnostics } from "#clusters/general-diagnostics";

export namespace GeneralDiagnosticsInterface {
    export interface Base {
        /**
         * This command shall be supported to provide a means for certification tests to trigger some test-plan-specific
         * events, necessary to assist in automation of device interactions for some certification test cases. This
         * command shall NOT cause any changes to the state of the device that persist after the last fabric is removed.
         *
         * The fields for the TestEventTrigger command are as follows:
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.1
         */
        testEventTrigger(request: GeneralDiagnostics.TestEventTriggerRequest): MaybePromise;

        /**
         * This command may be used by a client to obtain a correlated view of both System Time, and, if currently
         * synchronized and supported, "wall clock time" of the server. This can help clients establish time correlation
         * between their concept of time and the server’s concept of time. This is especially useful when processing
         * event histories where some events only contain System Time.
         *
         * Upon command invocation, the server shall respond with a TimeSnapshotResponse.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.2
         */
        timeSnapshot(): MaybePromise<GeneralDiagnostics.TimeSnapshotResponse>;
    }

    export interface DataModelTest {
        /**
         * This command provides a means for certification tests or manufacturer’s internal tests to validate particular
         * command handling and encoding constraints by generating a response of a given size.
         *
         * This command shall use the same EnableKey behavior as the TestEventTrigger command, whereby processing of the
         * command is only enabled when the TestEventTriggersEnabled field is true, which shall NOT be true outside of
         * certification testing or manufacturer’s internal tests.
         *
         * The fields for the PayloadTestRequest command are as follows:
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.4
         */
        payloadTestRequest(request: GeneralDiagnostics.PayloadTestRequest): MaybePromise<GeneralDiagnostics.PayloadTestResponse>;
    }
}

export type GeneralDiagnosticsInterface = {
    components: [
        { flags: {}, methods: GeneralDiagnosticsInterface.Base },
        { flags: { dataModelTest: true }, methods: GeneralDiagnosticsInterface.DataModelTest }
    ]
};
