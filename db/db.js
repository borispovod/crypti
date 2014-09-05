var sqlite3 = require('sqlite3'),
    path = require('path'),
    async = require('async'),
    transactionDatabase = require("sqlite3-transactions").TransactionDatabase,
    _ = require('underscore');

var db = function (path) {
    this.path = path;
    this.open();
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

db.prototype.deleteBlock = function (b, callback) {
    var sql = this.sql;
    sql.serialize(function () {
        sql.beginTransaction(function (err, dbTransaction) {
            dbTransaction.run("DELETE FROM blocks WHERE id=?", b.getId());
            dbTransaction.run("DELETE FROM trs WHERE blockId=?",b.getId());
            dbTransaction.run("DELETE FROM companyconfirmations WHERE blockId=?", b.getId());
            dbTransaction.run("DELETE FROM requests WHERE blockId=?", b.getId());
            dbTransaction.run("DELETE FROM companies WHERE blockId=?", b.getId());
            dbTransaction.run("DELETE FROM signatures WHERE blockId=?", b.getId());

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

db.prototype.writeBlock = function (block,  callback) {
    try {
        var sql = this.sql;
        sql.serialize(function () {
            sql.beginTransaction(function (err, dbTransaction) {
                if (err) {
                    console.log(err);
                } else {
                    async.parallel([
                        function (cb) {
                            if (!block.transactions) {
                                return cb();
                            }

                            async.forEach(block.transactions, function (t, c) {
                                var q = dbTransaction.prepare("INSERT INTO trs VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $sender, $recipient, $amount, $fee, $signature, $signSignature)");
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
                                        console.log(err);
                                        return c(err);
                                    }

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
                                            return c(err);
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
                                            return c(err);
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

                            async.forEach(requests, function (r, c) {
                                var q = dbTransaction.prepare("INSERT INTO requests (id, blockId, address) VALUES($id, $blockId, $address)");
                                q.bind({
                                    $id: r.getId(),
                                    $blockId: r.blockId,
                                    $address: r.address
                                });

                                q.run(function (err) {
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
                            async.forEach(block.confirmations, function (confirmation, c) {
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
                                    c(err);
                                });
                            }, function (err) {
                                cb(err);
                            });
                        }
                    ], function (err) {
                        if (err) {
                            dbTransaction.rollback(function () {
                                if (callback) {
                                    callback();
                                }
                            });
                        } else {
                            dbTransaction.commit(function (err) {
                                if (err) {
                                    dbTransaction.rollback(function () {
                                        if (callback) {
                                            callback();
                                        }
                                    });
                                } else {
                                    var q = sql.prepare("INSERT INTO blocks VALUES($id, $version, $timestamp, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature, $height)");
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
                                        $confirmationsLength: block.confirmationsLength
                                    });

                                    q.run(function (err) {
                                        if (callback) {
                                            callback(err);
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        });
    } catch (e) {
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

module.exports.initDb = function (path, callback) {
    var d = new db(path);

    d.sql.serialize(function () {
        async.series([
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(20) NOT NULL, version INT NOT NULL, timestamp TIMESTAMP NOT NULL, previousBlock VARCHAR(20),  numberOfRequests INT NOT NULL, numberOfTransactions INT NOT NULL, numberOfConfirmations INT NOT NULL, totalAmount INTEGER NOT NULL, totalFee INTEGER NOT NULL, payloadLength INT NOT NULL, requestsLength INT NOT NULL, confirmationsLength INT NOT NULL, payloadHash BLOB NOT NULL, generatorPublicKey BLOB NOT NULL, generationSignature BLOB NOT NULL, blockSignature BLOB NOT NULL, height INT NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS trs (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, type INT NOT NULL, subtype INT NOT NULL, timestamp TIMESTAMP NOT NULL, senderPublicKey BLOB NOT NULL, sender VARCHAR(21) NOT NULL, recipient VARCHAR(21) NOT NULL, amount INTEGER NOT NULL, fee INTEGER NOT NULL, signature BLOB NOT NULL, signSignature BLOB, PRIMARY KEY(id), FOREIGN KEY(blockId) REFERENCES blocks(id))", cb);
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
                d.sql.get("SELECT TYPEOF(blockId) as type FROM trs", function (err, r) {
                   if (err) {
                       return cb(err);
                   } else {
                       if (process.env.CONVERT_DB) {
                           d.sql.beginTransaction(function (err, dbTransaction) {
                               if (err) {
                                   return cb(err);
                               }  else {
                                   dbTransaction.run("CREATE TEMPORARY TABLE trs_backup(id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, type INT NOT NULL, subtype INT NOT NULL, timestamp TIMESTAMP NOT NULL, senderPublicKey BLOB NOT NULL, sender VARCHAR(21) NOT NULL, recipient VARCHAR(21) NOT NULL, amount INTEGER NOT NULL, fee INTEGER NOT NULL, signature BLOB NOT NULL, signSignature BLOB, PRIMARY KEY(id))");
                                   dbTransaction.run("INSERT INTO trs_backup SELECT * FROM trs");
                                   dbTransaction.run("DROP TABLE trs");
                                   dbTransaction.run("CREATE TABLE  trs(id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, type INT NOT NULL, subtype INT NOT NULL, timestamp TIMESTAMP NOT NULL, senderPublicKey BLOB NOT NULL, sender VARCHAR(21) NOT NULL, recipient VARCHAR(21) NOT NULL, amount INTEGER NOT NULL, fee INTEGER NOT NULL, signature BLOB NOT NULL, signSignature BLOB, PRIMARY KEY(id), FOREIGN KEY(blockId) REFERENCES blocks(id))");
                                   dbTransaction.run("INSERT INTO trs SELECT * FROM trs_backup");
                                   dbTransaction.run("DROP TABLE trs_backup");

                                   dbTransaction.run("CREATE TEMPORARY TABLE requests_backup(id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, address VARCHAR(21) NOT NULL, PRIMARY KEY(id))");
                                   dbTransaction.run("INSERT INTO requests_backup SELECT * FROM requests");
                                   dbTransaction.run("DROP TABLE requests");
                                   dbTransaction.run("CREATE TABLE requests(id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, address VARCHAR(21) NOT NULL, PRIMARY KEY(id), FOREIGN KEY(blockId) REFERENCES blocks(id))");
                                   dbTransaction.run("INSERT INTO requests SELECT * FROM requests_backup");
                                   dbTransaction.run("DROP TABLE requests_backup");

                                   dbTransaction.run("CREATE TEMPORARY TABLE signatures_backup (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, timestamp TIMESTAMP NOT NULL, publicKey BLOB NOT NULL, generatorPublicKey BLOB NOT NULL, signature BLOB NOT NULL, generationSignature BLOB NOT NULL, PRIMARY KEY(id))");
                                   dbTransaction.run("INSERT INTO signatures_backup SELECT * FROM signatures");
                                   dbTransaction.run("DROP TABLE signatures");
                                   dbTransaction.run("CREATE TABLE signatures (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, timestamp TIMESTAMP NOT NULL, publicKey BLOB NOT NULL, generatorPublicKey BLOB NOT NULL, signature BLOB NOT NULL, generationSignature BLOB NOT NULL, PRIMARY KEY(id), FOREIGN KEY(blockid) REFERENCES blocks(id),  FOREIGN KEY(transactionId) REFERENCES trs(id))");
                                   dbTransaction.run("INSERT INTO signatures SELECT * FROM signatures_backup");
                                   dbTransaction.run("DROP TABLE signatures_backup");

                                   dbTransaction.run("CREATE TEMPORARY TABLE companies_backup (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey BLOB NOT NULL, signature BLOB NOT NULL, PRIMARY KEY(id))");
                                   dbTransaction.run("INSERT INTO companies_backup SELECT * FROM companies");
                                   dbTransaction.run("DROP TABLE companies");
                                   dbTransaction.run("CREATE TABLE companies (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey BLOB NOT NULL, signature BLOB NOT NULL, PRIMARY KEY(id),  FOREIGN KEY(blockId) REFERENCES blocks(id),  FOREIGN KEY(transactionId) REFERENCES trs(id))");
                                   dbTransaction.run("INSERT INTO companies SELECT * FROM companies_backup");
                                   dbTransaction.run("DROP TABLE companies_backup");


                                   dbTransaction.run("CREATE TEMPORARY TABLE companyconfirmations_backup (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, companyId VARCHAR(20) NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature BLOB NOT NULL, PRIMARY KEY(id))");
                                   dbTransaction.run("INSERT INTO companyconfirmations_backup SELECT * FROM companyconfirmations");
                                   dbTransaction.run("DROP TABLE companyconfirmations");
                                   dbTransaction.run("CREATE TABLE companyconfirmations (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, companyId VARCHAR(20) NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature BLOB NOT NULL, PRIMARY KEY(id), FOREIGN KEY(blockId) REFERENCES blocks(id))");
                                   dbTransaction.run("INSERT INTO companyconfirmations SELECT * FROM companyconfirmations_backup");
                                   dbTransaction.run("DROP TABLE companyconfirmations_backup");

                                   dbTransaction.commit(function (err) {
                                       if (err) {
                                           dbTransaction.rollback(function (err) {
                                               return cb(err);
                                           });
                                       } else {
                                           return cb();
                                       }
                                   });
                               }
                           });
                           /*BEGIN TRANSACTION;
                           CREATE TEMPORARY TABLE t1_backup(a,b);
                           INSERT INTO t1_backup SELECT a,b FROM t1;
                           DROP TABLE t1;
                           CREATE TABLE t1(a,b);
                           INSERT INTO t1 SELECT a,b FROM t1_backup;
                           DROP TABLE t1_backup;
                           COMMIT;*/
                       } else {
                           cb();
                       }
                   }
                });
            }
        ], function (err) {
            callback(err, d);
        });
    });
}