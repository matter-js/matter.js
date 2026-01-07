/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parses package.json "imports" fields and rewrites local imports according to the import definitions.
 */
export class ImportAliases {
    #parent?: ImportAliases;
    #direct: Record<string, string> = {};
    #wildcard = Array<WildcardAlias>();

    constructor(localAliases?: Record<string, string>, parent?: ImportAliases) {
        for (const path in localAliases) {
            const resolvesTo = localAliases[path];

            let wildcardAt = path.indexOf("*");
            if (wildcardAt === -1) {
                this.#direct[path] = resolvesTo;
                continue;
            }

            const inputPrefix = path.substring(0, wildcardAt);
            const inputSuffix = path.substring(wildcardAt + 1);

            wildcardAt = resolvesTo.indexOf("*");
            if (wildcardAt === -1) {
                this.#wildcard.push({
                    inputPrefix,
                    inputSuffix,
                    includeGlob: false,
                    outputPrefix: resolvesTo,
                    outputSuffix: "",
                });
            } else {
                this.#wildcard.push({
                    inputPrefix,
                    inputSuffix,
                    includeGlob: true,
                    outputPrefix: resolvesTo.substring(0, wildcardAt),
                    outputSuffix: resolvesTo.substring(wildcardAt + 1),
                });
            }
        }
        this.#parent = parent;
    }

    rewrite(path: string): string {
        if (path.startsWith("#")) {
            const direct = this.#direct[path];
            if (direct) {
                return direct;
            }
            for (const alias of this.#wildcard) {
                if (path.startsWith(alias.inputPrefix) && path.endsWith(alias.inputSuffix)) {
                    if (alias.includeGlob) {
                        return (
                            alias.outputPrefix +
                            path.substring(alias.inputPrefix.length, path.length - alias.inputSuffix.length) +
                            alias.outputSuffix
                        );
                    }
                    return alias.outputPrefix;
                }
            }
        }
        return this.#parent?.rewrite(path) ?? path;
    }
}

interface WildcardAlias {
    inputPrefix: string;
    inputSuffix: string;
    includeGlob: boolean;
    outputPrefix: string;
    outputSuffix: string;
}
