var crypto = require('crypto');

//private
var modules, library;
var accounts;

//public
function Account(address, balance, unconfirmedBalance) {
    this.address = address;
    this.balance = balance || 0;
    this.unconfirmedBalance = unconfirmedBalance || 0;
}

Account.prototype.addToBalance = function (amount) {
    this.balance += amount;
}

Account.prototype.addToUnconfirmedBalance = function (amount) {
    this.unconfirmedBalance += amount;
}

Account.prototype.setBalance = function (balance) {
    this.balance = balance;
}

Account.prototype.setUnconfirmedBalance = function (unconfirmedBalance) {
    this.unconfirmedBalance = unconfirmedBalance;
}

function Accounts(cb, scope) {
    library = scope;
    accounts = {};

    setImmediate(function () {
        cb(null, this);
    }.bind(this));
}

Accounts.prototype.addAccount = function (account) {
    if (!accounts[account.address]) {
        accounts[account.id] = account;
    }
}

Accounts.prototype.getAccount = function (id) {
    return accounts[id];
}

Accounts.prototype.getAccountByPublicKey = function (publicKey) {
    var address = this.getAddressByPublicKey(publicKey);
    return this.getAccount(address);
}

Accounts.prototype.getAddressByPublicKey = function (publicKey) {
    var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = publicKeyHash[7-i];
    }

    var address = bignum.fromBuffer(temp).toString() + "C";
    return address;
}

Accounts.prototype.getAccountOrCreate = function (address) {
    var account = this.getAccount(address);

    if (!account) {
        account = new Account(address);
        this.addAccount(account);

        return account;
    } else {
        return account;
    }
}

Accounts.prototype.getAllAccounts = function () {
    return accounts;
}

Accounts.prototype.run = function (scope) {
    modules = scope;
}

module.exports = Accounts;