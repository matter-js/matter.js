/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Model } from "#model";
import { Directory, Stat } from "#stat.js";

Stat.provide(model => {
    if (!isModel(model)) {
        return;
    }

    const details: Stat.Base = {
        name: model.description,
        summary: model.details,
        id: model.id,
        tag: model.tag,
    };

    if (!model.children.length) {
        return {
            kind: "file",
            ...details,
        };
    }

    return Directory({
        ...details,
        paths() {
            return model.children.map(child => child.name);
        },
        definitionAt(name: string) {
            return model.children.find(model => model.name === name);
        },
    });
});

function isModel(model: unknown): model is Model {
    if (model instanceof Model) {
        return true;
    }
    return false;
}
