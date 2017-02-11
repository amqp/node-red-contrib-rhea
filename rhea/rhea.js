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

    var container = require('rhea');

    /**
     * Node for configuring an AMQP endpoint
     */
    function amqpEndpointNode(n) {

        RED.nodes.createNode(this, n);

        // save node parameters
        this.host = n.host;
        this.port = n.port;
        this.username = n.username;
        this.password = n.password;

        // build options for connection
        var options = { host: this.host, port: this.port, container_id: container.generate_uuid() };
        if (this.username) {
            options.username = this.username;
        }
        if (this.password) {
            options.password = this.password;
        }

        var node = this;

        this.connected = false;
        this.connecting = false;

        /**
         * Exposed function for connecting to the remote AMQP container
         * creating an AMQP connection object
         * 
         * @param callback  function called when the connection is established
         */
        this.connect = function(callback) {

            // AMQP connection not established, trying to do that
            if (!node.connected && !node.connecting) {

                node.connecting = true;

                node.connection = container.connect(options);

                node.connection.on('connection_error', function(context) {

                    node.connecting = false;
                    node.connected = false;
                    var error = context.connection.get_error();
                    node.error(error);
                    
                });

                node.connection.on('connection_open', function(context) {

                    node.connecting = false;
                    node.connected = true;
                    
                    callback(context.connection);
                });

                node.connection.on('disconnected', function(context) {

                    node.connected = false;
                });

            // AMQP connection already established
            } else {

                callback(node.connection);
            }

        }  
    }

    RED.nodes.registerType('amqp-endpoint', amqpEndpointNode)

    /**
     * Node for AMQP sender
     */
    function amqpSenderNode(config) {

        RED.nodes.createNode(this, config);

        // get endpoint configuration
        this.endpoint = RED.nodes.getNode(config.endpoint);
        // get all other configuration
        this.address = config.address;
        this.autosettle = config.autosettle;
        this.dynamic = config.dynamic;
        this.sndsettlemode = config.sndsettlemode;
        this.rcvsettlemode = config.rcvsettlemode;
        this.durable = config.durable;
        this.expirypolicy = config.expirypolicy;

        var node = this;
        // node not yet connected
        this.status({ fill: 'red', shape: 'dot', text: 'disconnected' });

        if (node.endpoint) {

            node.endpoint.connect(function(connection) {
                setup(connection);
            });
            
            /**
             * Node setup for creating sender link 
             * 
             * @param connection    Connection instance
             */
            function setup(connection) {

                node.connection = connection;

                // node connected
                node.status({ fill: 'green', shape: 'dot', text: 'connected' });

                // build sender options based on node configuration
                var options = { 
                    target: { 
                        address: node.address, 
                        dynamic: node.dynamic,
                        durable: node.durable,
                        expiry_policy: node.expirypolicy
                    }, 
                    autosettle: node.autosettle,
                    snd_settle_mode: node.sndsettlemode,
                    rcv_settle_mode: node.rcvsettlemode
                };
                node.sender = node.connection.open_sender(options);

                node.sender.on('accepted', function(context) {
                    var msg = outDelivery(node, context.delivery);
                    node.send(msg);
                });
                
                node.sender.on('released', function(context) {
                    var msg = outDelivery(node, context.delivery);
                    node.send(msg);
                });
                
                node.sender.on('rejected', function(context) {
                    var msg = outDelivery(node, context.delivery);
                    node.send(msg);
                });

                node.connection.on('disconnected', function(context) {
                    // node disconnected
                    node.status({fill: 'red', shape: 'dot', text: 'disconnected' });
                });

                node.on('input', function(msg) {
                    // enough credits to send
                    if (node.sender.sendable()) {
                        node.sender.send(msg.payload);
                    }
                });

                node.on('close', function() {
                    if (node.sender != null)
                        node.sender.detach();
                    node.connection.close();
                });
            }

        }
    }
    
    function outDelivery(node, delivery) {
        var msg = { 
            delivery: delivery,
            deliveryStatus: delivery.remote_state.constructor.composite_type 
        };
        return msg;
    }

    RED.nodes.registerType('amqp-sender', amqpSenderNode);

    /**
     * Node for AMQP receiver
     */
    function amqpReceiverNode(config) {

        RED.nodes.createNode(this, config);
        
        // get endpoint configuration
        this.endpoint = RED.nodes.getNode(config.endpoint);
        // get all other configuration
        this.address = config.address;
        this.autoaccept = config.autoaccept;
        this.creditwindow = config.creditwindow;
        this.dynamic = config.dynamic;
        this.sndsettlemode = config.sndsettlemode;
        this.rcvsettlemode = config.rcvsettlemode;
        this.durable = config.durable;
        this.expirypolicy = config.expirypolicy;
        
        if (this.dynamic)
            this.address = undefined;

        var node = this;
        // node not yet connected
        this.status({ fill: 'red', shape: 'dot', text: 'disconnected' });

        if (this.endpoint) {

            node.endpoint.connect(function(connection) {
                setup(connection);
            });

            /**
             * Node setup for creating receiver link 
             * 
             * @param connection    Connection instance
             */
            function setup(connection) {

                node.connection = connection;

                // node connected
                node.status({ fill: 'green', shape: 'dot', text: 'connected' });

                // build receiver options based on node configuration
                var options = {
                    source: { 
                        address: node.address, 
                        dynamic: node.dynamic,
                        durable: node.durable,
                        expiry_policy: node.expirypolicy
                     },  
                    credit_window: node.creditwindow, 
                    autoaccept: node.autoaccept,
                    snd_settle_mode: node.sndsettlemode,
                    rcv_settle_mode: node.rcvsettlemode
                };
                
                node.receiver = node.connection.open_receiver(options);

                node.receiver.on('message', function(context) {
                    var msg = { 
                        payload: context.message,
                        delivery: context.delivery 
                    };
                    node.send(msg);
                });

                node.connection.on('disconnected', function(context) {
                    // node disconnected
                    node.status({fill: 'red', shape: 'dot', text: 'disconnected' });
                });

                node.on('input', function(msg) {
                    if (msg.credit) {
                        node.receiver.flow(msg.credit);
                    }
                });

                node.on('close', function() {
                    if (node.receiver != null)
                        node.receiver.detach();
                    node.connection.close();
                });
            }

        }
    }

    RED.nodes.registerType('amqp-receiver', amqpReceiverNode)

    /**
     * Node for AMQP requester
     */
    function amqpRequesterNode(config) {

        RED.nodes.createNode(this, config);

        //var container = rhea.create_container();

        // get endpoint configuration
        this.endpoint = RED.nodes.getNode(config.endpoint);
        // get all other configuration
        this.address = config.address;

        var node = this;
        // node not yet connected
        this.status({ fill: 'red', shape: 'dot', text: 'disconnected' });

        if (this.endpoint) {

            node.endpoint.connect(function(connection) {
                setup(connection);
            });

            /**
             * Node setup for creating sender link for sending the request
             * and the dynamic receiver for receiving reply 
             * 
             * @param connection    Connection instance
             */
            function setup(connection) {

                node.connection = connection;

                // node connected
                node.status({ fill: 'green', shape: 'dot', text: 'connected' });
                
                // build sender options based on node configuration
                var sender_options = { 
                    target: { 
                        address: node.address 
                    }
                };
                node.sender = node.connection.open_sender(sender_options);

                node.sender.on('accepted', function(context) {
                    var msg = outDelivery(node, context.delivery);
                    node.send([msg, ]);
                });
                
                node.sender.on('released', function(context) {
                    var msg = outDelivery(node, context.delivery);
                    node.send([msg, ]);
                });
                
                node.sender.on('rejected', function(context) {
                    var msg = outDelivery(node, context.delivery);
                    node.send([msg, ]);
                });

                // build receiver options
                var receiver_options = {
                    source: {
                        dynamic: true
                    }
                };
                node.receiver = node.connection.open_receiver(receiver_options);

                node.receiver.on('message', function(context) {
                    var msg = { 
                        payload: context.message,
                        delivery: context.delivery 
                    };
                    node.send([ ,msg]);
                });

                node.connection.on('disconnected', function(context) {
                    // node disconnected
                    node.status({fill: 'red', shape: 'dot', text: 'disconnected' });
                });

                node.on('input', function(msg) {
                    // enough credits to send
                    if (node.sender.sendable()) {
                        
                        if (node.receiver.source.address) {
                            node.sender.send({ properties: { reply_to: node.receiver.source.address}, body: msg.payload.body });
                        }
                        
                    }
                });

                node.on('close', function() {
                    if (node.sender != null)
                        node.sender.detach();
                    if (node.receiver != null)
                        node.receiver.detach();
                    node.connection.close();
                })
            }

        }
    }

    RED.nodes.registerType('amqp-requester', amqpRequesterNode);

    /**
     * Node for AMQP responder
     */
    function amqpResponderNode(config) {

        RED.nodes.createNode(this, config);

        // get endpoint configuration
        this.endpoint = RED.nodes.getNode(config.endpoint);
        // get all other configuration
        this.address = config.address;

        var node = this;
        // node not yet connected
        this.status({ fill: 'red', shape: 'dot', text: 'disconnected' });

        if (this.endpoint) {

            node.endpoint.connect(function(connection) {
                setup(connection);
            });

            /**
             * Node setup for creating receiver link for receiving the request
             * and the sender for sending reply 
             * 
             * @param connection    Connection instance
             */
            function setup(connection) {

                node.connection = connection;

                // node connected
                node.status({ fill: 'green', shape: 'dot', text: 'connected' });
                
                node.sender = node.connection.open_sender({ target: {} });

                // build receiver options
                var receiver_options = {
                    source: { 
                        address: node.address 
                    }
                };
                node.receiver = node.connection.open_receiver(receiver_options);

                node.receiver.on('message', function(context) {
                
                    // save request and reply_to address on AMQP message received
                    request = context.message;
                    reply_to = request.properties.reply_to;
                    
                    // provides the request and delivery as node output
                    var msg = { 
                        payload: context.message,
                        delivery: context.delivery 
                    };
                    node.send(msg);
                });

                var request = undefined;
                var reply_to = undefined;
                var response = undefined;

                node.connection.on('disconnected', function(context) {
                    // node disconnected
                    node.status({fill: 'red', shape: 'dot', text: 'disconnected' });
                });

                node.on('input', function(msg) {
                    // enough credits to send
                    if (node.sender.sendable()) {
                        
                        if (reply_to) {
                            
                            // fill the response with the provided one as input
                            response = msg.payload;
                            // if "properties" aren't defined by the original input (response) message, create with "to" only
                            if (response.properties === undefined)
                                response.properties = { to: reply_to };
                            // otherwise add "to" field to already existing "properties"    
                            else
                                response.properties.to = reply_to;
                                    
                            node.sender.send(response); 
                        }
                    }
                });

                node.on('close', function() {
                    if (node.sender != null)
                        node.sender.detach();
                    if (node.receiver != null)
                        node.receiver.detach();
                    node.connection.close();
                })

            }

        }
    }

    RED.nodes.registerType('amqp-responder', amqpResponderNode);
}
