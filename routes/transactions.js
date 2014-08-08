var async = require('async'),
    Constants = require ('../Constants'),
    _ = require('underscore'),
    utils = require('../utils.js');

module.exports = function (app) {
    var getFee = function (item) {
        var fee = 0;
        switch (item.type) {
            case 0:
            case 1:
                switch (item.subtype) {
                    case 0:
                        fee = parseInt(item.amount / 100 * app.blockchain.fee);

                        if (fee == 0) {
                            fee = 1;
                        }
                        break;
                }
                break;

            case 2:
                switch (item.subtype) {
                    case 0:
                        fee = 100 * Constants.numberLength;
                        break;
                }
                break;
        }

        return fee;
    }

    app.get("/api/getBlock", function (req, res) {
        var blockId = req.query.blockId || "";

        if (blockId.length == 0) {
            return res.json({ success : false, error : "Provide block id", status : "PROVID_BLOCK_ID" });
        }

        app.db.sql.all("SELECT * FROM blocks WHERE id=? LIMIT 1", [blockId], function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, success : false, error : "Sql error", status : "SQL_ERROR" });
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
                        return res.json({ success : false, status : "SQL_ERROR", error : "Sql error" });
                    }

                    return res.json({ success : true, blocks : rows, status : "OK" });
                });
            }
        });
    });

    app.get("/api/getTransaction", function (req, res) {
        var transactionId = req.query.transactionId || "";

        if (transactionId.length == 0) {
            return res.json({ success : false, error : "Provide transaction id", status : "Provide transaction id" });
        }

        app.db.sql.get("SELECT * FROM trs WHERE id=? LIMIT 1", [transactionId], function (err, t) {
            if (err) {
                return res.json({ success : false, status : "SQL_ERROR", error : "Sql error"});
            } else {
                if (t) {
                    var blockId = t.blockId;
                    t.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                    t.sender = app.accountprocessor.getAddressByPublicKey(new Buffer(е.senderPublicKey, 'hex'));
                    t.timestamp += utils.epochTime();
                    t.confirmed = true;

                    return res.json({ success : true, transaction : t, status : "OK" });
                } else {
                    t = app.transactionprocessor.unconfirmedTransactions[transactionId];

                    if (t) {
                        t.sender = app.accountprocessor.getAddressByPublicKey(t.senderPublicKey);
                        t = t.toJSON();
                        t.timestamp += utils.epochTime();
                        t.confirmed = false;
                        t.fee = getFee(t);

                        return res.json({ success : true, status : "OK", transaction : t});
                    } else {
                        return res.json({ success : false, status : "TRANSACTION_NOT_FOUND", error : "Transaction not found" })
                    }
                }
            }
        });
    });

    app.get("/api/getTransactionBlock", function (req, res) {
        var transactionId = req.query.transactionId || "";

        if (transactionId.length == 0) {
            return res.json({ success : false, error : "Provide transaction id", status : "Provide transaction id" });
        }

        app.db.sql.get("SELECT * FROM trs WHERE id=? LIMIT 1", [transactionId], function (err, t) {
            if (err) {
                return res.json({ success: false, status: "SQL_ERROR", error: "Sql error"});
            } else {
                if (t) {
                    var blockId = t.blockId;

                    return res.json({ success : true, status : "OK", blockId : blockId });
                } else {
                    return res.json({ success : false, status : "TRANSACTION_NOT_FOUND", status : "OK" });
                }
            }
        });
    });

    app.get("/api/getTransactionConfirmations", function (req, res) {
        var transactionId = req.query.transactionId || "";

        if (transactionId.length == 0) {
            return res.json({ success : false, error : "Provide transaction id", status : "Provide transaction id" });
        }

        app.db.sql.get("SELECT * FROM trs WHERE id=? LIMIT 1", [transactionId], function (err, t) {
            if (err) {
                return res.json({ success : false, status : "SQL_ERROR", error : "Sql error"});
            } else {
                if (t) {
                    var blockId = t.blockId;
                    var confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                    return res.json({ success : true, confirmations : confirmations, status : "OK" });
                } else {
                    return res.json({ success : false, status : "TRANSACTION_NOT_FOUND", error : "Transaction not found" });
                }
            }
        });
    });

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

    app.get('/api/getAddressTransactions', function (req, res) {
        var accountId = req.query.address || 20,
            limit = req.query.limit || "",
            desc = req.query.descOrder || "";

        var account = app.accountprocessor.getAccountById(accountId);
        if (!account) {
            return res.json({ success : false, transactions: [], statusCode : "ACCOUNT_NOT_FOUND" });
        }

        limit = parseInt(limit);

        if (isNaN(limit)) {
            limit = 100;
        } else if (limit <= 0) {
            return res.json({ success : false, status : "INVALID_LIMIT", error : "Invalid limit" });
        }

        if (desc == "true") {
            desc = "DESC";
        } else {
            desc = "ASC";
        }

        var q = app.db.sql.prepare("SELECT * FROM trs WHERE (recipient=$accountId OR sender=$accountId) ORDER BY timestamp "  + desc + " LIMIT " + limit);
        q.bind({
            $accountId : accountId
        });
        q.all(function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, error : "Sql error, see logs for more info", statusCode : "SQL_ERROR" });
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
                        item.confirmed = true;

                        transactions.push(item);
                        cb();
                    }
                }, function () {
                    var unconfirmedTransactions = _.map(app.transactionprocessor.unconfirmedTransactions, function (v) { return _.extend({}, v) });
                    async.eachSeries(unconfirmedTransactions, function (item, с) {
                        item.sender = app.accountprocessor.getAddressByPublicKey(item.senderPublicKey);
                        if (item.recipientId == accountId || item.sender ==  accountId) {
                            item.timestamp += utils.epochTime();
                            item.confirmations = "-";
                            item.recipient = item.recipientId;
                            item.confirmed = false;
                            item.fee = getFee(item);

                            transactions.unshift(item.toJSON());
                        }

                        с();
                    }, function () {
                        return res.json({ success : true, statusCode : "OK", transactions : transactions });
                    });
                });
            }
        });
    });

    app.get("/api/getReceivedTransactionsByAddress", function (req, res) {
        var accountId = req.query.address || "";
        var q = app.db.sql.prepare("SELECT * FROM trs WHERE recipient = ? ORDER BY timestamp");
        q.bind(accountId);
        q.run(function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, error : "Sql error", status : "SQL_ERROR" });
            } else {
                var transactions = rows;
                var unconfirmedTransactions = [];
                async.forEach(transactions, function (item, cb) {
                    var blockId = item.blockId;
                    item.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                    item.confirmed = true;

                    cb();
                }, function () {
                    async.forEach(app.transactionprocessor.unconfirmedTransactions, function (item, cb) {
                        if (item.recipientId == accountId) {
                            item.confirmed = false;
                            item.timestamp += utils.epochTime();
                            item.sender = app.accountprocessor.getAddressByPublicKey(item.senderPublicKey);
                            item.fee = getFee(item);

                            unconfirmedTransactions.push(item.toJSON());

                            cb();
                        }
                    }, function () {
                        transactions = transactions.concat(unconfirmedTransactions);
                        return res.json({ success : true, transactions : transactions, status : "OK" });
                    });
                });
            }
        });
    });

    app.get("/api/getSentTransactionsByAddress", function (req, res) {
        var accountId = req.query.address || "";

        var account = app.accountprocessor.getAccountById(accountId);
        if (!account) {
            return res.json({ success : false, error : "Account not found", status : "ACCOUNT_NOT_FOUND" });
        }

        var sender = account.address;

        var q = app.db.sql.prepare("SELECT * FROM trs WHERE sender = ? ORDER BY timestamp");
        q.bind(sender);
        q.run(function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, error : "Sql error", status : "SQL_ERROR" });
            } else {
                var transactions = rows;
                var unconfirmedTransactions = [];
                async.forEach(transactions, function (item, cb) {
                    var blockId = item.blockId;
                    item.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                    item.confirmed = true;
                    cb();
                }, function () {
                    async.forEach(app.transactionprocessor.unconfirmedTransactions, function (item, cb) {
                        item.sender = app.accountprocessor.getAddressByPublicKey(item.senderPublicKey);
                        if (item.sender == sender) {
                            item.timestamp += utils.epochTime();
                            item.confirmed = false;
                            item.fee = getFee(item);

                            unconfirmedTransactions.push(item.toJSON());
                            cb();
                        }
                    }, function () {
                        transactions = transactions.concat(unconfirmedTransactions);
                        return res.json({ success : true, transactions : transactions, status : "OK" });
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
        var q = app.db.sql.prepare("SELECT * FROM trs WHERE recipient = ?");
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
                async.eachSeries(blocks, function (item, cb) {
                    app.db.sql.all("SELECT * FROM trs WHERE blockId=$blockId", {
                        $blockId: item.id
                    }, function (err, trs) {
                        item.forged = 0;

                        async.eachSeries(trs, function (t, c) {
                            if (t.type == 1) {
                                if (t.fee >= 2) {
                                    if (t.fee % 2 != 0) {
                                        var r = t.fee % 2;
                                        item.forged += t.fee / 2 + r;
                                    } else {
                                        item.forged += t.fee / 2;
                                    }
                                } else {
                                    item.forged += t.fee;
                                }
                            } else if (t.type == 0) {
                                item.forged += t.fee;
                            }

                            c();
                        }, function () {
                            cb();
                        });
                    });
                }, function () {
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
                                app.db.sql.all("SELECT * FROM trs WHERE recipient=$recipient", {
                                    $recipient : a.address
                                }, function (err, trs) {
                                    async.eachSeries(trs, function (t, c) {
                                        if (t.fee >= 2) {
                                            if (t.fee % 2 != 0) {
                                                var r = t.fee % 2;
                                                a.mined = t.fee / 2 - r;
                                                totalMined += a.mined;
                                            } else {
                                                a.mined = t.fee / 2;
                                                totalMined += a.mined;
                                            }
                                        }

                                        c();
                                    }, function () {
                                        cb();
                                    })

                                    //totalMined += a.mined;
                                    //cb();
                                });
                            }, function () {
                                async.forEach(blocks, function (b, cb) {
                                    totalForged += b.forged;
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
                });
            }
        });
    });

    app.get('/api/getNextBlocks', function (req, res) {
        var blockId = req.query.blockId || "",
            limit = req.query.limit || 20;

        limit = parseInt(limit);

        if (isNaN(limit)) {
            limit = 20;
        } else if (limit <= 0) {
            return res.json({ success : false, error : "Limit is invalid", status : "INVALID_LIMIT" });
        }

        if (blockId.length == 0) {
            return res.json({ success : false, error : "Provide block id", status : "PROVIDE_BLOCK_ID" });
        }

        var r = app.db.sql.prepare("SELECT * FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=$id LIMIT 1) ORDER BY height LIMIT " + limit);
        r.bind({
            $id: blockId
        });

        r.all(function (err, blocks) {
            if (err) {
                app.logger.error("Sqlite error: " + err);
                return res.json({ success : false, error : "SQL error", status : "SQL_ERROR" });
            } else {
                async.eachSeries(blocks, function (item, cb) {
                    app.db.sql.all("SELECT * FROM trs WHERE blockId=$id", {
                        $id: item.id
                    }, function (err, trs) {
                        if (err) {
                            cb(err);
                        } else {
                            async.forEach(trs, function (t, cb) {
                                if (t.type == 2) {
                                    if (t.subtype == 0) {
                                        app.db.sql.get("SELECT * FROM signatures WHERE transactionId=$transactionId", {
                                            $transactionId : t.id
                                        }, function (err, asset) {
                                            if (err) {
                                                cb(err);
                                            } else {
                                                trs.asset = asset;
                                                cb();
                                            }
                                        });
                                    }
                                } else {
                                    cb();
                                }
                            }, function (err) {
                                if (err) {
                                    return cb(err);
                                }

                                item.trs = trs;
                                app.db.sql.all("SELECT * FROM addresses WHERE blockId=$id", {
                                    $id : item.id
                                }, function (err, addresses) {
                                    if (err) {
                                        cb(err);
                                    } else {
                                        item.addresses = addresses;
                                        app.db.sql.all("SELECT * FROM requests WHERE blockId=$id", {
                                            $id : item.id
                                        }, function (err, requests) {
                                            if (err) {
                                                cb(err);
                                            }  else {
                                                item.requests = requests;
                                                cb();
                                            }
                                        });
                                    }
                                });
                            });
                        }
                    });
                }, function (err) {
                    if (err) {
                        app.logger.error("SQL error");
                    return res.json({ success : false, error : "Sql error", status : "SQL_ERROR" });
                    } else {
                        return res.json({ success : true, blocks : blocks, status : "OK" });
                    }
                });
            }
        })
    });

    app.get('/api/getLastBlocks', function (req, res) {
        var limit = req.query.limit || 20,
            orderDesc = req.query.orderDesc || false;

        limit = parseInt(limit);

        if (isNaN(limit)) {
            limit = 20;
        } else if (limit <= 0) {
            return res.json({ success : false, error : "Limit is invalid", status : "INVALID_LIMIT" });
        }

        var order = null;
        if (orderDesc == "true") {
            order = "DESC";
         }  else {
            order = "ASC";
        }

        app.db.sql.all("SELECT * FROM blocks ORDER BY timestamp " + order + "  LIMIT " + limit, function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, blocks : [], status : "SQL_ERROR", error : "Sql error" });
            } else {
                async.forEach(rows, function (item, callback) {
                    item.timestamp += utils.epochTime();
                    item.generator = app.accountprocessor.getAddressByPublicKey(new Buffer(item.generatorPublicKey, 'hex'))

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
                        return res.json({ success : false, blocks : [], error : "Sql error", status : "SQL_ERROR" });
                    }

                    return res.json({ success : true, blocks : rows, status : "OK" });
                });
            }
        });
    });

    app.get('/api/lastBlock', function (req, res) {
        app.db.sql.all("SELECT * FROM blocks ORDER BY height DESC LIMIT 1", function (err, rows) {
            if (err) {
                app.logger.error(err);
                return res.json({ success : false, success : false, error : "Sql error", status : "SQL_ERROR" });
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
                        return res.json({ success : false, status : "SQL_ERROR", error : "Sql error" });
                    }

                    return res.json({ success : true, blocks : rows, status : "OK" });
                });
            }
        });
    });
}