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

            case 3:
                switch (item.subtype) {
                    case 0:
                        fee = 1000 * Constants.numberLength;
                        break;
                }
            break;
        }

        return fee;
    }

    app.get("/api/getBlock", app.basicAuth, function (req, res) {
        try {
            var blockId = req.query.blockId || "";

            if (blockId.length == 0) {
                return res.json({ success: false, error: "Provide block id", status: "PROVID_BLOCK_ID" });
            }

            app.db.sql.all("SELECT * FROM blocks WHERE id=? LIMIT 1", [blockId], function (err, rows) {
                if (err) {
                    app.logger.error(err);
                    return res.json({ success: false, success: false, error: "Sql error", status: "SQL_ERROR" });
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
                                    callback();
                                });
                            }
                        });
                    }, function (err) {
                        if (err) {
                            app.logger.error(err);
                            return res.json({ success: false, status: "SQL_ERROR", error: "Sql error" });
                        }

                        return res.json({ success: true, blocks: rows, status: "OK" });
                    });
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get("/api/getTransaction", app.basicAuth, function (req, res) {
        try {
            var transactionId = req.query.transactionId || "";

            if (transactionId.length == 0) {
                return res.json({ success: false, error: "Provide transaction id", status: "PROVIDE_TRANSACTION_ID" });
            }

            app.db.sql.get("SELECT * FROM trs WHERE id=? LIMIT 1", [transactionId], function (err, t) {
                if (err) {
                    return res.json({ success: false, status: "SQL_ERROR", error: "Sql error"});
                } else {
                    if (t) {
                        var blockId = t.blockId;
                        t.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                        t.sender = app.accountprocessor.getAddressByPublicKey(new Buffer(t.senderPublicKey, 'hex'));
                        t.timestamp += utils.epochTime();
                        t.confirmed = true;

                        return res.json({ success: true, transaction: t, status: "OK" });
                    } else {
                        t = app.transactionprocessor.unconfirmedTransactions[transactionId];

                        if (t) {
                            t.sender = app.accountprocessor.getAddressByPublicKey(t.senderPublicKey);
                            t = t.toJSON();
                            t.timestamp += utils.epochTime();
                            t.confirmed = false;
                            t.fee = getFee(t);

                            return res.json({ success: true, status: "OK", transaction: t});
                        } else {
                            return res.json({ success: false, status: "TRANSACTION_NOT_FOUND", error: "Transaction not found" })
                        }
                    }
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get("/api/getTransactionBlock", app.basicAuth, function (req, res) {
        try {
            var transactionId = req.query.transactionId || "";

            if (transactionId.length == 0) {
                return res.json({ success: false, error: "Provide transaction id", status: "Provide transaction id" });
            }

            app.db.sql.get("SELECT * FROM trs WHERE id=? LIMIT 1", [transactionId], function (err, t) {
                if (err) {
                    return res.json({ success: false, status: "SQL_ERROR", error: "Sql error"});
                } else {
                    if (t) {
                        var blockId = t.blockId;

                        return res.json({ success: true, status: "OK", blockId: blockId });
                    } else {
                        return res.json({ success: false, status: "TRANSACTION_NOT_FOUND", error: "Transaction not found" });
                    }
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get("/api/getTransactionConfirmations", app.basicAuth, function (req, res) {
        try {
            var transactionId = req.query.transactionId || "";

            if (transactionId.length == 0) {
                return res.json({ success: false, error: "Provide transaction id", status: "Provide transaction id" });
            }

            app.db.sql.get("SELECT * FROM trs WHERE id=? LIMIT 1", [transactionId], function (err, t) {
                if (err) {
                    return res.json({ success: false, status: "SQL_ERROR", error: "Sql error"});
                } else {
                    if (t) {
                        var blockId = t.blockId;
                        var confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height;
                        return res.json({ success: true, confirmations: confirmations, status: "OK" });
                    } else {
                        return res.json({ success: false, status: "TRANSACTION_NOT_FOUND", error: "Transaction not found" });
                    }
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get('/api/getAddressTransactions', app.basicAuth, function (req, res) {
        try {
            var accountId = req.query.address || 20,
                limit = req.query.limit || "",
                desc = req.query.descOrder || "";

            var account = app.accountprocessor.getAccountById(accountId);
            if (!account) {
                return res.json({ success: false, transactions: [], statusCode: "ACCOUNT_NOT_FOUND" });
            }

            limit = parseInt(limit);

            if (isNaN(limit)) {
                limit = 100;
            } else if (limit <= 0) {
                return res.json({ success: false, status: "INVALID_LIMIT", error: "Invalid limit" });
            }

            if (desc == "true") {
                desc = "DESC";
            } else {
                desc = "ASC";
            }

            var addresses = _.map(app.companyprocessor.addresses, function (v, k) {
                v.address = k;
                return v;
            });

            var a = [];
            addresses = _.filter(addresses, function (v) {
                if (app.accountprocessor.getAddressByPublicKey(v.generatorPublicKey) == accountId) {
                    a.push(v.address);
                    return true;
                }
            });


            var q = app.db.sql.prepare("SELECT * FROM trs WHERE (recipient=$accountId OR sender=$accountId OR recipient IN " + JSON.stringify(a).replace('[', '(').replace(']', ')') + ") ORDER BY timestamp " + desc + " LIMIT " + limit);
            q.bind({
                $accountId: accountId
            });
            q.all(function (err, rows) {
                if (err) {
                    app.logger.error(err);
                    return res.json({ success: false, error: "Sql error, see logs for more info", statusCode: "SQL_ERROR" });
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
                            item.confirmations = app.blockchain.getLastBlock().height - app.blockchain.blocks[blockId].height + 1;
                            item.sender = app.accountprocessor.getAddressByPublicKey(new Buffer(item.senderPublicKey, 'hex'));
                            item.timestamp += utils.epochTime();
                            item.confirmed = true;

                            transactions.push(item);
                            cb();
                        }
                    }, function () {
                        var unconfirmedTransactions = _.map(app.transactionprocessor.unconfirmedTransactions, function (v) {
                            return _.extend({}, v);
                        });

                        async.eachSeries(unconfirmedTransactions, function (item, с) {
                            item.sender = app.accountprocessor.getAddressByPublicKey(item.senderPublicKey);
                            if (item.recipientId == accountId || item.sender == accountId || a.indexOf(item.recipientId) >= 0) {
                                item.timestamp += utils.epochTime();
                                item.confirmations = "-";
                                item.recipient = item.recipientId;
                                item.confirmed = false;
                                item.fee = getFee(item);

                                transactions.unshift(item.toJSON());
                            }

                            с();
                        }, function () {
                            return res.json({ success: true, statusCode: "OK", transactions: transactions });
                        });
                    });
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get("/api/getReceivedTransactionsByAddress", app.basicAuth, function (req, res) {
        try {
            var accountId = req.query.address || "";
            var q = app.db.sql.prepare("SELECT * FROM trs WHERE recipient = ? ORDER BY timestamp");
            q.bind(accountId);
            q.all(function (err, rows) {
                if (err) {
                    app.logger.error(err);
                    return res.json({ success: false, error: "Sql error", status: "SQL_ERROR" });
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
                            return res.json({ success: true, transactions: transactions, status: "OK" });
                        });
                    });
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get("/api/getSentTransactionsByAddress", app.basicAuth, function (req, res) {
        try {
            var accountId = req.query.address || "";

            var account = app.accountprocessor.getAccountById(accountId);
            if (!account) {
                return res.json({ success: false, error: "Account not found", status: "ACCOUNT_NOT_FOUND" });
            }

            var sender = account.address;

            var q = app.db.sql.prepare("SELECT * FROM trs WHERE sender = ? ORDER BY timestamp");
            q.bind(sender);
            q.all(function (err, rows) {
                if (err) {
                    app.logger.error(err);
                    return res.json({ success: false, error: "Sql error", status: "SQL_ERROR" });
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
                            return res.json({ success: true, transactions: transactions, status: "OK" });
                        });
                    });
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get('/api/getMiningInfo', app.basicAuth, function (req, res) {
        try {
            var publicKey = new Buffer(req.query.publicKey, 'hex') || "",
                limit = req.query.limit || 20,
                descOrder = req.query.descOrder;

            limit = parseInt(limit);

            if (isNaN(limit) || limit <= 0) {
                return res.json({ success: false, status: "PROVIDE_LIMIT", error: "Provide correct limit" });
            }

            if (publicKey.length == 0) {
                return res.json({ success: false, status: "PROVIDE_PUBLIC_KEY", error: "Provide public key" });
            }

            var order = "";

            if (descOrder == "true") {
                order = "DESC";
            } else {
                order = "ASC";
            }

            var address = app.accountprocessor.getAddressByPublicKey(publicKey);

            var forging = false;
            if (app.forgerprocessor.getForgers(address)) {
                forging = true;
            }

            var totalForged = 0;

            app.db.sql.all("SELECT * FROM blocks WHERE generatorPublicKey=$publicKey ORDER BY timestamp " + order, {
                $publicKey: publicKey
            }, function (err, blocks) {
                if (err) {
                    return res.json({ success: false });
                } else {
                    async.eachSeries(blocks, function (b, cb) {
                        app.db.sql.all("SELECT * FROM trs WHERE blockId=$blockId", { $blockId: b.id }, function (err, trs) {
                            if (err) {
                                return cb(err);
                            } else {
                                async.eachSeries(trs, function (t, tcb) {
                                    if (t.type == 1 && t.subtype == 0) {
                                        if (t.fee >= 2) {
                                            if (t.fee % 2 != 0) {
                                                var r = parseInt(t.fee / 2);
                                                totalForged += t.fee - r;
                                            } else {
                                                totalForged += t.fee / 2;
                                            }
                                        } else {
                                            totalForged += t.fee;
                                        }
                                    } else if (t.type == 3 && t.subtype == 0) {
                                        totalForged += 100 * Constants.numberLength;
                                    } else {
                                        totalForged += t.fee;
                                    }

                                    tcb();
                                }, function () {
                                    app.db.sql.all("SELECT * FROM companyconfirmations WHERE blockId=$blockId", { $blockId: b.id }, function (err, cms) {
                                        if (err) {
                                            return cb(err);
                                        } else {
                                            totalForged += cms.length * 100 * Constants.numberLength;
                                            cb();
                                        }
                                    });
                                });
                            }
                        });
                    }, function (err) {
                        if (err) {
                            return res.json({ success: false, status: "SQL_ERROR", error: "Sql error" });
                        }

                        var addresses = _.map(app.companyprocessor.addresses, function (v, k) {
                            v = v.toJSON();
                            v.address = k;
                            v.confirmed = true;
                            return v;
                        });

                        addresses = _.filter(addresses, function (v) {
                            if (v.generatorPublicKey.toString('hex') == publicKey.toString('hex')) {
                                return true;
                            }
                        });

                        async.eachSeries(addresses, function (a, cb) {
                            app.db.sql.all("SELECT * FROM trs WHERE recipient = $recipient", {
                                $recipient: a.address
                            }, function (err, trs) {
                                if (err) {
                                    return cb(err);
                                } else {
                                    async.eachSeries(trs, function (t, tcb) {
                                        if (t.fee >= 2) {
                                            if (t.fee % 2 != 0) {
                                                var r = t.fee % 2;
                                                totalForged += t.fee / 2 - r;
                                            } else {
                                                totalForged += t.fee / 2;
                                            }
                                        }

                                        tcb();
                                    }, function () {
                                        cb();
                                    });
                                }
                            });
                        }, function (err) {
                            if (err) {
                                return res.json({ success: false, status: "SQL_ERROR", error: "Sql error" });
                            }

                            var unconfirmedCompanies = _.map(app.companyprocessor.unconfirmedCompanies, function (v, k) {
                                v = v.toJSON();
                                v.confirmed = false;
                                v.confirmations = 0;
                                return v;
                            });

                            unconfirmedCompanies = _.filter(unconfirmedCompanies, function (v) {
                                if (v.generatorPublicKey.toString('hex') == publicKey.toString('hex')) {
                                    return true;
                                }
                            });

                            if (!unconfirmedCompanies) {
                                unconfirmedCompanies = [];
                            }

                            var addedCompanies = _.map(app.companyprocessor.addedCompanies, function (v, k) {
                                v = v.toJSON();
                                v.confirmations = app.companyprocessor.confirmations[v.domain];
                                v.blocksConfirmations = v.blocks;
                                v.confirmed = true;
                                return v;
                            });

                            addedCompanies = _.filter(addedCompanies, function (v) {
                                if (v.generatorPublicKey.toString('hex') == publicKey.toString('hex')) {
                                    return true;
                                }
                            });

                            if (!addedCompanies) {
                                addedCompanies = [];
                            }

                            if (!addresses) {
                                addresses = [];
                            }

                            var dels = [];
                            async.eachSeries(app.companyprocessor.deletedCompanies, function (i, cb) {
                                if (i.generatorPublicKey.toString('hex') == publicKey.toString('hex')) {
                                    i.deleted = true;
                                    dels.push(i.toJSON());
                                }

                                cb();
                            }, function () {
                                addresses = dels.concat(addresses);
                                addresses = addresses.concat(addedCompanies);
                                addresses = addresses.concat(unconfirmedCompanies);

                                addresses.sort(function (a, b) {
                                    return a.timestamp < b.timestamp;
                                });

                                blocks = blocks.slice(0, limit);
                                return res.json({ success: true, forging: forging, status: "OK", totalForged: totalForged, blocks: blocks, companies: addresses });
                            });
                        })
                    });
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get('/api/getNextBlocks', app.basicAuth, function (req, res) {
        try {
            var blockId = req.query.blockId || "",
                limit = req.query.limit || 20;

            limit = parseInt(limit);

            if (isNaN(limit)) {
                limit = 20;
            } else if (limit <= 0) {
                return res.json({ success: false, error: "Limit is invalid", status: "INVALID_LIMIT" });
            }

            if (blockId.length == 0) {
                return res.json({ success: false, error: "Provide block id", status: "PROVIDE_BLOCK_ID" });
            }

            var r = app.db.sql.prepare("SELECT * FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=$id LIMIT 1) ORDER BY height LIMIT " + limit);
            r.bind({
                $id: blockId
            });

            r.all(function (err, blocks) {
                if (err) {
                    app.logger.error("Sqlite error: " + err);
                    return res.json({ success: false, error: "SQL error", status: "SQL_ERROR" });
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
                                                $transactionId: t.id
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
                                    app.db.sql.all("SELECT * FROM requests WHERE blockId=$id", {
                                        $id: item.id
                                    }, function (err, requests) {
                                        if (err) {
                                            cb(err);
                                        } else {
                                            item.requests = requests;
                                            cb();
                                        }
                                    });
                                });
                            }
                        });
                    }, function (err) {
                        if (err) {
                            app.logger.error("SQL error");
                            return res.json({ success: false, error: "Sql error", status: "SQL_ERROR" });
                        } else {
                            return res.json({ success: true, blocks: blocks, status: "OK" });
                        }
                    });
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get('/api/getLastBlocks', app.basicAuth, function (req, res) {
        try {
            var limit = req.query.limit || 20,
                orderDesc = req.query.orderDesc || false;

            limit = parseInt(limit);

            if (isNaN(limit)) {
                limit = 20;
            } else if (limit <= 0) {
                return res.json({ success: false, error: "Limit is invalid", status: "INVALID_LIMIT" });
            }

            var order = null;
            if (orderDesc == "true") {
                order = "DESC";
            } else {
                order = "ASC";
            }

            app.db.sql.all("SELECT * FROM blocks ORDER BY timestamp " + order + "  LIMIT " + limit, function (err, rows) {
                if (err) {
                    app.logger.error(err.toString());
                    return res.json({ success: false, blocks: [], status: "SQL_ERROR", error: "Sql error" });
                } else {
                    async.forEach(rows, function (item, callback) {
                        item.timestamp += utils.epochTime();
                        item.generator = app.accountprocessor.getAddressByPublicKey(new Buffer(item.generatorPublicKey, 'hex'))

                        app.db.sql.all("SELECT * FROM trs WHERE blockId='" + item.id + "'", function (err, rows) {
                            if (err) {
                                callback(err);
                            } else {
                                item.transactions = rows;
                                callback();
                            }
                        });
                    }, function (err) {
                        if (err) {
                            app.logger.error(err);
                            return res.json({ success: false, blocks: [], error: "Sql error", status: "SQL_ERROR" });
                        }

                        return res.json({ success: true, blocks: rows, status: "OK" });
                    });
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get('/api/lastBlock', app.basicAuth, function (req, res) {
        try {
            app.db.sql.all("SELECT * FROM blocks ORDER BY height DESC LIMIT 1", function (err, rows) {
                if (err) {
                    app.logger.error(err);
                    return res.json({ success: false, success: false, error: "Sql error", status: "SQL_ERROR" });
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
                                    callback();
                                });
                            }
                        });
                    }, function (err) {
                        if (err) {
                            app.logger.error(err);
                            return res.json({ success: false, status: "SQL_ERROR", error: "Sql error" });
                        }

                        return res.json({ success: true, blocks: rows, status: "OK" });
                    });
                }
            });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });
}