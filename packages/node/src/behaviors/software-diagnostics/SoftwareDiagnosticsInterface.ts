/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";

export namespace SoftwareDiagnosticsInterface {
    export interface Watermarks {
        /**
         * This command is used to reset the high watermarks for heap and stack memory.
         *
         * Receipt of this command shall reset the following values which track high and lower watermarks:
         *
         *   • The StackFreeMinimum field of the ThreadMetrics attribute
         *
         *   • The CurrentHeapHighWatermark attribute
         *
         * ### Effect on Receipt
         *
         * On receipt of this command, the Node shall make the following modifications to attributes it supports:
         *
         * If implemented, the server shall set the value of the CurrentHeapHighWatermark attribute to the value of the
         * CurrentHeapUsed attribute.
         *
         * If implemented, the server shall set the value of the StackFreeMinimum field for every thread to the value of
         * the corresponding thread’s StackFreeCurrent field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.7.1
         */
        resetWatermarks(): MaybePromise;
    }
}

export type SoftwareDiagnosticsInterface = {
    components: [{ flags: { watermarks: true }, methods: SoftwareDiagnosticsInterface.Watermarks }]
};
