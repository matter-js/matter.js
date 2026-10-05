/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "IcdManagement",

    children: [
        // The specification lists this deprecated field without its type from 1.3 until 1.7 restores it as obsolete.  A
        // client needs the type to read it from devices of earlier revisions.
        {
            tag: "datatype",
            name: "MonitoringRegistrationStruct",
            type: "struct",
            children: [
                {
                    tag: "field",
                    id: 0x3,
                    name: "Key",
                    type: "octstr",
                    constraint: "16",
                    quality: "N",
                    asOf: "1.3",
                    until: "1.7",
                },
            ],
        },
    ],
});
