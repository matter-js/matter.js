/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataModelPath } from "#model";
import { Val } from "#protocol";

/**
 * Contextual information tracked during validation.
 */
export interface ValidationLocation {
    /**
     * The path to scrutinize, used for diagnostic messages.
     */
    path: DataModelPath;

    /**
     * To validate conformance and constraints we require access to sibling
     * values.  They are passed here when validating a record.
     */
    siblings?: Val.Struct;

    /**
     * Choice conformance requires context from the parent object.  This
     * context is passed here.
     */
    choices?: Record<string, ValidationLocation.Choice>;

    /**
     * Path used to create fully-qualified name for diagnostic messages.
     */
    location?: string[];
}

export namespace ValidationLocation {
    /**
     * Details a conformance choice.  Used during conformance validation.
     */
    export interface Choice {
        count: number;
        target: number;
        orMore: boolean;
        orLess: boolean;
    }
}
