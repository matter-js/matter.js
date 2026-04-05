/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, WebSocketClient } from "@matter/general";
import { WsAdapter } from "@matter/nodejs";
import { WebSocket } from "ws";
import { factory } from "./factory.js";

WsAdapter.defaultFactory = factory;

// Always install WebSocketClient with the ws package's WebSocket — it supports ws+unix:// URLs
// and other features not available in the native WebSocket implementation
Environment.default.set(WebSocketClient, new WebSocketClient(WebSocket as unknown as WebSocketClient.Constructor));
