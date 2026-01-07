/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "LocalizationConfiguration",

    children: [
        // Convenience override to have automatic validation for the value
        {
            tag: "attribute",
            name: "ActiveLocale",
            id: 0,
            constraint: "in SupportedLocales",
        },
    ],
});
