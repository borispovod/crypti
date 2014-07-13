var express = require('express'),
    config = require('./config'),
    routes = require('./routes'),
    initDb = require('./db').initDb,
    async = require('async'),
    logger = require("./logger").logger,
    blockchain = require("./block").blockchain,
    block = require("./block").block.block,
    accountprocessor = require("./account").accountprocessor,
    forgerprocessor = require("./forger").forgerprocessor,
    transactionprocessor = require("./transactions").transactionprocessor,
    transaction = require("./transactions").transaction,
    addressprocessor = require("./address").addressprocessor,
    address = require("./address").address,
    path = require("path"),
    peerprocessor = require("./p2p").peerprocessor,
    peer = require("./p2p").peer,
    os = require("os"),
    peerRoutes = require('./p2p').initRoutes,
    Constants = require("./Constants.js"),
    genesisblock = require("./block").genesisblock,
    fs = require('fs');

var app = express();

process.on('uncaughtException', function (exception) {
    console.log(exception);
});

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

if (!fs.existsSync("addresses.txt")) {
    fs.writeFileSync("addresses.txt");
}
app.addresses = fs.readFileSync('addresses.txt').toString().split("\n");
app.saveAddress = function (addr) {
    app.addresses.push(addr);
    fs.appendFile('addresses.txt', addr + "\n", function (err) {
        console.log(err);
    });
}

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
        app.blockchain = blockchain.init(app);
        logger.getInstance().info("Blockchain initialized...");
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing forger processor...");
        app.forgerprocessor = forgerprocessor.init(app);
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing address processor...");
        app.addressprocessor = new addressprocessor();
        app.addressprocessor.setApp(app);
        cb();
    },
    function (cb) {
      logger.getInstance().info("Initializing peer processor...");
      app.peerprocessor = new peerprocessor();
      cb();
    },
    function (cb) {
        logger.getInstance().info("Load system info...");
        app.info = { platform : os.platform, version : config.get('version') };
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
                        async.eachSeries(blocks, function (item, c) {
                            var b = new block(item.version, null, item.timestamp, item.previousBlock, [], item.totalAmount, item.totalFee, item.payloadLength, new Buffer(item.payloadHash, 'hex'), new Buffer(item.generatorPublicKey, 'hex'), new Buffer(item.generationSignature, 'hex'), new Buffer(item.blockSignature, 'hex'));
                            b.numberOfTransactions = item.numberOfTransactions;
                            b.numberOfAddresses = item.numberOfAddresses;
                            b.setApp(app);
                            b.height = item.height;
                            var id = b.getId();

                            logger.getInstance().info("Load block: " + b.getId() + ", height: " + b.height);

                            var q = app.db.sql.prepare("SELECT * FROM trs WHERE blockId = ?");
                            q.bind(id);
                            q.all(function (err, rows) {
                                if (err) {
                                    c(err);
                                } else {
                                    var transactions = [];
                                    async.eachSeries(rows, function (t, _c) {
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
                                        b.transactions = transactions;

                                        var addresses = {};

                                        q = app.db.sql.prepare("SELECT * FROM addresses WHERE blockId = ?");
                                        q.bind(id);
                                        q.all(function (err, rows) {
                                            if (err) {
                                                c(err);
                                            } else {
                                                async.eachSeries(rows, function (a, _c) {

                                                    var addr = new address(a.version, a.id, new Buffer(a.generatorPublicKey, 'hex'), new Buffer(a.publicKey, 'hex'), a.timestamp, new Buffer(a.signature, 'hex'), new Buffer(a.accountSignature, 'hex'));

                                                    if (!addr.verify() || !addr.accountVerify()) {
                                                        return _c("Can't verify address: " + addr.id);
                                                    }

                                                    addresses[addr.id] = addr;
                                                      _c();
                                                }, function (err) {
                                                    if (err) {
                                                        return c(err);
                                                    }


                                                    b.addresses = addresses;

                                                    if (b.getId() == genesisblock.blockId) {
                                                        var a = b.analyze();

                                                        if (!a) {
                                                            c("Can't process block: " + b.getId());
                                                        } else {
                                                            c();
                                                        }
                                                    } else {
                                                        var buffer = b.getBytes();

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
    function (cb) {
        logger.getInstance().info("Find or add genesis block...");

        blockchain.addGenesisBlock(app, function (err) {
            if (err) {
               logger.getInstance().info("Genesis block not added");
               cb(err);
            } else {
                logger.getInstance().info("Genesis block added...");
                cb();
            }

        });
    },
    function (cb) {
        logger.getInstance().info("Connecting to peers...");
        var peers = config.get("peers").list;
        async.forEach(peers, function (p , callback) {
            p = new peer(p.ip, p.port);
            app.peerprocessor.addPeer(p);
            callback();
        }, function () {
            cb();
        });
    },
    function (cb) {
        logger.getInstance().info("Scanning peers...");
        var peers = {};
        peers = app.peerprocessor.getPeersAsArray() ;

        async.eachSeries(peers, function (p, callback) {
            p.getPeers(function (err, peersJSON) {
                if (err) {
                    app.peerprocessor.removePeer(p.ip);
                    callback();
                } else {
                    var ps = [];

                    try {
                        ps = JSON.parse(peersJSON).peers;
                    } catch (e) {
                        return callback();
                    }

                    if (ps) {
                        for (var i = 0; i < ps.length; i++) {
                            var newPeer = new peer(ps[i].ip, ps[i].port, ps[i].platform, ps[i].version);

                            if (!app.peerprocessor.peers[newPeer.ip]) {
                                app.peerprocessor.addPeer(newPeer);
                            }
                        }
                        callback();
                    } else {
                        return callback();
                    }
                }
            });
        }, function () { cb(); });
    },
    /*function (cb) {
        logger.getInstance().info("Scanning blockchain...");
        var lastId = app.blockchain.getLastBlock().getId();

        var newBlocks = [];
        var p = app.peerprocessor.getAnyPeer();

        async.whilst(function () {
                return !(newBlocks.length == 0);
            },
            function (next) {
                if (!p) {
                    return next();
                }

                p.getNextBlocks(blockId, function (err, blocksJSON) {
                    if (err) {
                        logger.getInstance().info("Error with peer: " + p.id);
                        p = app.peerprocessor.getAnyPeer();
                        next();
                    } else {
                        try {
                            newBlocks = JSON.parse(blocksJSON).blocks;
                        }
                        catch (e) {
                            logger.getInstance().info("Error with peer: " + p.id);
                            p = app.peerprocessor.getAnyPeer();
                            return next();
                        }

                        if (bs) {
                            for (var i = 0; i < bs.length; i++) {
                                var b = app.blockchain.fromJSON(newBlocks[i]);
                                b.transactions = [];
                                b.previousBlock = app.blockchain.getLastBlock().getId();
                                var trs = newBlocks[i].transactions;
                                var buffer = b.getBytes();

                                for (var j = 0; j < trs.length; i++) {
                                    var t = app.transactionprocessor.fromJSON(trs[i]);
                                    b.transactions.push(t);

                                    buffer = Buffer.concat([buffer, t.getBytes()]);
                                }

                                var r = this.blockchain.pushBlock(buffer, true);

                                if (!r) {
                                    break;
                                }
                            }

                            next();
                        } else {
                            logger.getInstance().info("Error with peer: " + p.id);
                            p = app.peerprocessor.getAnyPeer();
                            next();
                        }
                    }
                });
            },
            function (err) {
                cb();
            });
    },
    function (cb) {
        logger.getInstance().info("Getting unconfirmed blocks...");
        var p = app.peerprocessor.getAnyPeer();
        var finished = true;

        async.whilst(function () {
                return finished;
            },
            function (next) {
                if (!p) {
                    finished = false;
                    return next();
                }

                p.getUnconfirmedTransactions(function (err, transactionsJSON) {
                    if (err) {
                        p = app.peerprocessor.getAnyPeer();
                        return next();
                    } else {
                        var trs = [];
                        try {
                            trs = JSON.parse(transactionsJSON).peers;
                        } catch (e) {
                            p = app.peerprocessor.getAnyPeer();
                            return next();
                        }

                        if (trs) {
                            var error = false;
                            for (var i = 0; i < trs.length; i++) {
                                var t = app.transactionprocessor.fromJSON(trs[i]);

                                var r = app.transactionprocessor.processTransaction(t);

                                if (!r) {
                                    error = true;
                                    break;
                                }
                            }

                            if (error) {
                                p = app.peerprocessor.getAnyPeer();
                                next();
                            } else {
                                finished = true;
                                next();
                            }
                        } else {
                            p = app.peerprocessor.getAnyPeer();
                            return next();
                        }
                    }
                });
            },
            function () {
                cb();
            });
    },*/
    function (cb) {
        logger.getInstance().info("Starting intervals...");
        setInterval(function () {
            var peers = app.peerprocessor.getPeersAsArray();
            async.forEach(peers, function (p, callback) {
                var i = p.checkBlacklisted();

                if (!i) {
                    p.setBlacklisted(false);
                }

                callback();
            }, function () {

            });
        }, 1000 * 60);

        var peersRunning = false;
        // peers
        setInterval(function () {
            if (peersRunning) {
                return;
            }

            peersRunning = true;
            var p = app.peerprocessor.getAnyPeer();
            var finished = true;

            async.whilst(function () {
                    return finished;
                },
                function (next) {
                    if (Constants.maxClientConnections <= Object.keys(app.peerprocessor.peers).length) {
                        finished = false;
                        next(true);
                    } else {
                        if (!p) {
                            finished = false;
                            return next();
                        }

                        p.getPeers(function (err, peersJSON) {
                            if (err) {
                                p = app.peerprocessor.getAnyPeer();
                                return next();
                            } else {
                                var ps = [];
                                try {
                                    ps = JSON.parse(peersJSON).peers;
                                } catch (e) {
                                    p = app.peerprocessor.getAnyPeer();
                                    return next();
                                }

                                if (ps) {
                                    for (var i = 0; i < ps.length; i++) {
                                        var p = new peer(ps[i].ip, ps[i].port, ps[i].platform, ps[i].version);

                                        if (!app.peerprocessor.peers[p.ip]) {
                                            app.peerprocessor.addPeer(p);
                                        }
                                    }

                                    finished = true;
                                    next();
                                } else {
                                    p = app.peerprocessor.getAnyPeer();
                                    return next();
                                }
                            }
                        });
                    }
                },
                function () {
                    peersRunning = false;
                });
        }, 1000 * 5);

        // unconfirmed
        /*var unconfirmedTrsRunning = false;
        setInterval(function () {
            if (unconfirmedTrsRunning) {
                return;
            }

            unconfirmedTrsRunning = true;
            var p = app.peerprocessor.getAnyPeer();
            var finished = true;

            async.whilst(function () {
                    return finished;
                },
                function (next) {
                    if (!p) {
                        finished = false;
                        return next();
                    }

                    p.getUnconfirmedTransactions(function (err, transactionsJSON) {
                        if (err) {
                            p = app.peerprocessor.getAnyPeer();
                            return next();
                        } else {
                            var trs = [];
                            try {
                                trs = JSON.parse(transactionsJSON).peers;
                            } catch (e) {
                                p = app.peerprocessor.getAnyPeer();
                                return next();
                            }

                            if (trs) {
                                var error = false;
                                for (var i = 0; i < trs.length; i++) {
                                    var t = app.transactionprocessor.fromJSON(trs[i]);

                                    var r = app.transactionprocessor.processTransaction(t);

                                    if (!r) {
                                        p.setBlacklisted(true);
                                        error = true;
                                        break;
                                    }
                                }

                                if (error) {
                                    p = app.peerprocessor.getAnyPeer();
                                    next();
                                } else {
                                    finished = true;
                                    next();
                                }
                            } else {
                                p = app.peerprocessor.getAnyPeer();
                                return next();
                            }
                        }
                    });
                },
                function () {
                    unconfirmedTrsRunning = false;
                });
        }, 1000 * 5);

        // blocks
        var blocksRunning = false;
        setInterval(function () {
            if (blocksRunning) {
                return;
            }

            blocksRunning = true;
            var newBlocks = [];
            var p = app.peerprocessor.getAnyPeer();

            async.whilst(function () {
                    return !(newBlocks.length == 0);
                },
                function (next) {
                    if (!p) {
                        return next();
                    }

                    p.getNextBlocks(blockId, function (err, blocksJSON) {
                        if (err) {
                            logger.getInstance().info("Error with peer: " + p.id);
                            p = app.peerprocessor.getAnyPeer();
                            next();
                        } else {
                            try {
                                newBlocks = JSON.parse(blocksJSON).blocks;
                            }
                            catch (e) {
                                logger.getInstance().info("Error with peer: " + p.id);
                                p = app.peerprocessor.getAnyPeer();
                                return next();
                            }

                            if (bs) {
                                for (var i = 0; i < bs.length; i++) {
                                    var b = app.blockchain.fromJSON(newBlocks[i]);
                                    b.transactions = [];
                                    b.previousBlock = app.blockchain.getLastBlock().getId();
                                    var trs = newBlocks[i].transactions;
                                    var buffer = b.getBytes();

                                    for (var j = 0; j < trs.length; i++) {
                                        var t = app.transactionprocessor.fromJSON(trs[i]);
                                        b.transactions.push(t);

                                        buffer = Buffer.concat([buffer, t.getBytes()]);
                                    }

                                    var r = this.blockchain.pushBlock(buffer, true);

                                    if (!r) {
                                        p.setBlacklisted(true);
                                        p = app.peerprocessor.getAnyPeer();
                                        break;
                                    }
                                }

                                next();
                            } else {
                                logger.getInstance().info("Error with peer: " + p.id);
                                p = app.peerprocessor.getAnyPeer();
                                next();
                            }
                        }
                    });
                },
                function (err) {
                    blocksRunning = false;
                });
        }, 1000 * 5);*/

        cb();
    }
], function (err) {
    if (err) {
        logger.getInstance().info("Crypti stopped!");
        logger.getInstance().error("Error: " + err);
    } else {
        app.listen(app.get('port'), app.get('address'), function () {
            logger.getInstance().info("Crypti started: " + app.get("address") + ":" + app.get("port"));

            app.use(function (req, res, next) {
                var parts = req.url.split('/');
                var urls = parts.filter(function (v) { return (v!=='' && v!=='/') });

                if (urls[0] == "peer") {

                    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                    var p = app.peerprocessor.getPeer(ip);

                    if (!p) {
                        var platform = req.headers['platform'] || "",
                            version = parseFloat(req.headers['version']),
                            port = parseInt(req.headers['port']);

                        if (platform.length == 0 || isNaN(version) || version <= 0 || isNaN(port) || port <= 0) {
                            return res.json({ success: false, error: "Invalid headers" });
                        } else {
                            p = new peer(ip, port, platform, version);
                            app.peerprocessor.addPeer(p);
                            req.peer = p;
                            next();
                        }
                    } else {
                        if (p.checkBlacklisted()) {
                            return res.json({ success: false, error: "Your peer in black list" });
                        } else {
                            req.peer = p;
                            next();
                        }
                    }
                } else {
                    if (urls[0] != 'api' && urls[0] != "partials") {
                        res.redirect('/');
                        //next();
                    } else {
                        next();
                    }
                }
            });

            if (config.get("serveHttpAPI")) {
                routes(app);
            }

            peerRoutes(app);
        });
    }
});