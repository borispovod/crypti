var ed = require('ed25519'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    bignum = require('bignum');

var requestconfirmation = function (address) {
    this.address = address;
}

requestconfirmation.prototype.getBytes = function () {
    var bb = new ByteBuffer(8, true);

    var address = this.address.slice(0, -1);
    var addressBuffer = bignum(address).toBuffer({ 'size' : '8' });

    for (var i = 0; i < addressBuffer.length; i++) {
        bb.writeByte(addressBuffer[i]);
    }

    bb.flip();
    return bb.toBuffer();
}

requestconfirmation.prototype.toJSON = function () {
    var obj = _.extend({}, this);
    return obj;
}

requestconfirmation.prototype.getId = function () {
    if (!this.blockId) {
        return null;
    }

    if (!this.id) {
        var bb = new ByteBuffer(16, true);

        var address = this.address.slice(0, -1);
        var addressBuffer = bignum(address).toBuffer({ 'size': '8' });

        for (var i = 0; i < addressBuffer.length; i++) {
            bb.writeByte(addressBuffer[i]);
        }

        var blockIdBuffer = bignum(this.blockId).toBuffer({ size: '8'});

        for (var i = 0; i < blockIdBuffer.length; i++) {
            bb.writeByte(blockIdBuffer[i]);
        }

        bb.flip();
        var buffer = bb.toBuffer();
        var hash = crypto.createHash('sha256').update(buffer).digest();

        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = hash[7 - i];
        }

        this.id = bignum.fromBuffer(temp).toString();
        return this.id;
    } else {
        return this.id;
    }
}

module.exports = requestconfirmation;