var ed = require('ed25519'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    bignum = require('bignum');


var requestconfirmation = function (address, random) {
    this.address = address;
    this.random = random;
}

requestconfirmation.prototype.getBytes = function () {
    var bb = new ByteBuffer(8 + 1, true);

    var address = this.address.slice(0, -1);
    var addressBuffer = bignum(address).toBuffer({ 'size' : '8' });

    for (var i = 0; i < addressBuffer.length; i++) {
        bb.writeByte(addressBuffer[i]);
    }

    if (this.random) {
        bb.writeByte(1);
    } else {
        bb.writeByte(0);
    }

    bb.flip();
    return bb.toBuffer();
}

requestconfirmation.prototype.toJSON = function () {
    var obj = _.extend({}, this);
    return obj;
}

requestconfirmation.prototype.getHash = function () {
    var bytes = this.getBytes();
    var hash = crypto.createHash('sha256').update(bytes).digest();
    return hash;
}

module.exports = requestconfirmation;