var account = function (address, publickey, balance, unconfirmedBalance) {
    this.address = address;
    this.publickey = publickey;
    this.balance = 0;
    this.unconfirmedBalance = 0;
    this.height = 0;
}

account.prototype.setApp = function (app) {
    this.app = app;
    this.blockchain = this.app.blockchain;
}

account.prototype.addToBalance = function (amount) {
    this.balance += amount;
}

account.prototype.setHeight = function (height) {
    this.height = height;
}

account.prototype.addToUnconfirmedBalance = function (amount) {
    this.unconfirmedBalance += amount;
}

account.prototype.setBalance = function (balance) {
    this.balance = balance;
}

account.prototype.setUnconfirmedBalance = function(balance) {
    this.unconfirmedBalance = balance;
}

account.prototype.getEffectiveBalance = function () {
    if (!this.app || !this.app.blockchain) {
        return 0;
    }

    var lastBlock = this.app.blockchain.getLastBlock();


    if (lastBlock.height > 1440) {
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
        var amount = 0;
        for (var i = 0; i < lastBlock.transactions.length; i++) {
            var t = lastBlock.transactions[i];

            if (t.recipient == this.address) {
                amount += t.amount;
            }
        }

        return this.balance - amount;
    }
}


module.exports = account;