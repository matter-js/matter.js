/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldModel } from "#model";
import { generateElement } from "#mom/common/generate-element.js";
import { TsFile } from "#util/TsFile.js";

describe("generateElement", () => {
    it("writes a negative id as a number", () => {
        const target = new TsFile("!model/generated");
        generateElement({ target, importFrom: "#model", element: new FieldModel({ name: "Below", id: -1 }) });
        expect(target.toString()).match(/name: "Below", id: -1[ ,}]/);
    });
});
