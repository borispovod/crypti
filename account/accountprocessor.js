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
}

accountprocessor.prototype.addAccount = function (account) {
    this.accounts[account.address] = account;
}

accountprocessor.prototype.processRequest = function (request, callback) {
    var self = this;

    var publicKey = request.publicKey,
        timestamp = parseInt(request.timestamp),
        signature = request.signature;
    //ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!publicKey || !timestamp || isNaN(timestamp) || !signature) {
        return callback(false);
    }

    var time = utils.getEpochTime(new Date().getTime()) - 60;
    if (timestamp < time || timestamp > utils.getEpochTime(new Date().getTime())) {
        return callback(false);
    }

    var hash = crypto.createHash('sha256').update(timestamp.toString(), 'utf8').digest();
    var verify = ed.Verify(hash, new Buffer(signature, 'hex'), new Buffer(publicKey, 'hex'));

    if (!verify) {
        return callback(false);
    }

    var account = self.getAccountByPublicKey(new Buffer(publicKey, 'hex'));
    if (!account) {
        return callback(false);
    }

    if (account.getEffectiveBalance() <= 0) {
        return callback(false);
    }


    var now = utils.getEpochTime(new Date().getTime());
    var alive = self.getAliveAccountTime(account.address);

    if (now - alive < 10) {
        return callback(false);
    }

    var requests = self.getRequests(account.address);
    async.forEach(requests, function (item, cb) {
        if (item.timestamp == timestamp) {
            return callback(true);
        }

        /*if ((item.ip == ip && item.publicKey != publicKey) || (item.publicKey == publicKey && item.ip != ip)) {
         return cb(true);
         }*/

        cb();
    }, function (found) {
        if (found) {
            return callback(false);
        } else {
            var request = {
                timestamp : timestamp,
                publicKey : publicKey,
                signature : signature,
                time : now
                //ip : ip
            };

            self.addRequest(account, request);

            if (account.weight > 0) {
                account.weight += 10;
                self.addAliveAccounts(account, now);
                return callback(true);
            } else {
                account.weight = 10;
                self.addAliveAccounts(account, now);
                return callback(true);
            }

            // send to another nodes
            //app.peerprocessor.sendRequestToAll(request);
        }
    });
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

accountprocessor.prototype.getKeyPair = function (secretPhrase) {
    var hash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);
    return keypair;
}


module.exports.init = function () {
    return new accountprocessor();
}
