# MQTT implementation for matter.js

This is a matter.js plugin that provides an MQTT implementation based on [MQTT.js](https://github.com/mqttjs/MQTT.js).

To enable MQTT support you will need a broker that supports MQTT 5.  Import `@matter/mqtt` and enable MQTT by setting
`mqttAddress` on the `RemoteServer` of your `ServerNode`.

This plugin is platform independent.  On web browsers you can only access brokers over WebSockets, so the
protocol of your service address should be `mqtt+ws` or `mqtt+wss`.