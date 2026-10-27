/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterAggregateError, MatterError } from "@matter/general";

/**
 * Base of the errors that report how a discovery ended without a result.  Attempts or scanners that failed with errors
 * of their own are reported as {@link DiscoveryAggregateError}, which is not a subtype.
 */
export class DiscoveryError extends MatterError {}

/**
 * Discovery ended without finding any device that matches the request.
 */
export class DeviceNotDiscoveredError extends DiscoveryError {}

/**
 * Discovery found at least one matching device, but no attempt to connect to it won and none failed with an error of
 * its own.  Usually the discovery timeout canceled the attempts.
 */
export class DiscoveryIncompleteError extends DiscoveryError {}

/**
 * Discovery could not look for the device because the node has no scanner for any transport the request allows, for
 * example IP network discovery is disabled and BLE is not available.
 */
export class NoDiscoveryTransportError extends DiscoveryError {}

export class DiscoveryAggregateError extends MatterAggregateError {}
