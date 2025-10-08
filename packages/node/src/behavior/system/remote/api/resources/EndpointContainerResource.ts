/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiResource } from "../ApiResource.js";
import type { EndpointResource } from "./EndpointResource.js";

/**
 * API item for collections of endpoints.
 */
export class EndpointContainerResource extends ApiResource {
    readonly id: string;
    readonly #list: () => string[];
    readonly #find: (path: string) => ApiResource | undefined;
    declare readonly parent: EndpointResource;
    schema: undefined;
    readonly valueKind: ApiResource.Kind = "index";

    constructor(
        parent: EndpointResource,
        id: string,
        list: () => string[],
        find: (path: string) => ApiResource | undefined,
    ) {
        super(parent);

        this.id = id;
        this.#list = list;
        this.#find = find;
    }

    get dataModelPath() {
        return this.parent.dataModelPath.at(this.id);
    }

    get value() {
        return this.#list();
    }

    override async childFor(id: string) {
        return this.#find(id);
    }
}
