/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SemanticNamespaceModel } from "#model";
import { TsFile } from "../util/TsFile.js";
import { camelize } from "../util/string.js";

export class SemanticNamespaceFile extends TsFile {
    constructor(public model: SemanticNamespaceModel) {
        const objectName = `${camelize(model.name, true)}Tag`;

        super(`!tags/${objectName}`);

        this.addImport(`!node/endpoint/type/SemanticNamespace.js`, "SemanticNamespace");

        const definition = this.expressions(`export const ${objectName} = SemanticNamespace({`, "})");
        definition.document(model);

        definition.atom("id", `0x${model.id.toString(16)}`);
        if (typeof model.mfgCode === "number") {
            definition.atom("mfgCode", `0x${model.mfgCode.toString(16)}`);
        }

        const tags = definition.expressions("tags: {", "}");
        for (const tagModel of model.children) {
            const tag = tags.expressions(`${camelize(tagModel.name, true)}: {`, "}");
            tag.document(tagModel);

            tag.atom("id", `0x${tagModel.id.toString(16)}`);
            tag.atom("label", JSON.stringify(tagModel.name));
        }
    }
}
