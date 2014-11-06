var sqlite3 = require('sqlite3'),
    path = require('path'),
    async = require('async'),
    _ = require('underscore'),
    ByteBuffer = require('bytebuffer'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

var db = function (path) {
    this.path = path;

    this.queue = [];
    this.blockSavingId = null;

    this.open();
}

util.inherits(db, EventEmitter);

db.prototype.setApp = function (app) {
    this.app = app;
}

db.prototype.open = function () {
    this.sql = new sqlite3.cached.Database(this.path);
}

db.prototype.close = function () {
    this.sql.close();
    this.sql = null;
}

db.prototype.deleteBlock = function (bId, callback) {
    var sql = this.sql;
    sql.serialize(function () {
        sql.beginTransaction(function (err, dbTransaction) {
            dbTransaction.run("DELETE FROM blocks WHERE id=?", bId);
            dbTransaction.run("DELETE FROM trs WHERE blockId=?", bId);
            dbTransaction.run("DELETE FROM companyconfirmations WHERE blockId=?", bId);
            dbTransaction.run("DELETE FROM requests WHERE blockId=?", bId);
            dbTransaction.run("DELETE FROM companies WHERE blockId=?", bId);
            dbTransaction.run("DELETE FROM signatures WHERE blockId=?", bId);

            dbTransaction.commit(function (err) {
                if (err) {
                    dbTransaction.rollback(function () {
                        if (callback) {
                            callback();
                        }
                    }.bind(this));
                } else {
                    if (callback) {
                        callback();
                    }
                }
            }.bind(this));
        }.bind(this));
    }.bind(this));
}

db.prototype.updateNextBlock = function (sql, block, nextBlock, callback) {
    sql.serialize(function () {
        var st = sql.prepare("UPDATE blocks SET nextBlock = $nextBlock WHERE id = $id");
        st.bind({
            $nextBlock : nextBlock,
            $id : block
        });

        st.run(function (err) {
            return callback(err);
        })
    });
}

db.prototype.writeBlock = function (block,  callback) {
    var sql = this.sql,
        updateNextBlock = this.updateNextBlock;

    sql.serialize(function () {
        async.series([
            function (cb) {
                async.eachSeries(block.transactions, function (transaction, c) {
                    sql.serialize(function () {
                        var st = sql.prepare("INSERT INTO trs(id, blockId, type, subtype, timestamp, senderPublicKey, sender, recipientId, amount, fee, signature,signSignature) VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $sender, $recipientId, $amount, $fee, $signature, $signSignature)")
                        st.bind({
                            $id : transaction.getId(),
                            $blockId : block.getId(),
                            $type : transaction.type,
                            $subtype : transaction.subtype,
                            $timestamp : transaction.timestamp,
                            $senderPublicKey : transaction.senderPublicKey,
                            $sender : transaction.sender.substring(0, transaction.sender.length - 1),
                            $recipientId : transaction.recipientId,
                            $amount : transaction.amount,
                            $fee : transaction.fee,
                            $signature : transaction.signature,
                            $signSignature : transaction.signSignature
                        })

                        st.run(function (err) {
                            if (err) {
                                return c(err);
                            } else {
                                if (transaction.type == 2 && transaction.subtype == 0) {
                                    sql.serialize(function () {
                                        st = sql.prepare("INSERT INTO signatures(id, transactionId, timestamp, publicKey, generatorPublicKey, signature, generationSignature) VALUES($id, $transactionId, $timestamp, $publicKey, $generatorPublicKey, $signature, $generationSignature)");
                                        st.bind({
                                            $id : transaction.asset.getId(),
                                            $transactionId : transaction.getId(),
                                            $timestamp : transaction.asset.timestamp,
                                            $publicKey : transaction.asset.generatorPublicKey,
                                            $signature : transaction.asset.signature,
                                            $generationSignature : transaction.asset.generationSignature
                                        });

                                        st.run(function (err) {
                                            return c(err);
                                        });
                                    });
                                } else if (transaction.type == 3 && transaction.subtype == 0) {
                                    sql.serialize(function () {
                                        st = sql.prepare("INSERT INTO companies(id, transactionId, name, description, domain, email, timestamp, generatorPublicKey, signature) VALUES($id, $transactionId, $name, $description, $domain, $email, $timestamp, $generatorPublicKey, $signature)");
                                        st.bind({
                                            $id : transaction.asset.getId(),
                                            $transactionId : transaction.getId(),
                                            $name : transaction.asset.name,
                                            $description : transaction.asset.description,
                                            $email : transaction.asset.email,
                                            $timestamp : transaction.asset.timestamp,
                                            $generatorPublicKey : transaction.asset.generatorPublicKey,
                                            $signature : transaction.asset.signature
                                        });

                                        st.run(function (err) {
                                            return c(err);
                                        });
                                    });
                                } else {
                                    c();
                                }
                            }
                        });
                    });
                }, function (err) {
                    return cb(err);
                });
            },
            function (cb) {
                async.eachSeries(block.requests, function (request, c) {
                    sql.serialize(function () {
                        var st = sql.prepare("INSERT INTO requests(id, blockId, address) VALUES($id, $blockId, $address)");
                        st.bind({
                            $id : request.getId(),
                            $address : request.address.substr(0, request.address.length - 1),
                            $blockId : block.getId()
                        });

                        st.run(function (err) {
                            return c(err);
                        });
                    });
                }, function (err) {
                    cb(err);
                });
            },
            function (cb) {
                async.eachSeries(block.confirmations, function (confirmation, c) {
                    sql.serialize(function () {
                        var st = sql.prepare("INSERT INTO companyconfirmations(id, blockId, companyId, verified, timestamp, signature) VALUES($id, $blockId, $companyId, $verified, $timestamp, $signature)");
                        st.bind({
                            $id : confirmation.getId(),
                            $blockId : block.getId(),
                            $companyId : confirmation.companyId,
                            $verified : confirmation.verified,
                            $timestamp : confirmation.timestamp,
                            $signature : confirmation.signature
                        });

                        st.run(function (err) {
                            return c(err);
                        });
                    });
                }, function (err) {
                    cb(err);
                });
            }
        ], function (err) {
            if (err) {
                return callback(err);
            } else {
                sql.serialize(function () {
                    var st = sql.prepare("INSERT INTO blocks(id, version, timestamp, previousBlock, numberOfRequests, numberOfTransactions, numberOfConfirmations, totalAmount, totalFee, payloadLength, requestsLength, confirmationsLength, payloadHash, generatorPublicKey, generationSignature, blockSignature, height) VALUES($id, $version, $timestamp, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature, $height)");
                    st.bind({
                        $id : block.getId(),
                        $version : block.version,
                        $timestamp : block.timestamp,
                        $previousBlock : block.previousBlock,
                        $numberOfRequests : block.numberOfRequests,
                        $numberOfTransactions : block.numberOfTransactions,
                        $numberOfConfirmations : block.numberOfConfirmations,
                        $totalAmount : block.totalAmount,
                        $totalFee : block.totalFee,
                        $payloadLength : block.payloadLength,
                        $requestsLength : block.requestsLength,
                        $confirmationsLength : block.confirmationsLength,
                        $payloadHash : block.payloadHash,
                        $generatorPublicKey : block.generatorPublicKey,
                        $generationSignature : block.generationSignature,
                        $blockSignature : block.blockSignature,
                        $height : block.height
                    });

                    st.run(function (err) {
                        if (err) {
                            return callback(err);
                        } else {
                            if (block.previousBlock) {
                                updateNextBlock(sql, block.previousBlock, block.getId(), function (err) {
                                    return callback(err);
                                });
                            } else {
                                return callback();
                            }
                        }
                    });
                });
            }
        });
    });
}

db.prototype.deleteFromHeight = function (height, callback) {
    var sql = this.sql,
        deleteBlock = this.deleteBlock;

    sql.serialize(function () {
        var st = sql.prepare("SELECT id FROM blocks WHERE height = $height");
        st.bind({
            $height : height
        });

        st.get(function (err, block) {
            if (err) {
                return callback(err);
            } else {
                deleteBlock(block.id, function (err) {
                    return callback(err);
                });
            }
        });
    });
}

db.prototype.getAssetOfTransaction = function (transactionId, type, subtype, callback) {
    var sql = this.sql;

    sql.serialize(function () {
        var st = null;

        if (type == 2 && subtype == 0) {
            st = sql.prepare("SELECT * FROM signatures WHERE transactionId = $transactionId");
            st.bind({
                $transactionId : transactionId
            });

            st.get(function (err, signature) {
                return callback(err, signature);
            })
        } else if (type == 3 && subtype == 0) {
            st = sql.prepare("SELECT * FROM companies WHERE transactionId = $transactionId");
            st.bind({
                $transactionId : transactionId
            });

            st.get(function (err, company) {
                return callback(err, company);
            });
        } else {
            return callback("Transaction has not asset");
        }
    });
}

db.prototype.getTransactionsOfBlock = function (blockId, callback) {
    var sql = this.sql,
        getAssetOfTransaction = this.getAssetOfTransaction;

    sql.serialize(function () {
        var st = sql.prepare("SELECT * FROM trs WHERE blockId = $blockId");
        st.bind({
            $blockId : blockId
        });

        st.all(function (err, transactions) {
            if (err) {
                return callback(err);
            } else {
                async.eachSeries(transactions, function (transaction, cb) {
                    if (transaction.type != 0) {
                        getAssetOfTransaction(transaction.id, transaction.type, transaction.subtype, function (err, asset) {
                            if (err) {
                                return cb(err);
                            } else {
                                transaction.asset = asset;
                                return cb();
                            }
                        });
                    } else {
                        return cb();
                    }
                }, function (err) {
                    return callback(err);
                });
            }
        });
    });
}

db.prototype.getRequestsOfBlock = function (blockId, callback) {
    var sql = this.sql;

    sql.serialize(function () {
        var st = sql.prepare("SELECt * FROM requests WHERE blockId = $blockId");
        st.bind({
            $blockId : blockId
        });

        st.all(function (err, requests) {
            return callback(err, requests);
        });
    });
}

db.prototype.getConfirmationsOfBlock = function (blockId, callback) {
    var sql = this.sql;

    sql.serialize(function () {
        var st = sql.prepare("SELECT * FROM companyconfirmations WHERE blockId = $blockId");
        st.bind({
            $blockId : blockId
        });

        st.all(function (err, companyconfirmations) {
            return callback(err, companyconfirmations);
        });
    });
}

db.prototype.deleteBlock = function (blockId, callback) {
    var sql = this.sql;

    sql.serialize(function () {
        var st = sql.prepare("DELETE FROM blocks WHERE id = $id");
        st.bind({
            $id : blockId
        });

        st.run(function (err) {
            return callback(err);
        });
    });
}

db.prototype.readBlocks = function (callback) {
    var sql = this.sql;

    sql.serialize(function () {
        sql.all("SELECT * FROM blocks ORDER BY height", function (err, blocks) {
            callback(err, blocks);
        });
    })
}

module.exports.initDb = function (path, app, callback) {
    var d = new db(path);
    d.setApp(app);
    app.db = d;

    d.sql.serialize(function () {
        async.series([
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS blocks (id BIGINT NOT NULL, version INT NOT NULL, timestamp INT NOT NULL, height INT NOT NULL, previousBlock BIGINT, nextBlock BIGINT, numberOfRequests INT NOT NULL, numberOfTransactions INT NOT NULL, numberOfConfirmations INT NOT NULL, totalAmount INTEGER NOT NULL, totalFee INTEGER NOT NULL, payloadLength INT NOT NULL, requestsLength INT NOT NULL, confirmationsLength INT NOT NULL, payloadHash BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, generationSignature BINARY(64) NOT NULL, blockSignature BINARY(64) NOT NULL, FOREIGN KEY (previousBlock) REFERENCES blocks(id), FOREIGN KEY (nextBlock) REFERENCES blocks(id) ON DELETE CASCADE)", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS trs (id BIGINT NOT NULL, blockId BIGINT NOT NULL, type TINYINT NOT NULL, subtype TINYINT NOT NULL, timestamp INT NOT NULL, senderPublicKey BINARY(32) NOT NULL, sender BIGINT NOT NULL, recipientId BIGINT NOT NULL, amount INTEGER NOT NULL, fee INTEGER NOT NULL, signature BINARY(64) NOT NULL, signSignature BINARY(64), FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS requests (id BIGINT NOT NULL, blockId BIGINT NOT NULL, address BIGINT NOT NULL, FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS signatures (id BIGINT NOT NULL, transactionId BIGINT NOT NULL, timestamp INT NOT NULL, publicKey BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, signature BINARY(64) NOT NULL, generationSignature BINARY(64) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companies (id BIGINT NOT NULL, transactionId BIGINT NOT NULL, name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey BINARY(32) NOT NULL, signature BINARY(32) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)", cb)
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companyconfirmations (id BIGINT NOT NULL, blockId BIGINT NOT NULL, companyId BIGINT NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature BINARY(64) NOT NULL, FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)", cb);
            }
        ], function (err) {
            callback(err, d);
        });
    });
}