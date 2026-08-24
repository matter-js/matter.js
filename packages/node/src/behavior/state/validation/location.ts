/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataModelPath } from "@matter/model";
import { Val } from "@matter/protocol";
import type { Supervision } from "../../supervision/Supervision.js";

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

    /**
     * The owner of the values under validation, passed to a {@link Val.Dynamic} provider as it expects.  Only the
     * datasource holding the values knows the owner, and a raw state class carries no reference to reach it through.
     */
    owner?: unknown;

    /**
     * Fallback resolver for cross-struct references.  When a name cannot be resolved in siblings or the ownership
     * hierarchy, the validator calls this function.
     */
    outerResolve?: (name: string) => Val;

    /**
     * Per-instance validation configuration.  When set, controls which validation phases run for the value and its
     * children.
     */
    config?: Supervision.Config;
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
