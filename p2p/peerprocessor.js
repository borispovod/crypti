var peer = require("./peer.js"),
    _ = require("underscore");

var peerprocessor = function () {
    this.peers = {};
}

peerprocessor.prototype.addPeer = function (peer, cb) {
    var id = peer.getId();

    if (!this.peers[id]) {
        this.peers[id] = peer;

        if (cb) {
            cb(true);
        } else {
            return true;
        }
    } else {
        if (cb) {
            cb(false);
        } else {
            return false;
        }
    }
}

peerprocessor.prototype.getPeers = function (cb) {
    var array = _.map(this.peers, function (value, key) {
        return value;
    });

    if (cb) {
        cb(array);
    } else {
        return array;
    }
}

module.exports = peerprocessor;