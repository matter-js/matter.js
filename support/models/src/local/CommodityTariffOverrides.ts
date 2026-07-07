/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "@matter/model";
import { LocalMatter } from "../local.js";

// TariffComponentStruct has two struct-typed fields with default: "0" which is invalid for structs
LocalMatter.children.push({
    tag: "cluster",
    name: "CommodityTariff",
    asOf: "1.5",

    children: [
        {
            tag: "datatype",
            name: "TariffComponentStruct",
            children: [
                { tag: "field", id: 0x4, name: "PeakPeriod", default: FieldValue.None },
                { tag: "field", id: 0x5, name: "PowerThreshold", default: FieldValue.None },
            ],
        },
    ],
});
