# AMQP 1.0 nodes for Node-RED

This project provides a set of nodes for [Node-RED](http://nodered.org/) that makes it easy to integrate AMQP 1.0 protocol in a flow application.

## Documentation

The official documentation is available [here](doc/Home.md).

## Installation

The nodes are based on [rhea library](https://github.com/grs/rhea), a reactive library for AMQP 1.0 protocol for easy development of both clients and servers. It's needed to install that library before starting to use rhea nodes inside a Node-RED flow. The simpler way to do it is use the Node Package Manager (NPM) and install the [rhea module](https://www.npmjs.com/package/rhea).

## Hacking

In order to test local changes to the node, it's possible to use the `npm link` command.

* in the directory containing the `package.json` file, run `sudo npm link`
* in the Node-RED user directly which typically is `~/.node-red`, run `npm link node-red-contrib-rhea`

This creates the symbolic link between the two directories so that when Node-RED discovers nodes from the suer directory, it will find the `node-red-contrib-rhea` node as well from the local git repository folder.
Any changes to the node code is reflected just restarting Node-RED.
