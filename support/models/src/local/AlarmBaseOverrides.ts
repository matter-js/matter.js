/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "AlarmBase",
    until: "1.4.1",

    children: [
        /**
         * The IDs in the "specification" for Notify fields are one off from defacto spec.
         */
        {
            tag: "event",
            name: "Notify",
            id: 0,
            children: [
                {
                    tag: "field",
                    name: "Active",
                    id: 0,
                    matchTo: { name: "Active" },
                },

                {
                    tag: "field",
                    name: "Inactive",
                    id: 1,
                    matchTo: { name: "Inactive" },
                },

                {
                    tag: "field",
                    name: "State",
                    id: 2,
                    matchTo: { name: "State" },
                },

                {
                    tag: "field",
                    name: "Mask",
                    id: 3,
                    matchTo: { name: "Mask" },
                },
            ],
        },
    ],
});
