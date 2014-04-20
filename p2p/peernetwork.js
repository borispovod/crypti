var Peer = require("./peer.js"),
    Seed = require("./seed.js"),
    express = require('express');

var peernetwork = function (port, version, os, whitelist, peerProcessor) {
    this.peer = new Peer(port, version, os);
    this.seed = new Seed(port, peerProcessor, this.peer);
    this.seed.listen();

    for (var i = 0; i < whitelist.length; i++) {
        this.seed.connect(whitelist[i].host, whitelist[i].port);
    }

    this.processNetwork();
}

peernetwork.prototype.processNetwork = function () {
    this.seed.on("connected", function (res, id) {
        console.log("peer connected: " + id);
        this.seed.sendToPeer(id, "hello");
    }.bind(this));

    this.seed.on("hello", function (res, params, id) {
        console.log("Hello from " + id);
    }.bind(this));
}

module.exports = peernetwork;