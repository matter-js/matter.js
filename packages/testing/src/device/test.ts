/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Container } from "../docker/container.js";
import { edit } from "../docker/edit.js";
import { TestDescriptor, TestFileDescriptor } from "../test-descriptor.js";
import { Subject } from "./subject.js";

/**
 * Details of how to run a specific test.
 */
export interface Test {
    name: string;
    path: string;
    descriptor: TestDescriptor;
    container: Container;
    edit(...editors: edit.Editor[]): Promise<void>;
    initializeSubject(subject: Subject): Promise<void>;
    invoke(subject: Subject, step: (title: string) => void, args: string[]): Promise<void>;
}

export abstract class BaseTest implements Test {
    #descriptor: TestFileDescriptor;
    #container: Container;

    constructor(descriptor: TestFileDescriptor, container: Container) {
        this.#descriptor = descriptor;
        this.#container = container;
    }

    get name() {
        return this.#descriptor.name;
    }

    get path() {
        return this.#descriptor.path;
    }

    get descriptor() {
        return this.#descriptor;
    }

    get container() {
        return this.#container;
    }

    async edit(...editors: edit.Editor[]) {
        for (const editor of editors) {
            await this.#container.edit(editor, this.#descriptor.path);
        }
    }

    abstract initializeSubject(subject: Subject): Promise<void>;
    abstract invoke(subject: Subject, step: (title: string) => void, args: string[]): Promise<void>;
}

export namespace Test {
    /**
     * Test description metadata.
     */
    export interface Descriptor {
        name: string;
        kind: "javascript" | "python" | "yaml";
        description?: string;
        manual?: boolean;
        pics?: string[];
        header?: Record<string, unknown>;
        disabled?: boolean;
        steps?: Descriptor.Step[];
    }

    export namespace Descriptor {
        export interface Step {
            name: string;
            pics?: string;
        }
    }

    /**
     * Extract semantic meaning from test names for sorting purposes.
     */
    export function semanticNameOf(name: string) {
        return name
            .toLowerCase()
            .split("_")
            .map(segment => (segment.match(/^\d+$/) ? segment.padStart(8, "0") : segment))
            .join("_");
    }
}
