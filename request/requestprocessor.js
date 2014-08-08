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

    r.lastAliveBlock = bignum.fromBuffer(lastAliveBlockBuffer, { size : '8' }).toString();


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

requestprocessor.prototype.processRequest = function (request, send) {
    var lastBlock = this.app.blockchain.getLastBlock();
    var now = utils.getEpochTime(new Date().getTime());
    var elapsedTime = lastBlock.timestamp - now;

    if (!request.verify()) {
        this.app.logger.error("Can't verify request signature: " + request.getId());
        return false;
    }

    if (request.lastAliveBlock != lastBlock.getId()) {
        this.app.logger.warn("Request last block not valid: " + request.getId());
        return false;
    }

    var account = this.app.accountprocessor.getAccountByPublicKey(request.publicKey);

    if (!account) {
        this.app.logger.warn("Request account not found: " + request.getId());
        return false;
    }

    if (account.getEffectiveBalance() < 1000 * Constants.numberLength) {
        this.app.logger.warn("Request not have effective balance: " + request.getId());
        return false;
    }

    if (this.unconfirmedRequests[account.address]) {
        this.app.logger.warn("Request already added: " + request.getId() + "/" + account.address);
        return false;
    }

    this.unconfirmedRequests[account.address] = request;

    if (send) {
        this.app.peerprocessor.sendRequestToAll(request);
    }

    return true;
}


module.exports = requestprocessor;