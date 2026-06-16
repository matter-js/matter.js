/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace are intended to be used to identify human activity by some detection or sensing
 * implementation.
 *
 * @see {@link MatterSpecification.v16.Namespace} § 29
 */
export const IdentifiedHumanActivityTag = SemanticNamespace({
    id: 0x4b,

    tags: {
        /**
         * Unknown human activity is detected.
         */
        Unknown: { id: 0x0, label: "Unknown" },

        /**
         * Human fall is detected.
         */
        Fall: { id: 0x1, label: "Fall" },

        /**
         * Human sleeping is detected.
         */
        Sleeping: { id: 0x2, label: "Sleeping" },

        /**
         * Human walking is detected.
         */
        Walking: { id: 0x3, label: "Walking" },

        /**
         * Human workout is detected.
         */
        Workout: { id: 0x4, label: "Workout" },

        /**
         * Human sitting is detected.
         */
        Sitting: { id: 0x5, label: "Sitting" },

        /**
         * Human standing is detected.
         */
        Standing: { id: 0x6, label: "Standing" },

        /**
         * Human dancing is detected.
         */
        Dancing: { id: 0x7, label: "Dancing" },

        /**
         * Human delivery of package is detected.
         */
        PackageDelivery: { id: 0x8, label: "PackageDelivery" },

        /**
         * Human retrieval of package is detected.
         */
        PackageRetrieval: { id: 0x9, label: "PackageRetrieval" }
    }
});
