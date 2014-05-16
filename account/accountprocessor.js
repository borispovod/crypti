var account = require('./account.js'),
    crypto = require('crypto'),
    bignum = require('bignum');

var accountprocessor = function (db) {
    this.accounts = {};
}

accountprocessor.prototype.addAccount = function(account) {
    this.accounts[account.address] = account;
}

accountprocessor.prototype.getAccountById = function (address) {
    return this.accounts[address];
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


module.exports.init = function () {
    return new accountprocessor();
}
