/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterElement } from "../elements/index.js";

/**
 * Canonical instance of the Matter Object Model in elemental form.
 *
 * This is a plain JS object suitable for serialization as JSON or configuration of MatterModel.
 */
export const MatterDefinition = MatterElement({
    name: "Matter",
    description: "Matter Object Model",
    revision: "1.3",
    children: [],
});
