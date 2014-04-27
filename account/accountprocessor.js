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

accountprocessor.prototype.getBalance = function (id, cb) {
    this.db.serialize(function () {
        var s = this.db.prepare("SELECT SUM(CASE WHEN recipientId=$id THEN amount END) as balance, SUM(CASE WHEN senderId=$id AND recipientId!=$id THEN amount ELSE 0 END) AS minbalance, SUM(CASE WHEN senderId=$id THEN fee END) as fee FROM trs");
        s.bind({
            $id: id
        });
        s.get(function (err, row) {
            if (err) {
                if (cb) {
                    cb(err);
                } else {
                    return { err : err };
                }
            } else {
                console.log(row);
                cb(null, row.balance - row.minbalance - row.fee);
            }
        });
    }.bind(this));
}

module.exports = function (db) {
    return new accountprocessor(db);
}