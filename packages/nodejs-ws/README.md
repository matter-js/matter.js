# WebSocket server implementation for matter.js

This is a matter.js plugin that provides a WebSocket server implementation for Node.js based on
[ws](https://github.com/websockets/ws).

To enable WebSocket support, import `@matter/nodejs-ws` and enable WebSockets on the `RemoteServer` of your
`ServerNode`.