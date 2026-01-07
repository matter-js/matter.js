/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Domain } from "#domain.js";
import { Matter as matter } from "#model";

export interface DomainCommand {
    (domain: Domain, ...args: unknown[]): unknown;
    help(domain: Domain): void;
}

export const bin: Record<string, DomainCommand> = {};

export const globals: Record<string, unknown> = {
    matter,
    bin,
};
