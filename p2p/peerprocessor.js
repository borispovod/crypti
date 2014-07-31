var peer = require("./peer.js"),
    _ = require("underscore"),
    async = require('async');

var peerprocessor = function () {
    this.peers = {};
    this.blockedPeers = {};
}

peerprocessor.prototype.setApp = function (app) {
    this.app = app;
}

peerprocessor.prototype.connectToPeer = function (peer, cb) {
    /*var socket = io.connect(peer.ip, {
        port: peer.port
    });

    socket.on('connect', function() {
        socket.on('disconnected?', function () {

        });
    });*/
}

peerprocessor.prototype.sendRequestToAll = function (request, cb) {
    var peers = this.getPeersAsArray();
    async.forEach(peers, function (peer, callback) {
        if (!peer.blocked) {
            peer.sendRequest(request, function () {
                callback();
            });
        }
    }, function () {
        if (cb) {
            cb(true);
        }
    });
}

peerprocessor.prototype.sendHelloToAll = function (params, cb) {
    /*var peers = this.getPeersAsArray();
    var self = this;
    async.forEach(peers, function (peer, callback) {
        if (!peer.blocked) {
            peer.sendHello(params, function () {
                callback();
            });
        }
    }, function () {
       async.eachSeries(peers, function (item, callback) {
           if (!item.timestamp || !item.publicKey) {
               return callback();
           }

           self.app.db.writePeer(item, function () {
               callback();
           })
       }, function () {
           if (cb) {
               cb(true);
           }
       });
    });*/
}

peerprocessor.prototype.sendUnconfirmedTransactionToAll = function (transaction, cb) {
    var peers = this.getPeersAsArray();
    async.forEach(peers, function (peer, callback) {
        if (!peer.blocked) {
            peer.processUnconfirmedTransaction(transaction, function () {
                callback();
            });
        }
    }, function () {
        if (cb) {
            cb(true);
        }
    });
}

peerprocessor.prototype.sendUnconfirmedAddressToAll = function (address, cb) {
    var peers = this.getPeersAsArray();
    async.forEach(peers, function (peer, callback) {
        if (!peer.blocked) {
            peer.processUnconfirmedAddress(address, function () {
                callback();
            });
        }
    }, function () {
        if (cb) {
            cb(true);
        }
    });
}

peerprocessor.prototype.sendBlockToAll = function (block, cb) {
    var peers = this.getPeersAsArray();
    async.forEach(peers, function (peer, callback) {
        if (!peer.blocked) {
            peer.processBlock(block, function () {
                callback();
            });
        }
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
    if (this.peers[peer.ip]) {
        return false;
    } else {
        this.peers[peer.ip] = peer;
        return true;
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