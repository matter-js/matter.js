# Example device with WebSocket control enabled

This example demonstrates how to implement a matter.js device that you can control via WebSockets.

By default the device listens on a UNIX socket under ~/.matter/matter.sock.  You can change by modifying {@link
WebSocketDevice.ts} or override with environment variables:

    MATTER_WEBSOCKET_ADDRESS=ws://localhost

or command line arguments:

    --websocket-address=ws://localhost
