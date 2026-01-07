/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decamelize, InternalError } from "#general";
import { ClusterModel, DatatypeModel, Model } from "#model";
import { GeneratorScope } from "../clusters/GeneratorScope.js";
import { TsFile } from "./TsFile.js";
import { camelize } from "./string.js";

/**
 * A TS file that understands {@link GeneratorScope} semantics.
 */
export class ScopeFile extends TsFile {
    #definesScope: boolean;
    #scope: GeneratorScope;

    constructor(options: ScopeFile.Options) {
        let filename: string;
        let scope: GeneratorScope | undefined;
        let definesScope: boolean;

        if (options.name === undefined) {
            definesScope = true;
            scope = GeneratorScope(options.scope);
            filename = ScopeFile.filenameFor(scope.owner).replace(/.js$/, "");
        } else {
            definesScope = false;
            scope = options.scope && GeneratorScope(options.scope);
            filename = options.name;
        }

        super(filename, options.editable);

        this.#definesScope = definesScope;
        this.#scope = scope;
    }

    get scope() {
        return this.#scope;
    }

    get model() {
        if (!this.#scope) {
            throw new InternalError("Model requested from ");
        }
        return this.#scope.owner;
    }

    /**
     * Reference a model in the context of this file.  Adds appropriate imports and returns the expression used to
     * reference the import in generated code.
     *
     * @param model the model to reference
     * @param tlv in the case of structs we define both "TlvFoo" and "Foo".  This designates which to import
     * @param specific designates the specific instance of the model rather than any scope override
     */
    reference(model: Model, tlv = false, specific = false) {
        let sourceScope;
        if (this.#scope) {
            const location = this.#scope.locationOf(model, specific);
            if (location.isLocal) {
                if (this.#definesScope) {
                    // Model is defined locally, no import required
                    return this.#scope.nameFor(model, tlv, specific);
                }
                sourceScope = this.#scope;
            }
        }

        if (sourceScope === undefined) {
            sourceScope = GeneratorScope(model);
        }

        // Cluster definitions are namespaced so we must import the namespace.  Otherwise there is no namespace so we
        // import diredctly
        let importModel;
        if (sourceScope.owner instanceof ClusterModel) {
            importModel = sourceScope.owner;
        } else {
            importModel = model;
        }

        // Determine the name of the definition to import and the name to import as
        const importName = sourceScope.nameFor(importModel, tlv && importModel === model);
        let localName;
        if (this.#scope) {
            localName = this.#scope.nameFor(importModel, tlv && importModel === model);
        } else {
            localName = importName;
        }

        // Add the import
        let importExpr;
        if (localName === importName) {
            importExpr = importName;
        } else {
            importExpr = `${importName} as ${localName}`;
        }
        this.addImport(
            ScopeFile.filenameFor(sourceScope.owner),
            importExpr,
            ScopeFile.externalNameFor(sourceScope.owner),
        );

        // Return the expression for local access
        if (importModel === model) {
            return localName;
        }
        return `${localName}.${sourceScope.nameFor(model, tlv)}`;
    }

    static filenameFor(model: Model) {
        if (!model.isGlobal) {
            throw new InternalError(
                `Cannot determine filename for ${model.tag} ${model.name} because it is not global`,
            );
        }

        let name = camelize(model.name, true);

        if (model instanceof ClusterModel) {
            return `!clusters/${decamelize(name)}.js`;
        }

        if (model instanceof DatatypeModel) {
            name = name.replace(/(?:Struct|Enum|Bitmap)$/, "");

            return `!globals/${name}.js`;
        }

        throw new InternalError(
            `Cannot determine filename for ${model.tag} ${model.name} because it is not a cluster or datatype`,
        );
    }

    static externalNameFor(model: Model) {
        if (!model.isGlobal) {
            throw new InternalError(
                `Cannot determine external name for ${model.tag} ${model.name} because it is not global`,
            );
        }

        if (model instanceof ClusterModel) {
            return `#clusters/${decamelize(model.name)}`;
        }

        return `#types`;
    }
}

export namespace ScopeFile {
    /**
     * Configures a file that defines members for a specific scope.
     *
     * References to members owned by the scope are local.  Other references are imported.
     */
    interface ScopeDefinitionOptions {
        name?: undefined;
        scope: GeneratorScope | Model;
        editable?: boolean;
    }

    /**
     * Configures a file that is aware of scope but does not define a scope.
     *
     * In this case "scope" parameter makes names available but the file imports all definitions.
     */
    interface ScopeAwareOptions {
        name: string;
        scope: GeneratorScope | Model;
        editable?: boolean;
    }

    export type Options = ScopeAwareOptions | ScopeDefinitionOptions;
}
