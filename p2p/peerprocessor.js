var peer = require("./peer.js"),
    _ = require("underscore");

var peerprocessor = function () {
    this.peers = {};
    this.blockedPeers = {};
}

peerprocessor.prototype.removePeer = function (ip) {
    delete this.peers[ip];
}

peerprocessor.prototype.addPeer = function (peer) {
    if (this.peers[peer.ip]) {
        return false;
    } else {
        this.peers[peer.ip] = peer;
        return true;
    }
}

peerprocessor.prototype.getPeer = function (ip) {
    return this.peers[ip];
}

peerprocessor.prototype.getPeersAsArray = function () {
    var peers = _.map(this.peers, function (value, key) {
        return value;
    });

    return peers;
}

peerprocessor.prototype.getPeers = function () {
    return this.peers;
}

peerprocessor.prototype.getBlockedPeers = function () {
    return this.blockedPeers;
}

peerprocessor.prototype.getBlockedPeersAsArray = function () {
    var peers = _.map(this.blockedPeers, function (value, key) {
        return value;
    });

    return peers;
}

peerprocessor.prototype.getAnyPeer = function (blacklisted) {
    if (Object.keys(this.peers).length <= 0) {
        return null;
    }

    var peers = this.getPeersAsArray();
    var toReturn = null;

    while (true) {
        var peer = peers[Math.floor(Math.random() * peers.length)];
        if (!peer.checkBlacklisted()) {
            toReturn = peer;
            break;
        }
    }

    return toReturn;
}

module.exports = peerprocessor;