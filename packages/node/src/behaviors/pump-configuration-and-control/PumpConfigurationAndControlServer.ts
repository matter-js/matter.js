/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE WILL BE REGENERATED IF YOU DO NOT REMOVE THIS MESSAGE ***/

import { PumpConfigurationAndControlBehavior } from "./PumpConfigurationAndControlBehavior.js";

/**
 * This is the default server implementation of {@link PumpConfigurationAndControlBehavior}.
 *
 * The Matter specification requires the PumpConfigurationAndControl cluster to support features we do not enable by
 * default. You should use {@link PumpConfigurationAndControlServer.with} to specialize the class for the features your
 * implementation supports.
 */
export class PumpConfigurationAndControlServer extends PumpConfigurationAndControlBehavior {}
