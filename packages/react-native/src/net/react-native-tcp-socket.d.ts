/**
 * Type augmentation for react-native-tcp-socket.
 * The library's built-in types don't properly export through the default namespace pattern.
 */
declare module "react-native-tcp-socket" {
    import type { EventEmitter } from "react-native";

    export interface ConnectionOptions {
        port: number;
        host?: string;
        localAddress?: string;
        localPort?: number;
        interface?: "wifi" | "cellular" | "ethernet";
        reuseAddress?: boolean;
        connectTimeout?: number;
    }

    export interface ServerOptions {
        noDelay?: boolean;
        keepAlive?: boolean;
        keepAliveInitialDelay?: number;
    }

    export interface AddressInfo {
        address: string;
        family: string;
        port: number;
    }

    export class Socket {
        readonly remoteAddress?: string;
        readonly remotePort?: number;
        readonly localPort?: number;

        setNoDelay(noDelay: boolean): this;
        setKeepAlive(enable: boolean, initialDelay?: number): this;
        setTimeout(timeout: number, callback?: () => void): this;
        write(data: Buffer | string, callback?: (error?: Error) => void): void;
        destroy(): void;
        end(): void;
        on(event: "data", listener: (data: Buffer | string) => void): this;
        on(event: "close", listener: () => void): this;
        on(event: "error", listener: (error: Error) => void): this;
        on(event: "connect", listener: () => void): this;
        on(event: "timeout", listener: () => void): this;
        off(event: string, listener: (...args: any[]) => void): this;
        removeListener(event: string, listener: (...args: any[]) => void): this;
    }

    export class Server {
        listen(options: { port?: number; host?: string }, callback?: () => void): this;
        close(callback?: () => void): void;
        address(): AddressInfo | string | null;
        on(event: "connection", listener: (socket: Socket) => void): this;
        on(event: "error", listener: (error: Error) => void): this;
        on(event: "listening", listener: () => void): this;
        on(event: "close", listener: () => void): this;
        off(event: string, listener: (...args: any[]) => void): this;
        removeListener(event: string, listener: (...args: any[]) => void): this;
    }

    export function createConnection(options: ConnectionOptions, callback?: () => void): Socket;
    export function createServer(options?: ServerOptions): Server;

    const _default: {
        createConnection: typeof createConnection;
        connect: typeof createConnection;
        createServer: typeof createServer;
        Socket: typeof Socket;
        Server: typeof Server;
    };
    export default _default;
}
