/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#general";

/**
 * Thrown when an action request does not adhere to the Matter specification.
 *
 * This is a client-side error that throws while formulating a request.
 */
export class MalformedRequestError extends ImplementationError {}
