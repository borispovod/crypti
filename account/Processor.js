var bignum = require('bignum'),
    crypto = require('crypto'),
    ed = require('ed25519'),
    Account = require('./Account.js');

var Processor = function () {
    this.accounts = {};

    this.addAccount = function (account) {
        if (!this.accounts[account.address]) {
            this.accounts[account.address] = account;
        }
    }

    this.getAccount = function (address) {
        return this.accounts[address];
    }

    this.getAddress = function (publicKey) {
        var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();

        var temp = new Buffer(8);

        for (var i = 0; i < 8; i++) {
            temp[i] = publicKeyHash[7-i];
        }

        var address = bignum.fromBuffer(temp).toString() + 'C';

        return address;
    }

    this.getAccountByPublicKey = function (publicKey) {
        var address = this.getAddress(publicKey);
        return this.getAccount(address);
    }

    this.getAccountBySecret = function (secret) {
        var hash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        var address = this.getAddress(keypair.publicKey);

        var account = this.getAccount(address);

        if (account) {
            return account;
        }

        return new Account(address, keypair.publicKey);
    }
}

var processor = new Processor();


module.exports = processor;