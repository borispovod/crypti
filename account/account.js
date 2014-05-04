var blockchain = require("../block").blockchain.getInstance();

var account = function (address, publickey, balance, unconfirmedBalance) {
    this.address = address;
    this.publickey = publickey;
    this.balance = 0;
    this.unconfirmedBalance = 0;
    this.height = blockchain.getLastBlock().height;
}

account.property.addToBalance = function (amount) {
    this.balance += amount;
}

account.property.addToUnconfirmedBalance = function (amount) {
    this.unconfirmedBalance += amount;
}

account.property.setBalance = function (balance) {
    this.balance = balance;
}

account.property.setUnconfirmedBalance = function(balance) {
    this.unconfirmedBalance = balance;
}

account.property.getEffectiveBalance = function () {
    var lastBlock = blockchain.getLastBlock();
    if (lastBlock.height > 0) {

        if (lastBlock.height - this.height < 1440) {
            return 0;
        }

        var amount = 0;
        for (var i = 0; i < lastBlock.transactions.length; i++) {
            var t = lastBlock.transactions[i];

            if (t.recipient == this.address) {
                amount += t.amount;
            }
        }

        return this.balance - amount;
    } else {
        return this.balance;
    }
}


module.exports = account;