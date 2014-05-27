var express = require('express'),
    config = require('./config'),
    routes = require('./routes'),
    initDb = require('./db').initDb,
    async = require('async'),
    logger = require("./logger").logger,
    blockchain = require("./block").blockchain,
    block = require("./block").block,
    accountprocessor = require("./account").accountprocessor,
    forgerprocessor = require("./forger").forgerprocessor,
    transactionprocessor = require("./transactions").transactionprocessor,
    transaction = require("./transactions").transaction,
    addressprocessor = require("./address").addressprocessor,
    address = require("./address").address,
    path = require("path");

var app = express();

app.configure(function () {
    app.set("version", "0.1");
    app.set("address", config.get("address"));
    app.set('port', config.get('port'));

    if (config.get("serveHttpWallet")) {
        app.use(express.static(path.join(__dirname, "public")));
    }

    app.use(app.router);
});

app.configure("development", function () {
    app.use(express.logger('dev'));
    app.use(express.errorHandler());
});

async.series([
    function (cb) {
        logger.init("logs.log");
        logger.getInstance().info("Logger initialized");
        app.logger = logger.getInstance();
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing account processor...");
        app.accountprocessor = accountprocessor.init();
        logger.getInstance().info("Account processor initialized");
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing transaction processor...");
        app.transactionprocessor = transactionprocessor.init();
        app.transactionprocessor.setApp(app);
        logger.getInstance().info("Transaction processor initialized");
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing blockchain...");
        var bc = blockchain.init(app);

        if (!bc) {
            logger.getInstance().error("Genesis block generation failed");
            cb(false);
        } else {
            logger.getInstance().info("Blockchain initialized");
            cb();
        }
    },
    function (cb) {
        logger.getInstance().info("Initializing forger processor...");
        app.forgerprocessor = forgerprocessor.init(app);
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing address processor...");
        app.addressprocessor = new addressprocessor();
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing and scanning database...");
        initDb(function (err, db) {
            if (err) {
                cb(err);
            } else {
                app.db = db;
                app.db.readAllBlocks(function (err, blocks) {
                    if (err) {
                        cb(err);
                    } else {
                        async.forEach(blocks, function (item, c) {
                            //version, id, timestamp, previousBlock, transactions, totalAmount, totalFee, payloadLength, payloadHash, generatorPublicKey, generationSignature, blockSignature
                            var b = new block(item.version, null, item.previousBlock, [], item.totalAmount, item.totalFee, item.payloadLength, new Buffer(item.payloadHash, 'hex'), new Buffer(item.generatorPublicKey, 'hex'), new Buffer(item.generationSignature, 'hex'), new Buffer(item.blockSignature, 'hex'));
                            var id = b.getId();

                            if (!block.verifyBlockSignature() || !block.verifyGenerationSignature())  {
                                return c("Can't verify block: " + id);
                            }

                            var q = app.db.sql.prepare("SELECT * FROM trs WHERE blockId = ?");
                            q.bind(id);
                            q.run(function (err, rows) {
                                if (err) {
                                    c(err);
                                } else {
                                    var transactions = [];
                                    async.forEach(rows, function (t, _c) {
                                        var tr = new transaction(t.type, t.id, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recepient, t.amount, t.deadline, t.fee, t.referencedTransaction, new Buffer(t.signature, 'hex'));

                                        if (!tr.verify()) {
                                            return _c("Can't verify transaction: " + tr.getId());
                                        }

                                        transactions.push(tr);
                                        _c();
                                    }, function (err) {
                                        if (err) {
                                            return c(err);
                                        }
                                        var addresses = [];

                                        q = app.db.sql.prepare("SELECT * FROM addresses WHERE blockId = ?");
                                        q.bind(id);
                                        q.run(function (err, rows) {
                                            if (err) {
                                                c(err);
                                            } else {
                                                async.forEach(rows, function (a, _c) {
                                                    var addr = new address(a.version, a.id, new Buffer(a.generatorPublicKey, 'hex'), new Buffer(a.publicKey, 'hex'), a.timestamp, new Buffer(a.signature, 'hex'), new Buffer(a.accountSignature, 'hex'));

                                                    if (!addr.verify || addr.accountVerify()) {
                                                        return _c("Can't verify address: " + addr.getId());
                                                    }

                                                    addresses.push(addr);
                                                    _c();
                                                }, function (err) {
                                                    if (err) {
                                                        return c(err);
                                                    }

                                                    var b = block.getBytes();

                                                    for (var t in transactions) {
                                                        buffer = Buffer.concat([buffer, transactions[t].getBytes()]);
                                                    }

                                                    for (var addr in addresses) {
                                                        buffer = Buffer.concat([buffer, addresses[addr].getBytes()]);
                                                    }

                                                    var a = app.blockchain.pushBlock(buffer);

                                                    if (!a) {
                                                        c("Can't process block: " + b.getId());
                                                    } else {
                                                        c();
                                                    }
                                                });
                                            }
                                        });
                                    });
                                }
                            });
                        }, function (err) {
                            cb(err);
                        });
                    }
                });
            }
        });
    },
], function (err) {
    if (err) {
        logger.getInstance().info("Crypti stopped!");
        logger.getInstance().error("Error: " + err);
    } else {
        app.listen(app.get('port'), app.get('address'), function () {
            logger.getInstance().info("Crypti started: " + app.get("address") + ":" + app.get("port"));

            if (config.get("serveHttpApi")) {
                routes(app);
            }
        });
    }
});