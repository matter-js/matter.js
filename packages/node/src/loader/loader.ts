/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { camelize, decamelize, ImportError, MaybePromise } from "#general";

// Must load from public export so node selects the correct format
import { load } from "@matter/node/load";

const cache = {} as Record<string, {}>;

/**
 * Dynamically load API components.
 *
 * We generate a huge amount of code, both statically and at runtime.  You can use this namespace to load components
 * from this package dynamically regardless of module format (CJS or ESM).
 *
 * If you are not targeting both formats then either require or a dynamic import may make more sense.
 */
export namespace loader {
    export function behavior(name: string) {
        const exportName = `${camelize(name, true)}Behavior`;
        return doLoad(
            `behavior ${name}`,
            exportName,
            `../behaviors/${decamelize(name)}/${exportName}.js`,
        ) as MaybePromise<Behavior.Type>;
    }

    export function server(name: string) {
        const exportName = `${camelize(name, true)}Server`;
        return doLoad(
            `behavior ${name}`,
            exportName,
            `../behaviors/${decamelize(name)}/${exportName}.js`,
        ) as MaybePromise<Behavior.Type>;
    }

    export function device(name: string) {
        const exportName = `${camelize(name, true)}Device`;
        return doLoad(
            `device type ${name}`,
            exportName,
            `../devices/${decamelize(name)}.js`,
        ) as MaybePromise<EndpointType>;
    }

    export function endpoint(name: string) {
        const exportName = `${camelize(name, true)}Endpoint`;
        return doLoad(
            `endpoint type ${name}`,
            exportName,
            `../endpoints/${decamelize(name)}.js`,
        ) as MaybePromise<EndpointType>;
    }

    export const registry = {} as Record<string, Record<string, {} | undefined> | undefined>;
}

function doLoad(description: string, exportName: string, path: string) {
    const cachedResult = cache[path];
    if (cachedResult) {
        return cachedResult;
    }

    function extractExport(module: {}) {
        if (exportName in module) {
            return (module as Record<string, {}>)[exportName];
        }
        failure();
    }

    try {
        const module = load(path);
        if (MaybePromise.is(module)) {
            return module.then(extractExport, failure);
        }
        return extractExport(module);
    } catch (e) {
        failure();
    }

    function failure() {
        throw new ImportError(`No implementation available for ${description}`);
    }
}
