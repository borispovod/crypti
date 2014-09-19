var sqlite3 = require('sqlite3'),
    path = require('path'),
    async = require('async'),
    transactionDatabase = require("sqlite3-transactions").TransactionDatabase,
    _ = require('underscore'),
    ByteBuffer = require('bytebuffer'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

var db = function (path) {
    this.path = path;

    this.queue = [];
    this.blockSavingId = null;

    this.open();

    this.on("newBlock", function () {
        if (this.blockSavingId) {
            return;
        }

        if (this.queue.length == 0) {
            return;
        }

        this.blockSavingId = this.queue.shift();
        var block = this.app.blockchain.blocks[this.blockSavingId];

        this._writeBlock(block, function (err) {
            if (err) {
                this.app.logger.error(err.toString());
            } else {
                this.blockSavingId = null;

                if (this.queue.length > 0) {
                    this.emit("newBlock");
                } else {
                    this.emit("blockchainLoaded");
                }
            }
        }.bind(this));
    }.bind(this));
}

util.inherits(db, EventEmitter);

db.prototype.setApp = function (app) {
    this.app = app;
}

db.prototype.open = function () {
    this.sql = new transactionDatabase(
        new sqlite3.cached.Database(this.path)
    );
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

db.prototype.writeTransaction = function (t, cb) {
    this.sql.serialize(function () {
        var signSignature = t.signSignature;

        if (signSignature) {
            signSignature = t.signSignature;
        }

        var q = this.sql.prepare("INSERT INTO trs VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $sender, $recipient, $amount, $fee, $signature, $signSignature)");
        q.bind({
            $id: t.getId(),
            $blockId: t.blockId,
            $type: t.type,
            $subtype: t.subtype,
            $timestamp: t.timestamp,
            $senderPublicKey: t.senderPublicKey,
            $recipient: t.recipientId,
            $amount: t.amount,
            $signature: t.signature,
            $signSignature : signSignature,
            $sender : t.sender,
            $fee : t.fee
        });

        q.run(function (err) {
            if (cb) {
                cb(err);
            }
        });
    }.bind(this));
}

db.prototype.writeBlock = function (blockId, cb) {
    this.queue.push(blockId);
    this.emit("newBlock");

    if (cb) {
        cb();
    }
}

db.prototype._writeBlock = function (block,  callback) {
    try {
        var sql = this.sql;
        sql.serialize(function () {
            sql.beginTransaction(function (err, dbTransaction) {
                if (err) {
                    if (callback) {
                        return callback(err);
                    }
                } else {
                    var trsIds = [],
                        requestsIds = [],
                        companyconfirmationsIds = [];

                    async.parallel([
                        function (cb) {
                            if (!block.transactions) {
                                return cb();
                            }

                            async.eachSeries(block.transactions, function (t, c) {
                                var q = dbTransaction.prepare("INSERT INTO trs VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $sender, $recipient, $amount, $fee, $signature, null, $signSignature)");
                                q.bind({
                                    $id: t.getId(),
                                    $blockId: t.blockId,
                                    $type: t.type,
                                    $subtype: t.subtype,
                                    $timestamp: t.timestamp,
                                    $senderPublicKey: t.senderPublicKey,
                                    $recipient: t.recipientId,
                                    $amount: t.amount,
                                    $signature: t.signature,
                                    $signSignature: t.signSignature,
                                    $sender: t.sender,
                                    $fee: t.fee
                                });

                                q.run(function (err) {
                                    if (err) {
                                        return c(err);
                                    }

                                    trsIds.push(this.lastID);
                                    var trId = this.lastID;

                                    if (t.type == 2 && t.subtype == 0) {
                                        q = dbTransaction.prepare("INSERT INTO signatures (id, blockId, transactionId, timestamp, publicKey, generatorPublicKey, signature, generationSignature) VALUES ($id, $blockId, $transactionId, $timestamp, $publicKey, $generatorPublicKey, $signature, $generationSignature)");

                                        q.bind({
                                            $id: t.asset.getId(),
                                            $blockId: t.asset.blockId,
                                            $transactionId: t.asset.transactionId,
                                            $timestamp: t.asset.timestamp,
                                            $publicKey: t.asset.publicKey,
                                            $generatorPublicKey: t.asset.generatorPublicKey,
                                            $signature: t.asset.signature,
                                            $generationSignature: t.asset.generationSignature
                                        });

                                        q.run(function (err) {
                                            if (err) {
                                                return c(err);
                                            }

                                            var assetId = this.lastID;
                                            q = dbTransaction.prepare("UPDATE trs SET assetId = $assetId WHERE rowid=$rowid");
                                            q.bind({
                                                $rowid : trId,
                                                $assetId : assetId
                                            });

                                            q.run(function (err) {
                                                return c(err);
                                            });
                                        });
                                    } else if (t.type == 3 && t.subtype == 0) {
                                        var data = {
                                            $id: t.asset.getId(),
                                            $blockId: t.asset.blockId,
                                            $transactionId: t.asset.transactionId,
                                            $name: t.asset.name,
                                            $description: t.asset.description || "",
                                            $domain: t.asset.domain,
                                            $email: t.asset.email,
                                            $timestamp: t.asset.timestamp,
                                            $generatorPublicKey: t.asset.generatorPublicKey,
                                            $signature: t.asset.signature
                                        };

                                        q = dbTransaction.prepare("INSERT INTO companies (id, blockId, transactionId, name, description, domain, email, timestamp, generatorPublicKey, signature) VALUES ($id, $blockId, $transactionId, $name, $description, $domain, $email, $timestamp, $generatorPublicKey, $signature)");
                                        q.bind(data);
                                        q.run(function (err) {
                                            if (err) {
                                                return c(err);
                                            }

                                            var assetId = this.lastID;
                                            q = dbTransaction.prepare("UPDATE trs SET assetId = $assetId WHERE rowid=$rowid");
                                            q.bind({
                                                $rowid : trId,
                                                $assetId : assetId
                                            });

                                            q.run(function (err) {
                                                return c(err);
                                            });
                                        });
                                    } else {
                                        return c();
                                    }
                                });
                            }, function (err) {
                                cb(err);
                            });
                        },
                        function (cb) {
                            var requests = _.map(block.requests, function (v) {
                                return v;
                            });

                            async.eachSeries(requests, function (r, c) {
                                var q = dbTransaction.prepare("INSERT INTO requests (id, blockId, address) VALUES($id, $blockId, $address)");
                                q.bind({
                                    $id: r.getId(),
                                    $blockId: r.blockId,
                                    $address: r.address
                                });

                                q.run(function (err) {
                                    if (!err) {
                                        requestsIds.push(this.lastID);
                                    }

                                    c(err);
                                });
                            }, function (err) {
                                cb(err);
                            });
                        },
                        function (cb) {
                            if (!block.confirmations) {
                                return cb();
                            }

                            async.eachSeries(block.confirmations, function (confirmation, c) {
                                var data = {
                                    $id: confirmation.getId(),
                                    $blockId: confirmation.blockId,
                                    $companyId: confirmation.companyId,
                                    $verified: confirmation.verified,
                                    $timestamp: confirmation.timestamp,
                                    $signature: confirmation.signature
                                };

                                var q = dbTransaction.prepare("INSERT INTO companyconfirmations (id, blockId, companyId, verified, timestamp, signature) VALUES ($id, $blockId, $companyId, $verified, $timestamp, $signature)");
                                q.bind(data);
                                q.run(function (err) {
                                    if (!err) {
                                        companyconfirmationsIds.push(this.lastID);
                                    }

                                    c(err);
                                });
                            }, function (err) {
                                cb(err);
                            });
                        }
                    ], function (err) {
                        if (err) {
                            if (callback) {
                                return callback(err);
                            } else {
                                return;
                            }
                        }

                        var bb = new ByteBuffer(8 * (trsIds.length + requestsIds.length + companyconfirmationsIds.length));

                        async.series([
                            function (next) {
                                async.eachSeries(trsIds, function (tId, c) {
                                    bb.writeInt64(tId);
                                    c();
                                }, next);
                            },
                            function (next) {
                                async.eachSeries(requestsIds, function (rId, c) {
                                    bb.writeInt64(rId);
                                    c();
                                }, next);
                            },
                            function (next) {
                                async.eachSeries(companyconfirmationsIds, function (cId, c) {
                                    bb.writeInt64(cId);
                                    c();
                                }, next);
                            }
                        ], function () {
                            var buffer = null;
                            bb.flip();
                            buffer = bb.toBuffer();

                            var q = dbTransaction.prepare("INSERT INTO blocks VALUES($id, $version, $timestamp, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature, $refs, $height)");
                            q.bind({
                                $id: block.getId(),
                                $version: block.version,
                                $timestamp: block.timestamp,
                                $previousBlock: block.previousBlock,
                                $numberOfRequests: block.numberOfRequests,
                                $numberOfTransactions: block.numberOfTransactions,
                                $totalAmount: block.totalAmount,
                                $totalFee: block.totalFee,
                                $payloadLength: block.payloadLength,
                                $payloadHash: block.payloadHash,
                                $generatorPublicKey: block.generatorPublicKey,
                                $generationSignature: block.generationSignature,
                                $blockSignature: block.blockSignature,
                                $height: block.height,
                                $requestsLength: block.requestsLength,
                                $numberOfConfirmations: block.numberOfConfirmations,
                                $confirmationsLength: block.confirmationsLength,
                                $refs: buffer
                            });

                            q.run(function (err) {
                                if (err) {
                                    if (callback) {
                                        return callback(err);
                                    }
                                } else {
                                    dbTransaction.commit(function (err) {
                                        if (err) {
                                            dbTransaction.rollback(function () {
                                                if (callback) {
                                                    callback(err);
                                                }
                                            });
                                        } else {
                                            if (callback) {
                                                callback();
                                            }
                                        }
                                    });
                                }
                            });
                        });
                    });
                }
            });
        });
    } catch (e) {
        if (e) {
            console.log(e);
        }
        if (callback) {
            callback(e);
        }
    }
}

/*
db.prototype.writeBlock = function (block, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("INSERT INTO blocks VALUES($id, $version, $timestamp, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature, $height)");
        q.bind({
            $id: block.getId(),
            $version: block.version,
            $timestamp: block.timestamp,
            $previousBlock: block.previousBlock,
            $numberOfRequests : block.numberOfRequests,
            $numberOfTransactions: block.numberOfTransactions,
            $totalAmount: block.totalAmount,
            $totalFee: block.totalFee,
            $payloadLength: block.payloadLength,
            $payloadHash: block.payloadHash,
            $generatorPublicKey: block.generatorPublicKey,
            $generationSignature: block.generationSignature,
            $blockSignature: block.blockSignature,
            $height : block.height,
            $requestsLength : block.requestsLength,
            $numberOfConfirmations : block.numberOfConfirmations,
            $confirmationsLength : block.confirmationsLength
        });

        q.run(function (err) {
            if (cb) {
                cb(err);
            }
        });
    }.bind(this));
}*/

db.prototype.readAllBlocks = function (cb) {
    this.sql.serialize(function () {
        this.sql.all("SELECT * FROM blocks ORDER BY height", function (err, rows) {
            if (!rows) {
                rows = [];
            }

            if (cb) {
                cb(err, rows);
            }
        });
    }.bind(this));
}


/*
db.prototype.readAllBlocks = function (cb) {
    this.sql.serialize(function () {
        this.sql.all("SELECT * FROM blocks ORDER BY height", function (err, rows) {
            if (!rows) {
                rows = [];
            }

            var trs = {},
                requests = {},
                companyconfirmations = {},
                transactionsassets = {};

            this.sql.each("SELECT * FROM trs", function (err, row) {
                if (!trs[row.blockId]) {
                    trs[row.blockId] = [row];
                } else {
                    trs[row.blockId].push(row);
                }
            }, function () {
                this.sql.each("SELECT * FROM requests", function (err, row) {
                    if (!requests[row.blockId]) {
                        requests[row.blockId] = [row];
                    } else {
                        requests[row.blockId].push(row);
                    }
                }, function () {
                    this.sql.each("SELECT * FROM companyconfirmations", function (err, row) {
                        if (!companyconfirmations[row.blockId]) {
                            companyconfirmations[row.blockId] = [row];
                        } else {
                            companyconfirmations[row.blockId].push(row);
                        }
                    }, function () {
                        this.sql.each("SELECT * FROM signatures", function (err, row) {
                            transactionsassets[row.transactionId] = row;
                        }, function () {
                            this.sql.each("SELECT * FROM companies", function (err, row) {
                                transactionsassets[row.transactionId] = row;
                            }, function () {
                                if (cb) {
                                    cb(err, { blocks : rows, trs : trs, requests : requests, companyconfirmations : companyconfirmations, transactionsassets : transactionsassets });
                                }
                            }.bind(this));
                        }.bind(this));
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        }.bind(this));
    }.bind(this));
}
*/

db.prototype.writePeerRequest = function (request, callback) {
    this.sql.serialize(function () {
        var r = this.sql.prepare("INSERT INTO requests (id, blockId, address) VALUES($id, $blockId, $address)");
        r.bind({
            $id : request.getId(),
            $blockId : request.blockId,
            $address : request.address
        });

        r.run(function (err) {

           if (callback) {
                callback(err);
            }
        });
    }.bind(this));
}

db.prototype.writeSignature = function (signature, callback) {
    this.sql.serialize(function () {
        var r = this.sql.prepare("INSERT INTO signatures (id, blockId, transactionId, timestamp, publicKey, generatorPublicKey, signature, generationSignature) VALUES ($id, $blockId, $transactionId, $timestamp, $publicKey, $generatorPublicKey, $signature, $generationSignature)");
        r.bind({
            $id : signature.getId(),
            $blockId : signature.blockId,
            $transactionId : signature.transactionId,
            $timestamp : signature.timestamp,
            $publicKey : signature.publicKey,
            $generatorPublicKey : signature.generatorPublicKey,
            $signature : signature.signature,
            $generationSignature : signature.generationSignature
        });
        r.run(function (err) {

            if (callback) {
                callback(err);
            }
        })
    }.bind(this));
}

db.prototype.writeCompany = function (company, callback) {
    this.sql.serialize(function () {
        var data = {
            $id : company.getId(),
            $blockId : company.blockId,
            $transactionId : company.transactionId,
            $name : company.name,
            $description : company.description || "",
            $domain : company.domain,
            $email : company.email,
            $timestamp : company.timestamp,
            $generatorPublicKey : company.generatorPublicKey,
            $signature : company.signature
        };

        var r = this.sql.prepare("INSERT INTO companies (id, blockId, transactionId, name, description, domain, email, timestamp, generatorPublicKey, signature) VALUES ($id, $blockId, $transactionId, $name, $description, $domain, $email, $timestamp, $generatorPublicKey, $signature)");
        r.bind(data);
        r.run(function (err) {
            if (callback) {
                callback(err);
            }
        });
    }.bind(this));
}

db.prototype.writeCompanyConfirmation = function (confirmation, callback) {
    this.sql.serialize(function () {
        var data = {
            $id : confirmation.getId(),
            $blockId : confirmation.blockId,
            $companyId :  confirmation.companyId,
            $verified : confirmation.verified,
            $timestamp : confirmation.timestamp,
            $signature : confirmation.signature
        };

        var r = this.sql.prepare("INSERT INTO companyconfirmations (id, blockId, companyId, verified, timestamp, signature) VALUES ($id, $blockId, $companyId, $verified, $timestamp, $signature)");
        r.bind(data);
        r.run(function (err) {
            if (callback) {
                callback(err);
            }
        });
    }.bind(this));
}

module.exports.initDb = function (path, app, callback) {
    var d = new db(path);

    d.sql.serialize(function () {
        async.series([
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(20) NOT NULL, version INT NOT NULL, timestamp TIMESTAMP NOT NULL, previousBlock VARCHAR(20),  numberOfRequests INT NOT NULL, numberOfTransactions INT NOT NULL, numberOfConfirmations INT NOT NULL, totalAmount INTEGER NOT NULL, totalFee INTEGER NOT NULL, payloadLength INT NOT NULL, requestsLength INT NOT NULL, confirmationsLength INT NOT NULL, payloadHash BLOB NOT NULL, generatorPublicKey BLOB NOT NULL, generationSignature BLOB NOT NULL, blockSignature BLOB NOT NULL, refs BLOB, height INT NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS trs (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, type INT NOT NULL, subtype INT NOT NULL, timestamp TIMESTAMP NOT NULL, senderPublicKey BLOB NOT NULL, sender VARCHAR(21) NOT NULL, recipient VARCHAR(21) NOT NULL, amount INTEGER NOT NULL, fee INTEGER NOT NULL, signature BLOB NOT NULL, assetId BIGINT, signSignature BLOB, PRIMARY KEY(id), FOREIGN KEY(blockId) REFERENCES blocks(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS requests (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, address VARCHAR(21) NOT NULL, PRIMARY KEY(id), FOREIGN KEY(blockId) REFERENCES blocks(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS signatures (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, timestamp TIMESTAMP NOT NULL, publicKey BLOB NOT NULL, generatorPublicKey BLOB NOT NULL, signature BLOB NOT NULL, generationSignature BLOB NOT NULL, PRIMARY KEY(id), FOREIGN KEY(blockid) REFERENCES blocks(id),  FOREIGN KEY(transactionId) REFERENCES trs(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companies (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey BLOB NOT NULL, signature BLOB NOT NULL, PRIMARY KEY(id),  FOREIGN KEY(blockId) REFERENCES blocks(id),  FOREIGN KEY(transactionId) REFERENCES trs(id))", cb)
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companyconfirmations (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, companyId VARCHAR(20) NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature BLOB NOT NULL, PRIMARY KEY(id), FOREIGN KEY(blockId) REFERENCES blocks(id))", cb);
            },
            function (cb) {
                if (process.env.MIGRATION) {
                    app.logger.info("Start migration...");
                    var loaded = 0,
                        total = 0;
                    d.sql.run("ALTER TABLE blocks ADD COLUMN refs BLOB", function (err) {
                        if (err) {
                            cb(err);
                        } else {
                            d.sql.all("SELECT * FROM blocks ORDER BY height", function (err, blocks) {
                                if (err) {
                                    return cb(err);
                                }

                                total = blocks.length;
                                async.eachSeries(blocks, function (b, nextBlock) {
                                    var trsIds = [],
                                        requestsIds = [],
                                        companyconfirmationsIds = [];

                                    async.series([
                                        function (next) {
                                            d.sql.all("SELECT rowid FROM trs where blockId=?", b.id, function (err, ids) {
                                                trsIds = ids;
                                                next(err);
                                            });
                                        },
                                        function (next) {
                                            d.sql.all("SELECT rowid FROM requests where blockId=?", b.id, function (err, ids) {
                                                requestsIds = ids;
                                                next(err);
                                            });
                                        },
                                        function (next) {
                                            d.sql.all("SELECT rowid FROM companyconfirmations where blockId=?", b.id, function (err, ids) {
                                                companyconfirmationsIds = ids;
                                                next(err);
                                            });
                                        }
                                    ], function (err) {
                                        if (err) {
                                            return nextBlock(err);
                                        } else {
                                            var bb = new ByteBuffer(8 * (trsIds.length + requestsIds.length + companyconfirmationsIds.length));

                                            async.series([
                                                function (next) {
                                                    async.eachSeries(trsIds, function (trId, c) {
                                                        bb.writeInt64(trId.rowid);
                                                        c();
                                                    }, next);
                                                },
                                                function (next) {
                                                    async.eachSeries(requestsIds, function (rId, c) {
                                                        bb.writeInt64(rId.rowid);
                                                        c();
                                                    }, next);
                                                },
                                                function (next) {
                                                    async.eachSeries(companyconfirmationsIds, function (cId, c) {
                                                        bb.writeInt64(cId.rowid);
                                                        c();
                                                    }, next);
                                                }
                                            ], function () {
                                                bb.flip();
                                                var buffer = bb.toBuffer();

                                                d.sql.run("UPDATE blocks SET refs = ? WHERE id=?", [buffer, b.id], function (err) {
                                                    loaded++;

                                                    if (loaded % 100 == 0) {
                                                        console.log("Migration: " + loaded + " / " + total);
                                                    }

                                                    nextBlock(err);
                                                });
                                            })
                                        }
                                    });
                                }, function (err) {
                                    if (err) {
                                        cb(err);
                                    } else {
                                        app.logger.info("Migration finished");
                                        cb();
                                    }
                                });
                            });
                        }
                    });
                } else {
                    cb();
                }
            }
        ], function (err) {
            d.setApp(app);
            callback(err, d);
        });
    });
}