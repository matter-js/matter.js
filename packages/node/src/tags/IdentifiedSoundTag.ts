/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * This section contains the standard semantic tag namespace for identified sounds or audio context as a part of the
 * semantic tag feature.
 *
 * The tags contained in this namespace are intended to be used to identify sounds or audio context by some detection or
 * sensing implementation.
 *
 * @see {@link MatterSpecification.v16.Namespace} § 27
 */
export const IdentifiedSoundTag = SemanticNamespace({
    id: 0x4a,

    tags: {
        /**
         * Unidentifiable audio context is detected.
         */
        Unknown: { id: 0x0, label: "Unknown" },

        /**
         * Object falling to the floor is detected.
         */
        ObjectFall: { id: 0x1, label: "ObjectFall" },

        /**
         * Human snoring sound is detected.
         */
        Snoring: { id: 0x2, label: "Snoring" },

        /**
         * Human coughing sound is detected.
         */
        Coughing: { id: 0x3, label: "Coughing" },

        /**
         * Dog barking sound is detected.
         */
        Barking: { id: 0x4, label: "Barking" },

        /**
         * Object shattering sound is detected.
         */
        Shattering: { id: 0x5, label: "Shattering" },

        /**
         * Baby crying sound is detected.
         */
        BabyCrying: { id: 0x6, label: "BabyCrying" },

        /**
         * Utility device alarming or warning sound is detected.
         */
        UtilityAlarm: { id: 0x7, label: "UtilityAlarm" },

        /**
         * Urgent shouting sound is detected.
         */
        UrgentShouting: { id: 0x8, label: "UrgentShouting" },

        /**
         * Doorbell ringing is detected.
         */
        Doorbell: { id: 0x9, label: "Doorbell" },

        /**
         * Door knocking sound is detected.
         */
        Knocking: { id: 0xa, label: "Knocking" },

        /**
         * Urgent situational siren sound is detected.
         */
        UrgentSiren: { id: 0xb, label: "UrgentSiren" },

        /**
         * Faucet water running sound is detected.
         */
        FaucetRunning: { id: 0xc, label: "FaucetRunning" },

        /**
         * Kettle water boiling sound is detected.
         */
        KettleBoiling: { id: 0xd, label: "KettleBoiling" },

        /**
         * Hair/hand fan dryer sound is detected.
         */
        FanDryer: { id: 0xe, label: "FanDryer" },

        /**
         * Hand clapping sound is detected.
         */
        Clapping: { id: 0xf, label: "Clapping" },

        /**
         * Finger snapping sound is detected.
         */
        FingerSnapping: { id: 0x10, label: "FingerSnapping" },

        /**
         * Cat meowing sound is detected.
         */
        Meowing: { id: 0x11, label: "Meowing" },

        /**
         * Human laughing sound is detected.
         */
        Laughing: { id: 0x12, label: "Laughing" },

        /**
         * Glass breaking sound is detected.
         */
        GlassBreaking: { id: 0x13, label: "GlassBreaking" },

        /**
         * Door knocking sound is detected.
         */
        DoorKnocking: { id: 0x14, label: "DoorKnocking" },

        /**
         * Person talking sound is detected.
         */
        PersonTalking: { id: 0x15, label: "PersonTalking" }
    }
});
