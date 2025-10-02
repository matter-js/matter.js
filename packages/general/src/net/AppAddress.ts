/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { NetworkError } from "./Network.js";

export class InvalidAppAddress extends NetworkError {}

/**
 * An application network address.
 *
 * This is an OSI layer 7 address representable as an object or URL.
 */
export class AppAddress extends URL {
    constructor(definition: AppAddress.Definition) {
        if (typeof definition === "object" && !(definition instanceof URL)) {
            let protocol = definition.appProtocol;
            let host;
            if (definition.tls) {
                protocol += "s";
            }
            if (definition.transport.kind === "unix") {
                protocol += "+unix";
                host = encodeURIComponent(definition.transport.path);
            } else {
                host = definition.transport.host;
                if (definition.transport.port) {
                    host = `${host}:${definition.transport.port}`;
                }
            }
            const path = definition.path ?? "/";
            definition = `${protocol}://${host}${path}`;
        }
        try {
            super(definition);
        } catch (e) {
            if (e instanceof SyntaxError) {
                throw new InvalidAppAddress(`Invalid app address:${e.message}`);
            }
            throw e;
        }
    }

    get [Diagnostic.value]() {
        return this.toString();
    }

    get appProtocol() {
        return this.protocol.replace(/[:+].*$/, "");
    }

    get isTls() {
        switch (this.appProtocol) {
            case "https":
            case "mqtts":
            case "wss":
                return true;

            case "mqtt":
                // MQTT over WebSockets over TLS
                return this.protocolModifiers.includes("wss");
        }
        return false;
    }

    get protocolModifiers() {
        const segments = this.protocol.replace(/:$/, "").split("+");
        segments.shift();
        return segments;
    }

    get transport(): AppAddress.TransportAddress {
        if (this.protocolModifiers.includes("unix")) {
            return {
                kind: "unix",
                path: decodeURIComponent(this.hostname),
            };
        }

        return {
            kind: "ip",
            host: this.hostname,
            port: this.portNum,
        };
    }

    get portNum() {
        if (this.port !== "") {
            return Number(this.port);
        }
        return 0;
    }

    get isWildcardHost() {
        return this.host === "0.0.0.0" || this.host === "::";
    }

    get isWildcardPort() {
        return this.port === "0";
    }

    static for(definition: AppAddress.Definition) {
        if (definition instanceof AppAddress) {
            return definition;
        }

        return new AppAddress(definition);
    }
}

export namespace AppAddress {
    export type Definition = Object | URL | string;

    export type TransportAddress = IpTransportAddress | UnixSocketTransportAddress;

    export interface IpTransportAddress {
        kind: "ip";
        host: string;
        port: number;
    }

    export interface UnixSocketTransportAddress {
        kind: "unix";
        path: string;
    }

    export interface Object {
        appProtocol: string;
        transport: TransportAddress;
        tls?: boolean;
        path?: string;
    }
}
