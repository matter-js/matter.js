/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Matter } from "../Matter.js";
import * as TheGlobals from "../standard/elements/models.js";

/**
 * Global elements in the standard Matter Object Model.
 *
 * These elements are models parented by {@link Matter}.  We also export the models in this index by directly by
 * name, and they are parented by the {@link Matter}.
 *
 * This means, depending on you use case you may also access these elements directly:
 *
 * ```typescript
 * import uint16 from "@matter/model";
 * ```
 *
 * Or operationally:
 *
 * ```typescript
 * import { Matter } from "@matter/model";
 *
 * const uint16 = Matter.get(DatatypeModel, "uint16");
 * ```
 *
 * Note that for purposes of disambiguation we suffix device types with "DT" and semantic namespaces with "NS" in
 * this index.
 */
export const Globals = { ...TheGlobals };

// CJS transpilation litters a "default" property into the export set; toss it out
if ("default" in Globals) {
    delete Globals.default;
}
