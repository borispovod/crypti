var n2n = require('n2n'),
    Seed = n2n.Seed,
    Node = n2n.Node,
    Peer = require('./peer.js');

var peernetwork = function (port, version, os, whitelist, peerProcessor) {
    this.seed = new Seed();
    this.seed.listen(port);

    this.node = new Node(port);
    this.peer = new Peer(port, version, os);
    this.whitelist = whitelist;
    this.peerProcessor = peerProcessor;

    if (whitelist.length) {
        this.node.connect(whitelist);
    }

    this.processNetwork();
}

peernetwork.prototype.processNetwork = function () {
    this.node.on("online", function () {
        console.log("I'm online: " + this.id);
    });

    this.node.on("node::online", function (node) {
        console.log("Node online: " + node.id);
        this.node.send(node.id, "getInfo");
        this.node.send(node.id, "getPeers");
    }.bind(this));

    /*
    this.node.on("node::getInfo", function (senderId) {
        this.node.send(senderId, "info", { ip : this.ip, port : this.port, version : this.version, os : this.os });
    }.bind(this));

    this.node.on("node::getPeers", function (senderId) {
        this.node.send(senderId, "peers", { peers : this.peersProcessor.getPeers() });
    }.bind(this));

    this.node.on("node::peers", function (senderId, data) {
        this.peerProcessor.process(data.peers);
    }.bind(this));

    this.node.on("node::info", function (senderId, info) {

    }.bind(this));*/
}

module.exports = peernetwork;