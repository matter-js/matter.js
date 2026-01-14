/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { InternalError } from "#general";
import { Val } from "#protocol";

const migrations = new Map<string, Migration.Migrator>();

/**
 * Add a data migration.
 *
 * Migrations allow the server to adjust persisted data when the stored format is incompatible with current code.
 */
export function Migration(id: string, migrator: Migration.Migrator) {
    if (migrations.has(id)) {
        throw new InternalError(`Duplicate migration ${id}`);
    }

    migrations.set(id, migrator);
}

export namespace Migration {
    export function migrate(type: Behavior.Type, values: Val.Struct) {
        migrations.get(type.id)?.(values, type);
    }

    export interface Migrator {
        (values: Val.Struct, type: Behavior.Type): void;
    }
}
