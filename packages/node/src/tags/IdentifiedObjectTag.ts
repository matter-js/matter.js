/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * This section contains the standard semantic tag namespace for identifiable objects to be exposed by some detection or
 * sensing implementation.
 *
 * Thus, the tags contained in this namespace are intended to be used to identify a specific detected object for a
 * common use.
 *
 * Regarding pet object identification, if an implementation enables a further specific pet identification such as a
 * "Dog" or a "Cat", then the specific pet object identification tag shall be used instead of a generalized "Pet" object
 * identification tag. If a client cannot recognize the specific pet identification tag, then, the client SHOULD
 * recognize it either as a pet or an animal identification tag based on its recognition capability.
 *
 * Similarly, if an implementation enables a further specific person/human identification such as an "Adult" or a
 * "Child", then the specific person/human object identification tag shall be used instead of a generalized "Person"
 * object identification tag. If a client cannot recognize the specific person/human object identification tag, then,
 * the client SHOULD recognize it either as a person or a human identification tag based on its recognition capability."
 *
 * @see {@link MatterSpecification.v151.Namespace} § 28
 */
export const IdentifiedObjectTag = SemanticNamespace({
    id: 0x49,

    tags: {
        /**
         * Unknown object is detected.
         */
        Unknown: { id: 0x0, label: "Unknown" },

        /**
         * Human adult is detected.
         */
        Adult: { id: 0x1, label: "Adult" },

        /**
         * Human child is detected.
         */
        Child: { id: 0x2, label: "Child" },

        /**
         * Person is detected.
         */
        Person: { id: 0x3, label: "Person" },

        /**
         * Robot Vacuum Cleaner is detected.
         */
        Rvc: { id: 0x4, label: "RVC" },

        /**
         * Pet animal is detected.
         */
        Pet: { id: 0x5, label: "Pet" },

        /**
         * Dog is detected.
         */
        Dog: { id: 0x6, label: "Dog" },

        /**
         * Cat is detected.
         */
        Cat: { id: 0x7, label: "Cat" },

        /**
         * Animal is detected.
         */
        Animal: { id: 0x8, label: "Animal" },

        /**
         * Car is detected.
         */
        Car: { id: 0x9, label: "Car" },

        /**
         * Vehicle is detected.
         */
        Vehicle: { id: 0xa, label: "Vehicle" },

        /**
         * Package is detected.
         */
        Package: { id: 0xb, label: "Package" },

        /**
         * Clothes are detected.
         */
        Clothes: { id: 0xc, label: "Clothes" }
    }
});
