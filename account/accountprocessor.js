var account = require('./account.js');

var accountprocessor = function (db) {
    this.db = db;
}

accountprocessor.prototype.getAccountById = function (address, cb) {
    this.db.serialize(function () {
        var s = this.db.prepare("SELECT * FROM account WHERE address=? LIMIT 1");
        s.bind(address);

        s.get(function (err, row) {
            if (err) {
                cb(err);
            } else {
                var a = new account(row.address, row.publickey, row.balance, row.unconfirmedbalance);
                cb(null, a);
            }
        });
    }.bind(this));
}

accountprocessor.prototype.getAccountByPublicKey = function (publickey, cb) {
    this.db.serialize(function () {
        var s = this.db.prepare("SELECT * FROM account WHERE publickey=? LIMIT 1");
        s.bind(publickey);

        s.get(function (err, row) {
            if (err) {
                cb(err);
            } else {
                var a = new account(row.address, row.publickey, row.balance, row.unconfirmedbalance);
                cb(null, a);
            }
        });
    }.bind(this));
}

module.exports = function (db) {
    return new accountprocessor(db);
}