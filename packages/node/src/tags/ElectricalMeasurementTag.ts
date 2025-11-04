/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace are restricted for use in the electrical measurement domain and shall NOT be
 * used in any other domain or context.
 *
 * @see {@link MatterSpecification.v142.Namespace} § 12
 */
export const ElectricalMeasurementTag = SemanticNamespace({
    id: 0xa,

    tags: {
        /**
         * Indicates values measured for a DC load
         */
        Dc: { id: 0x0, label: "DC" },

        /**
         * Indicates values measured for a single-phase AC load, or values measured for the collective load on a
         * polyphase AC power supply
         */
        Ac: { id: 0x1, label: "AC" },

        /**
         * Indicates values measured for an AC load on phase 1 of a polyphase power supply
         */
        AcPhase1: { id: 0x2, label: "ACPhase1" },

        /**
         * Indicates values measured for an AC load on phase 2 of a polyphase power supply
         */
        AcPhase2: { id: 0x3, label: "ACPhase2" },

        /**
         * Indicates values measured for an AC load on phase 3 of a polyphase power supply
         */
        AcPhase3: { id: 0x4, label: "ACPhase3" }
    }
});
