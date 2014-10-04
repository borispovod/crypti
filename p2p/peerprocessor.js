var peer = require("./peer.js"),
    _ = require("underscore"),
    async = require('async'),
    utils = require("../utils.js");

var timeToBlock = 30;

var peerprocessor = function () {
    this.peers = {};
    this.blockedPeers = {};

    var blockedInterval = false;
    setInterval(function () {
        if (blockedInterval) {
            return;
        }

        blockedInterval = true;
        var now = utils.getEpochTime(new Date().getTime());
        for (var ip in this.blockedPeers) {
            var peer = this.blockedPeers[ip];

            if (peer.blockedTime + timeToBlock > now) {
                this.blockedPeers[ip] = null;
                delete this.blockedPeers[ip];

                if (Object.keys(this.peers).length < 100) {
                    this.peers[peer.ip] = peer;
                }
            }
        }

        blockedInterval = false;
    }.bind(this), 1000 * 60 * 5);
}

peerprocessor.prototype.setApp = function (app) {
    this.app = app;
}

peerprocessor.prototype.sendRequestToAll = function (request, cb) {
    var peers = this.getPeersAsArray();
    async.forEach(peers, function (peer, callback) {
        if (peer) {
            peer.sendRequest(request, function () {
            });
        }

        callback();
    }, function () {
        if (cb) {
            cb(true);
        }
    });
}

peerprocessor.prototype.sendUnconfirmedTransactionToAll = function (transaction, cb) {
    var peers = this.getPeersAsArray();
    async.forEach(peers, function (peer, callback) {
        peer.processUnconfirmedTransaction(transaction, function () {});
        callback();
    }, function () {
        if (cb) {
            cb(true);
        }
    });
}

peerprocessor.prototype.sendJSONBlockToAll = function (block, cb) {
    var peers = this.getPeersAsArray();
    async.forEach(peers, function (peer, callback) {
        peer.processJSONBlock(block, function () {});
        callback();
    }, function () {
        if (cb) {
            cb(true);
        }
    });
}

peerprocessor.prototype.sendBlockToAll = function (block, cb) {
    var peers = this.getPeersAsArray();
    async.forEach(peers, function (peer, callback) {
        peer.processBlock(block, function () {});
        callback();
    }, function () {
        if (cb) {
            cb(true);
        }
    });
}

peerprocessor.prototype.removePeer = function (ip) {
    delete this.peers[ip];
}

peerprocessor.prototype.addPeer = function (peer) {
    if (Object.keys(this.peers).length > 100) {
        return false;
    }

    if (this.blackList.indexOf(peer.ip) >= 0) {
        return false;
    }

    if (this.blockedPeers[peer.ip]) {
        return false;
    }

    if (this.peers[peer.ip]) {
        return false;
    } else {
        this.peers[peer.ip] = peer;
        return true;
    }
}

peerprocessor.prototype.blockPeer = function (ip) {
    if (this.peers[ip]) {
        var peer = this.peers[ip];

        this.peers[ip] = null;
        delete this.peers[ip];

        peer.blockedTime = utils.getEpochTime(new Date().getTime());
        this.blockedPeers[ip] = peer;

        this.app.logger.info("Peer blocked: " + ip);
    }
}

peerprocessor.prototype.getPeerByPublicKey = function (publicKey) {
    var peers = _.map(this.peers, function (value, key) {
        return value;
    });

    for (var i = 0; i < peers.length; i++) {
        if (peers[i].publicKey.toString('hex') == publicKey) {
            return peers[i];
        }
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

    peers = _.filter(peers, function (p) {
        return !p.isNat;
    });

    if (peers.length == 0) {
        return null;
    }

    var toReturn = null;

    while (true) {
        var peer = peers[Math.floor(Math.random() * peers.length)];
        if (!peer.blocked) {
            toReturn = peer;
            break;
        }
    }

    return toReturn;
}

module.exports = peerprocessor;