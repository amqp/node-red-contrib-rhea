/*
 * Copyright 2016 Red Hat Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

module.exports = function(RED) {

    var rhea = require('rhea');

    /**
     * Node for configuring an AMQP endpoint
     */
    function amqpEndpointNode(n) {

        RED.nodes.createNode(this, n)

        this.host = n.host
        this.port = n.port
    }

    RED.nodes.registerType('amqp-endpoint', amqpEndpointNode)

    /**
     * Node for AMQP sender
     */
    function amqpSenderNode(n) {

        RED.nodes.createNode(this, n);

        var container = rhea.create_container()

        // get endpoint configuration
        this.endpoint = n.endpoint
        this.endpointConfig = RED.nodes.getNode(this.endpoint)
        // get all other configuration
        this.address = n.address
        this.autosettle = n.autosettle

        var node = this
        // node not yet connected
        this.status({ fill: 'red', shape: 'dot', text: 'disconnected' })

        if (this.endpointConfig) {

            container.on('connection_open', function(context) {
                
                // node connected
                node.status({ fill: 'green', shape: 'dot', text: 'connected' })

                var options = { 'target' : node.address, 'autosettle' : node.autosettle }
                node.sender = context.connection.open_sender(options)
            })

            container.on('disconnected', function(context) {
                // node disconnected
                node.status({ fill: 'red', shape: 'dot', text: 'disconnected' })
            })

            this.on('input', function(msg) {
                var message = msg.payload
                // enough credits to send
                if (node.sender.sendable()) {
                    node.sender.send({body : message})
                }
            })

            this.on('close', function() {
                if (node.sender != null)
                    node.sender.detach()
                connection.close()
            })

            var options = { 'host' : node.endpointConfig.host, 'port' : node.endpointConfig.port }
            node.connection = container.connect(options)
        }
    }

    RED.nodes.registerType('amqp-sender', amqpSenderNode)

    /**
     * Node for AMQP receiver
     */
    function amqpReceiverNode(n) {

        RED.nodes.createNode(this, n)

        var container = rhea.create_container()

        // get endpoint configuration
        this.endpoint = n.endpoint
        this.endpointConfig = RED.nodes.getNode(this.endpoint)
        // get all other configuration
        this.address = n.address
        this.autoaccept = n.autoaccept

        var node = this
        // node not yet connected
        this.status({ fill: 'red', shape: 'dot', text: 'disconnected' })

        if (this.endpointConfig) {
            
            container.on('connection_open', function(context) {
                // node connected
                node.status({ fill: 'green', shape: 'dot', text: 'connected' })

                var options = { 'source' : node.address, 'autoaccept' : node.autoaccept }
                console.log(options)
                node.receiver = context.connection.open_receiver(options)
            })

            container.on('disconnected', function(context) {
                // node disconnected
                node.status({fill: 'red', shape: 'dot', text: 'disconnected' })
            })

            container.on('message', function(context) {
                var msg = { payload: context.message.body }
				node.send(msg)
            })

            this.on('close', function() {
                if (node.receiver != null)
                    node.receiver.detach()
                node.connection.close()
            })

            var options = { 'host' : node.endpointConfig.host, 'port' : node.endpointConfig.port }
            node.connection = container.connect(options)
        }
    }

    RED.nodes.registerType('amqp-receiver', amqpReceiverNode)
}
