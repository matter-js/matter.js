/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace are restricted for use in the switches domain and shall NOT be used in any other
 * domain or context. They are intended to indicate the function of a button on a switch device to allow a client to
 * make an optimized user interface which matches the actual device without requiring a-priori knowledge of the layout
 * of each specific switch device.
 *
 * See the rules for applying these and other tags for switch devices, e.g. from the Common Position Namespace and the
 * Common Number Namespace in the Generic Switch device type section in the Device Library.
 *
 * @see {@link MatterSpecification.v142.Namespace} § 18
 */
export const SwitchesTag = SemanticNamespace({
    id: 0x43,

    tags: {
        On: { id: 0x0, label: "On" },
        Off: { id: 0x1, label: "Off" },
        Toggle: { id: 0x2, label: "Toggle" },

        /**
         * e.g. dim up (light)
         */
        Up: { id: 0x3, label: "Up" },

        /**
         * e.g. dim down (light)
         */
        Down: { id: 0x4, label: "Down" },

        /**
         * e.g. select next scene
         */
        Next: { id: 0x5, label: "Next" },

        /**
         * e.g. select previous scene
         */
        Previous: { id: 0x6, label: "Previous" },

        /**
         * Enter/OK/Select function
         */
        EnterOkSelect: { id: 0x7, label: "EnterOkSelect" },

        /**
         * Textual description provided in Label field
         *
         * When this value is used, the Label field in the same Semantic Tag structure shall be filled with a textual
         * description of the function indicated on the button, such as a label or icon printed on the button, e.g.
         * "dining".
         *
         * @see {@link MatterSpecification.v142.Namespace} § 18.1
         */
        Custom: { id: 0x8, label: "Custom" },

        /**
         * e.g. open window covering
         */
        Open: { id: 0x9, label: "Open" },

        /**
         * e.g. close window covering
         */
        Close: { id: 0xa, label: "Close" },

        /**
         * e.g. stop moving window covering
         */
        Stop: { id: 0xb, label: "Stop" }
    }
});
