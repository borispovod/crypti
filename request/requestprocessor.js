var ed = require('ed25519'),
    request = require('./request.js'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js");


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
    return new request(null, JSON.id, JSON.ip, new Buffer(JSON.publicKey, 'hex'), JSON.lastAliveBlock, new Buffer(JSON.signature, 'hex'));
}

requestprocessor.prototype.transactionFromBuffer = function (bb) {
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

    r.lastAliveBlock = bignum.fromBuffer(lastAliveBlockBuffer).toString();


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

    r.lastAliveBlock = bignum.fromBuffer(lastAliveBlockBuffer).toString();


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
        return false;
    }

    if (!request.verify()) {
        return false;
    }

    if (request.lastAliveBlock != lastBlock.getId()) {
        return false;
    }

    var account = this.app.accountprocessor.getAccountByPublicKey(request.publicKey);

    if (!account) {
        return false;
    }

    if (account.getEffectiveBalance() < 10000) {
        return false;
    }

    if (this.unconfirmedRequests[account.address]) {
        return false;
    }

    this.unconfirmedRequests[account.address] = request;
    return true;
}


module.exports = requestprocessor;