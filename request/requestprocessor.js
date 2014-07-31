var ed = require('ed25519'),
    request = require('./request.js'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js"),
    Constants = require("../Constants.js");


var requestprocessor = function () {
    this.unconfirmedRequests = {};
    this.confirmedRequests = {};
}

requestprocessor.prototype.setApp = function (app) {
    this.app = app;
}

requestprocessor.prototype.getUnconfirmedRequest = function (address) {
    return this.unconfirmedRequests[address];
}

requestprocessor.prototype.getRequest = function (id) {
    return this.confirmedRequests[id];
}

requestprocessor.prototype.fromJSON = function (JSON) {
    return new request(null, JSON.blockId, JSON.ip, new Buffer(JSON.publicKey, 'hex'), JSON.lastAliveBlock, new Buffer(JSON.signature, 'hex'));
}

requestprocessor.prototype.fromByteBuffer = function (bb) {
    var r = new request();

    var buffer = new Buffer(32);
    for (var i = 0; i < 32; i++) {
        buffer[i] = bb.readByte();
    }

    r.publicKey = buffer;

    var lastAliveBlockBuffer = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        lastAliveBlockBuffer[i] = bb.readByte();
    }

    r.lastAliveBlock = bignum.fromBuffer(lastAliveBlockBuffer, { size : 'auto' }).toString();


    var signature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        signature[i] = bb.readByte();
    }

    r.signature = signature;
    return r;
}

requestprocessor.prototype.transactionFromBytes = function (buffer) {
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();

    var r = new request();

    var buffer = new Buffer(32);
    for (var i = 0; i < 32; i++) {
        buffer[i] = bb.readByte();
    }

    r.publicKey = buffer;

    var lastAliveBlockBuffer = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        lastAliveBlockBuffer[i] = bb.readByte();
    }

    r.lastAliveBlock = bignum.fromBuffer(lastAliveBlockBuffer, { size : 'auto' }).toString();


    var signature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        signature[i] = bb.readByte();
    }

    r.signature = signature;
    return r;
}

requestprocessor.prototype.processRequest = function (request) {
    var lastBlock = this.app.blockchain.getLastBlock();
    var now = utils.getEpochTime(new Date().getTime());
    var elapsedTime = lastBlock.timestamp - now;

    if (elapsedTime > 50) {
        console.log("elapsed time passed");
        return false;
    }

    if (!request.verify()) {
        console.log("can't verify request signature");
        return false;
    }

    if (request.lastAliveBlock != lastBlock.getId()) {
        console.log("request last block not valid");
        return false;
    }

    var account = this.app.accountprocessor.getAccountByPublicKey(request.publicKey);

    if (!account) {
        console.log("request account not found");
        return false;
    }

    if (account.getEffectiveBalance() < 10000 * Constants.numberLength) {
        console.log("request not have effective balance");
        return false;
    }

    if (this.unconfirmedRequests[account.address]) {
        console.log("request already added");
        return false;
    }

    this.unconfirmedRequests[account.address] = request;
    console.log("request added");
    return true;
}


module.exports = requestprocessor;