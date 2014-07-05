var async = require('async'),
    Constants = require ('../Constants'),
    _ = require('underscore'),
    utils = require('../utils.js');

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
        var q = app.db.sql.prepare("SELECT * FROM addresses WHERE generatorPublicKey = ? ORDER BY timestamp DESC");
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

    app.get('/api/getAllTransactions', function (req, res) {
        var accountId = req.query.accountId || "";

        var account = app.accountprocessor.getAccountById(accountId);
        if (!account) {
            return res.json({ success : false, transactions: [] });
        }

        if (!account.publickey) {
            return res.json({ success : false, transactions: [] });
        }

        var publicKey = account.publickey.toString('hex');

        var q = app.db.sql.prepare("SELECT * FROM trs WHERE recepient=? OR senderPublicKey=? ORDER BY timestamp DESC");
        q.bind([accountId, publicKey]);
        q.all(function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, error : "Sql error" });
            } else {
                if (!rows) {
                    rows = [];
                }

                var transactions = [];
                async.eachSeries(rows, function (item, cb) {
                    var blockId = item.blockId;
                    if (!app.blockchain.blocks[blockId]) {
                        cb();
                    } else {
                        item.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                        item.sender = app.accountprocessor.getAddressByPublicKey(new Buffer(item.senderPublicKey, 'hex'));
                        item.timestamp += utils.epochTime();
                        transactions.push(item);
                        cb();
                    }
                }, function () {
                    var unconfirmedTransactions = _.map(app.transactionprocessor.unconfirmedTransactions, function (v) { return _.extend({}, v) });
                    async.eachSeries(unconfirmedTransactions, function (item, с) {
                        if (item.recipientId == accountId || item.senderPublicKey.toString('hex') == publicKey) {
                            item.timestamp += utils.epochTime();
                            item.sender = app.accountprocessor.getAddressByPublicKey(new Buffer(item.senderPublicKey, 'hex'));
                            item.confirmations = "-";
                            item.recepient = item.recipientId;
                            transactions.unshift(item);
                        }

                        с();
                    }, function () {
                        return res.json({ success : true, transactions : transactions });
                    });
                });
            }
        });
    });

    app.get("/api/getReceivedTransactionsByAddress", function (req, res) {
        var accountId = req.query.accountId || "";
        var q = app.db.sql.prepare("SELECT * FROM trs WHERE recepient = ? ORDER BY timestamp");
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

        var q = app.db.sql.prepare("SELECT * FROM trs WHERE senderPublicKey = ? ORDER BY timestamp");
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

    app.get('/api/getMiningInfo', function (req, res) {
        var publicKey = req.query.publicKey || "";
        var totalForged = 0,
            totalMined = 0;
        app.db.sql.all("SELECT * FROM blocks WHERE generatorPublicKey=$publicKey ORDER BY timestamp DESC", {
            $publicKey: publicKey
        }, function (err, blocks) {
            if (err) {
                return res.json({ success : false });
            } else {
                app.db.sql.all("SELECT * FROM addresses WHERE generatorPublicKey=$publicKey ORDER BY timestamp DESC", {
                    $publicKey : publicKey
                }, function (err, addresses) {
                    if (err) {
                        return res.json({ success : false });
                    } else {
                        async.forEach(addresses, function (a, cb) {
                            a.mined = 0;
                            a.generator = app.accountprocessor.getAddressByPublicKey(new Buffer(a.generatorPublicKey, 'hex'));
                            a.address = a.id;
                            app.db.sql.get("SELECT SUM(fee) AS s FROM trs WHERE recepient=$recepient", {
                                $recepient : a.address
                            }, function (err, sum) {
                                if (sum.s) {
                                    a.mined = sum / 2;
                                } else {
                                    a.mined = 0;
                                }
                                totalMined += a.mined;
                                cb();
                            });
                        }, function () {
                            async.forEach(blocks, function (b, cb) {
                                totalForged += b.totalFee;
                                b.timestamp += utils.epochTime();
                                cb();
                            }, function () {
                                var unconfirmedAddresses = _.map(app.addressprocessor.unconfirmedAddresses, function (value) { var a =  value.toJSON(); a.mined = 0; return a; });
                                var myAddresses = [];
                                async.forEach(unconfirmedAddresses, function (a, cb) {
                                    if (a.generatorPublicKey == publicKey) {
                                        myAddresses.unshift(a);
                                    }

                                    cb();
                                }, function () {
                                    addresses = addresses.concat(myAddresses);
                                    return res.json({ success : true, blocks : blocks, addresses : addresses, totalMined : totalMined, totalForged : totalForged });
                                });
                            });
                        });
                    }
                });
            }
        });
    });

    app.get('/api/getLastBlocks', function (req, res) {
        app.db.sql.all("SELECT * FROM blocks ORDER BY timestamp DESC LIMIT 20", function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, blocks : [] });
            } else {
                async.forEach(rows, function (item, callback) {
                    item.timestamp += utils.epochTime();
                    item.generator = app.accountprocessor.getAddressByPublicKey(new Buffer(item.generatorPublicKey, 'hex'));

                    app.db.sql.all("SELECT * FROM trs WHERE blockId='" + item.id + "'", function (err, rows) {
                        if (err) {
                            callback(err);
                        } else {
                            item.transactions = rows;

                            async.forEach(item.transactions, function (t, cb) {
                                t.sender = app.accountprocessor.getAddressByPublicKey(new Buffer(t.senderPublicKey, 'hex'));
                                t.timestamp += utils.epochTime();
                                cb();
                            }, function () {
                                app.db.sql.all("SELECT * FROM addresses WHERE blockId='" + item.id + "'", function (err, rows) {
                                    if (err) {
                                        callback(err);
                                    } else {
                                        item.addresses = rows;

                                        async.forEach(item.addresses, function (a, c) {
                                            a.generator = app.accountprocessor.getAddressByPublicKey(new Buffer(a.generatorPublicKey, 'hex'));
                                            a.address = app.accountprocessor.getAddressByPublicKey(new Buffer(a.publicKey, 'hex'));
                                            c();
                                        }, function () {
                                            callback();
                                        });
                                    }
                                });
                            });
                        }
                    });
                }, function (err) {
                    if (err) {
                        app.logger.error(err);
                    }

                    return res.json({ success : true, blocks : rows });
                });
            }
        });
    });

    app.get('/api/lastBlock', function (req, res) {
        var blockId = req.query.blockId || "";

        app.db.sql.all("SELECT * FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=" + blockId + " LIMIT 1) ORDER BY timestamp DESC", function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, blocks : [] });
            } else {
                async.forEach(rows, function (item, callback) {
                    item.timestamp += utils.epochTime();
                    item.generator = app.accountprocessor.getAddressByPublicKey(new Buffer(item.generatorPublicKey, 'hex'));

                    app.db.sql.all("SELECT * FROM trs WHERE blockId='" + item.id + "'", function (err, rows) {
                        if (err) {
                            callback(err);
                        } else {
                            item.transactions = rows;

                            async.forEach(item.transactions, function (t, cb) {
                                t.timestamp += utils.epochTime();
                                t.sender = app.accountprocessor.getAddressByPublicKey(new Buffer(t.senderPublicKey, 'hex'));
                                cb();
                            }, function () {
                                app.db.sql.all("SELECT * FROM addresses WHERE blockId='" + item.id + "'", function (err, rows) {
                                    if (err) {
                                        callback(err);
                                    } else {
                                        item.addresses = rows;

                                        async.forEach(item.addresses, function (a, c) {
                                            a.generator = app.accountprocessor.getAddressByPublicKey(new Buffer(a.generatorPublicKey, 'hex'));
                                            a.address = app.accountprocessor.getAddressByPublicKey(new Buffer(a.publicKey, 'hex'));
                                            c();
                                        }, function () {
                                            callback();
                                        });
                                    }
                                });
                            });


                        }
                    });
                }, function (err) {
                    if (err) {
                        app.logger.error(err);
                    }

                    return res.json({ success : true, blocks : rows });
                });
            }
        });
    });
}