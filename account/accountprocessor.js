var account = require('./account.js'),
    crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    async = require('async'),
    utils = require("../utils.js");

var accountprocessor = function (db) {
    this.accounts = {};
    this.aliveAccounts = {};
    this.requests = {};
    this.purchases = {};
}

accountprocessor.prototype.setApp = function (app) {
    this.app = app;
}

accountprocessor.prototype.addAccount = function (account) {
    this.accounts[account.address] = account;
}

accountprocessor.prototype.processRequest = function (request) {
    var publicKey = request.publicKey,
        signature = request.signature,
        lastAliveBlock = request.lastAliveBlock,
        ip = request.ip;

    if (!publicKey || !ip || !signature) {
        app.logger.error("Peer parameters missed: " + ip);
        return false;
    }

    var publicKeyHash = publicKey;
    var signatureHash = signature;

    var hash = crypto.createHash('sha256').update(publicKeyHash).digest();
    var verify = ed.Verify(hash, signatureHash, publicKeyHash);

    if (!verify) {
        app.logger.error("Can't verify signature: " + ip);
        return false;
    }

    var account = this.getAccountByPublicKey(publicKeyHash);

    if (!account) {
        app.logger.error("Can't find account: " + ip);
        return false;
    }

    if (account.getEffectiveBalance() <= 0) {
        app.logger.error("Can't accept request, effective balance equal 0: "+ ip + "/" + account.address);
        return false;
    }

    if (!lastAliveBlock) {
        if (account.lastAliveBlock == this.app.blockchain.getLastBlock().getId()) {
            this.app.logger.error("Can't accept request, request already processed in this block: " + ip + "/" + account.address);
            return false;
        }
    } else {
        if (account.lastAliveBlock == lastAliveBlock) {
            this.app.logger.error("Can't accept request, request already processed in this block: " + ip + "/" + account.address);
            return false;
        }
    }

    return account;
}

accountprocessor.prototype.getAccountById = function (address) {
    return this.accounts[address];
}

accountprocessor.prototype.getAliveAccountTime = function (address) {
    return this.aliveAccounts[address] || 0;
}

accountprocessor.prototype.addAliveAccounts = function (account, time) {
    this.aliveAccounts[account.address] = time;
}

accountprocessor.prototype.addRequest = function (account, request) {
    if (this.requests[account.address]) {
        this.requests[account.address].push(request);
    } else {
        this.requests[account.address] = [request];
    }
}

accountprocessor.prototype.getRequests = function (address) {
    return this.requests[address] || [];
}

accountprocessor.prototype.getAccountByPublicKey = function (publicKey) {
    var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = publicKeyHash[7-i];
    }

    var address = bignum.fromBuffer(temp).toString() + "C";

    return this.accounts[address];
}

accountprocessor.prototype.getAddressByPublicKey = function (publicKey) {
    var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = publicKeyHash[7-i];
    }

    var address = bignum.fromBuffer(temp).toString() + "C";
    return address;
}

accountprocessor.prototype.resetPopWeight = function () {
    for (var a in this.accounts) {
        this.accounts[a].popWeight = 0;
    }
}

accountprocessor.prototype.getKeyPair = function (secretPhrase) {
    var hash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);
    return keypair;
}


module.exports.init = function () {
    return new accountprocessor();
}
