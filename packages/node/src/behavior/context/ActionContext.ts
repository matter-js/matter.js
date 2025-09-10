/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Agent } from "#endpoint/Agent.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import type { AccessLevel } from "#model";
import type { LocalActorContext } from "./server/LocalActorContext.js";
import type { RemoteActorContext } from "./server/RemoteActorContext.js";

/**
 * Provides contextual information for Matter actions such as accessing attributes or invoking commands.
 *
 * Matter.js provides an "online" ActionContext for you when responding to network requests.  You can also use
 * "offline" agents to invoke cluster APIs {@link Endpoint} without an active user session.
 *
 * See {@link RemoteActorContext} and {@link LocalActorContext} for details of these two types of interaction.
 *
 * Context includes:
 *
 *   - Authorization details such as {@link AccessLevel}, {@link subject} and accessing {@link fabric}
 *
 *   - The {@link transaction} required to make state changes
 *
 *   - Factory functions for {@link Agent} instances you can use to interact with {@link Endpoint}s
 *
 *   - When responding to network requests, low-level contextual information such as the wire {@link message}
 *
 * For the formal definition of an "action" see {@link MatterSpecification.v12.Core} § 8.2.4
 */
export type ActionContext = LocalActorContext | RemoteActorContext;
