var async = require('async');

module.exports = function (app) {
    app.get('/api/getAddressesByAccount', function (req, res) {
        var accountId = req.query.accountId || "";

        if (accountId.length == 0) {
            return res.json({ success : false, error : "Provide account id" });
        }

        var account = app.accountprocessor.getAccountById(accountId);
        if (!account) {
            return res.json({ success : false, error : "Account not found" });
        }

        var publicKey = account.publickey.toString('hex');
        var q = app.db.sql.prepare("SELECT * FROM addresses WHERE generatorPublicKey = ?");
        q.bind(publicKey);

        q.run(function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, error : "Sql error" });
            } else {
                var addresses = rows;
                var unconfirmedAddresses = [];

                async.forEach(addresses, function (item, cb) {
                    var blockId = item.blockId;
                    item.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                    cb();
                }, function () {
                    async.forEach(app.addressprocessor.unconfirmedAddresses, function (item, cb) {
                        if (item.generatorPublicKey.toString('hex') == publicKey) {
                            unconfirmedAddresses.push(item);
                        }

                        cb();
                    }, function () {
                        return res.json({ success : true, addresses : addresses, unconfirmedAddresses : unconfirmedAddresses });
                    });
                });
            }
        });
    });

    app.get("/api/getReceivedTransactionsByAddress", function (req, res) {
        var accountId = req.query.accountId || "";
        var q = app.db.sql.prepare("SELECT * FROM trs WHERE recepient = ?");
        q.bind(accountId);
        q.run(function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, error : "Sql error" });
            } else {
                var transactions = rows;
                var unconfirmedTransactions = [];
                async.forEach(transactions, function (item, cb) {
                    var blockId = item.blockId;
                    item.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                    cb();
                }, function () {
                    async.forEach(app.transactionprocessor.unconfirmedTransactions, function (item, cb) {
                        if (item.recepientId == accountId) {
                            unconfirmedTransactions.push(item);
                            cb();
                        }
                    }, function () {
                        return res.json({ success : true, transactions : transactions, unconfirmedTransactions : unconfirmedTransactions });
                    });
                });
            }
        });
    });

    app.get("/api/getSentTransactionsByAddress", function (req, res) {
        var accountId = req.query.accountId || "";

        var account = app.accountprocessor.getAccountById(accountId);
        if (!account) {
            return res.json({ success : false, error : "Account not found" });
        }

        var publicKey = account.publickey.toString('hex');

        var q = app.db.sql.prepare("SELECT * FROM trs WHERE senderPublicKey = ?");
        q.bind(publicKey);
        q.run(function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, error : "Sql error" });
            } else {
                var transactions = rows;
                var unconfirmedTransactions = [];
                async.forEach(transactions, function (item, cb) {
                    var blockId = item.blockId;
                    item.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                    cb();
                }, function () {
                    async.forEach(app.transactionprocessor.unconfirmedTransactions, function (item, cb) {
                        if (item.senderPublicKey.toString('hex') == publicKey) {
                            unconfirmedTransactions.push(item);
                            cb();
                        }
                    }, function () {
                        return res.json({ success : true, transactions : transactions, unconfirmedTransactions : unconfirmedTransactions });
                    });
                });
            }
        });
    });

    app.get("/api/getAmountMinedByAddress", function (req, res) {
        var addr = req.query.address || "";
        var mined = 0,
            unconfirmed = 0;

        if (addr.length == 0) {
            return res.json({ success : false, error : "Provide address" });
        }

        var address = app.addressprocessor.addresses[addr];
        if (!address) {
            return res.json({ success : false, error : "Account not found" });
        }

        var accountId = req.query.accountId || "";
        var q = app.db.sql.prepare("SELECT * FROM trs WHERE recepient = ?");
        q.bind(address.id);
        q.run(function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, error : "Sql error" });
            } else {
                var transactions = rows;
                async.forEach(transactions, function (item, cb) {
                    var blockId = item.blockId;
                    item.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                    if (item.confirmations > 10) {
                        mined += item.fee / 2;
                    } else {
                        unconfirmed += item.fee / 2;
                    }

                    cb();
                }, function () {
                    return res.json({ success : true, mined : mined, unconfirmed : unconfirmed });
                });
            }
        });
    });
}