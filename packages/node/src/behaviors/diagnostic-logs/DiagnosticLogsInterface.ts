/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { DiagnosticLogs } from "#clusters/diagnostic-logs";

export namespace DiagnosticLogsInterface {
    export interface Base {
        /**
         * Reception of this command starts the process of retrieving diagnostic logs from a Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.1
         */
        retrieveLogsRequest(request: DiagnosticLogs.RetrieveLogsRequest): MaybePromise<DiagnosticLogs.RetrieveLogsResponse>;
    }
}

export type DiagnosticLogsInterface = { components: [{ flags: {}, methods: DiagnosticLogsInterface.Base }] };
