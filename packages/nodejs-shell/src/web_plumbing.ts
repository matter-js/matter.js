/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogDestination, Logger, LogLevel } from "@matter/general";
import { Readable, Writable } from "node:stream";
import WebSocket, { Data, WebSocketServer } from "ws";
import { MatterNode } from "./MatterNode.js";
import { Shell } from "./shell/Shell.js";

import fs from "fs";
import http, { Server } from "node:http";
import path from "path";

// Store active WebSocket
let client: WebSocket;
let server: Server;
let wss: WebSocketServer;
const socketLogger = "websocket";
const logger = Logger.get("WebPlumbing");

const DEFAULT_LISTEN_ADDRESS = "127.0.0.1";

export function initializeWebPlumbing(
    theNode: MatterNode,
    nodeNum: number,
    webSocketPort: number,
    webServer: boolean,
    listenAddress?: string,
): void {
    const configuredAddress = listenAddress?.trim() || undefined;
    const listenHost = configuredAddress ?? DEFAULT_LISTEN_ADDRESS;
    if (configuredAddress === undefined) {
        logger.warn(
            `No listen address configured; binding the WebSocket/web server to loopback ${DEFAULT_LISTEN_ADDRESS} only. ` +
                `Pass --webAddress <address> (e.g. 0.0.0.0) to expose it on other interfaces.`,
        );
    }

    if (webServer) {
        const resolvedRoot = path.resolve(__dirname);
        let root: string;
        try {
            root = fs.realpathSync(resolvedRoot);
        } catch (error) {
            logger.warn(`Could not resolve web root real path (${resolvedRoot}): ${error}. Using unresolved path.`);
            root = resolvedRoot;
        }
        const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
        // The trailing separator prevents sibling directories that merely share the root string as a
        // prefix from passing the containment check.
        const isContained = (candidate: string) => candidate === root || candidate.startsWith(rootWithSep);

        server = http
            .createServer((req, res) => {
                const url = req.url ?? "/";
                let decodedPath: string;
                try {
                    decodedPath = decodeURIComponent(url === "/" ? "/index.html" : url);
                } catch {
                    res.writeHead(400).end("Bad Request");
                    return;
                }
                const safePath: string = path.normalize(path.join(root, decodedPath));

                if (!isContained(safePath)) {
                    res.writeHead(403).end("Forbidden");
                    return;
                }

                // Resolve symlinks so a link inside the root cannot redirect reads outside of it.
                fs.realpath(safePath, (realpathErr, resolvedPath) => {
                    if (realpathErr) return res.writeHead(404).end("Not Found");
                    if (!isContained(resolvedPath)) {
                        res.writeHead(403).end("Forbidden");
                        return;
                    }

                    fs.readFile(resolvedPath, (err, data) => {
                        if (err) return res.writeHead(404).end("Not Found");
                        res.writeHead(200).end(data);
                    });
                });
            })
            .listen(webSocketPort, listenHost);
        wss = new WebSocketServer({ server });
    } else wss = new WebSocketServer({ port: webSocketPort, host: listenHost });

    console.info(`WebSocket server running on ws://${listenHost}:${webSocketPort}`);

    console.log =
        // console.debug = // too much traffic - kills the websocket
        console.info =
        console.warn =
        console.error =
            (...args: any[]) => {
                if (client && client.readyState === WebSocket.OPEN) {
                    client.send(args.map(arg => (typeof arg === "object" ? JSON.stringify(arg) : arg)).join(" "));
                } else
                    process.stdout.write(
                        args.map(arg => (typeof arg === "object" ? JSON.stringify(arg) : arg)).join(" ") + "\n",
                    );
            };

    wss.on("connection", (ws: WebSocket) => {
        if (client && client.readyState === WebSocket.OPEN) {
            ws.send("ERROR: Shell in use by another client");
            ws.close();
            return;
        }

        client = ws; // Track the client

        createWebSocketLogger(ws)
            .then(logger => {
                delete Logger.destinations["Shell"];
                Logger.destinations[socketLogger] = LogDestination({
                    name: socketLogger,
                    write: (text, message) => logger(message.level, text),
                });
            })
            .catch(err => {
                console.error("Failed to add WebSocket logger: " + err);
            });

        const shell = new Shell(theNode, nodeNum, "", createReadableStream(ws), createWritableStream(ws));
        shell.start(theNode.storageLocation);

        ws.on("close", () => {
            process.stdout.write("Client disconnected\n");
            if (socketLogger in Logger.destinations) {
                delete Logger.destinations[socketLogger];
            }

            client = ws;
        });
        ws.on("error", err => {
            process.stderr.write(`WebSocket error: ${err.message}\n`);
            if (socketLogger in Logger.destinations) {
                delete Logger.destinations[socketLogger];
            }
        });
    });

    async function createWebSocketLogger(socket: WebSocket): Promise<(level: LogLevel, formattedLog: string) => void> {
        if (socket.readyState === WebSocket.CONNECTING) {
            await new Promise<void>((resolve, reject) => {
                socket.onopen = () => resolve();
                socket.onerror = err => reject(new Error(`WebSocket error: ${err.type}`));
            });
        }

        return (__level: LogLevel, formattedLog: string) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(formattedLog);
            } else {
                process.stderr.write(`WebSocket logger not open, log dropped: ${formattedLog}\n`);
            }
        };
    }
}
function createReadableStream(ws: WebSocket): Readable {
    const readable = new Readable({ read() {} });

    ws.on("message", (data: Data) => {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data.toString());

        // add the data to our readable stream that the readLine instance is reading from
        readable.push(chunk);
    });

    ws.on("close", () => {
        readable.push(null);
    });
    ws.on("error", err => {
        readable.emit("error", err);
        readable.push(null);
    });

    return readable;
}
function createWritableStream(ws: WebSocket): Writable {
    const writable = new Writable({
        write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(chunk, callback);
            } else {
                if (chunk.length > 0) process.stderr.write(`ERROR: WebSocket is not open. Failed to send "${chunk}"\n`);
            }
        },
        final(callback: (error?: Error | null) => void) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            callback();
        },
    });

    ws.on("error", err => writable.emit("WebSocket Write Error: ", err));
    return writable;
}
