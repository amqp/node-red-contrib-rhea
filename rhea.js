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
    
    /**
     * Node for configuring an AMQP endpoint
     */
    function amqpEndpointNode(config) {
        
        RED.nodes.createNode(this, config)
        
        this.host = config.host
        this.port = config.port
        
        console.log("endpoint host : " + this.host)
        console.log("endpoint port : " + this.port)
    }
    
    RED.nodes.registerType('amqp-endpoint', amqpEndpointNode)
    
    /**
     * Node for AMQP sender
     */
    function amqpSenderNode(config) {
        
        RED.nodes.createNode(this, config);
        
        var container = require('rhea')
        
        // get endpoint configuration
        this.endpoint = config.endpoint
        this.endpointConfig = RED.nodes.getNode(this.endpoint)
        
        if (this.endpointConfig) {
            
            // get all other configuration
			this.address = config.address;
        
            var options = { 'host' : this.endpointConfig.host, 'port' : this.endpointConfig.port }
            container.connect(options).open_sender(this.address);
            
            var mycontext;
            
            this.on('input', function(msg) {
                
                var message = msg.payload;
                
                mycontext.sender.send({body : message})
            })
            
            container.on('sendable', function (context) {
                 mycontext = context 
                 console.log("sendable")
            })
        }
        
        
    }
    
    RED.nodes.registerType('amqp-sender', amqpSenderNode)
}