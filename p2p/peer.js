var crypto = require('crypto'),
    ed = require('ed25519'),
    bignum = require('bignum');

var peer = function (port, version, os, ip) {
    this.port = port;
    this.version = version;
    this.os = os;
    this.ip = ip;
}

peer.prototype.getId = function (cb) {
    if (!this.id) {
        var shasum = crypto.createHash('sha256'),
            json = JSON.stringify(this);

        shasum.update(json, 'utf8');
        var hash = shasum.digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = hash[7-i];
        }

        this.id = bignum.fromBuffer(temp).toString();

        if (cb) {
            cb(null, this.id);
        } else {
            return this.id;
        }
    } else {
        if (cb) {
            cb(null, this.id);
        } else {
            return this.id;
        }
    }
}


module.exports = peer;