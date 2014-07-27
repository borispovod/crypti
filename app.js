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
    fs = require('fs'),
    Forger = require("./forger").forger,
    utils = require("./utils.js"),
    _ = require('underscore');

var app = express();

if (process.env.PRODUCTION) {
    process.on('uncaughtException', function (exception) {
        console.log(exception);
    });
}

app.configure(function () {
    app.set("version", "0.1");
    app.set("address", config.get("address"));
    app.set('port', config.get('port'));
    app.use(express.bodyParser());


    if (config.get("serveHttpWallet")) {
        app.use(express.static(path.join(__dirname, "public")));
    }
    app.use(express.json());
    app.use(express.urlencoded());
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
        app.accountprocessor.setApp(app);
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
        logger.getInstance().info("Initializing address processor...");
        app.addressprocessor = new addressprocessor();
        app.addressprocessor.setApp(app);
        cb();
    },
    function (cb) {
      logger.getInstance().info("Initializing peer processor...");
      app.peerprocessor = new peerprocessor();
      app.peerprocessor.setApp(app);
      cb();
    },
    function (cb) {
        logger.getInstance().info("Load system info...");
        app.info = { platform : os.platform, version : config.get('version') };
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing forger processor...");
        app.forgerprocessor = forgerprocessor.init(app);
        app.synchronizedBlock = false;
        app.synchronizedPeers = false;
        app.synchronizedRequests = false;

        logger.getInstance().info("Initialize forger...");
        // get public key

        var forgerPassphrase = config.get("forging").secretPhrase;

        if (forgerPassphrase && forgerPassphrase.length > 0) {
            var keypair = app.accountprocessor.getKeyPair(forgerPassphrase);
            app.forgerKey = keypair;
            app.mytime = utils.getEpochTime(new Date().getTime());
            app.forgerAccountId = app.accountprocessor.getAddressByPublicKey(app.forgerKey.publicKey);

            logger.getInstance().info("Forger public key: " + keypair.publicKey.toString('hex'));
            logger.getInstance().info("Forger public key: " + app.forgerAccountId);
            logger.getInstance().info("Forging enabled...");

            var forger = new Forger(app.forgerAccountId, keypair.publicKey, forgerPassphrase);
            forger.setApp(app);
            var result = app.forgerprocessor.startForger(forger);
        } else {
            logger.getInstance().info("Forging not enabled...");
        }

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
                                        var tr = new transaction(t.type, t.id, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recepient, t.amount, t.fee, new Buffer(t.signature, 'hex'));

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
        async.forEach(peers, function (p, callback) {
            if (!p.ip || !p.port || isNaN(p.port) || p.port <= 0 || p.port >= 65500) {
                return callback();
            }

            p = new peer(p.ip, p.port);
            app.peerprocessor.addPeer(p);
            callback();
        }, function () {
            cb();
        });
    },
        /*
        var peers = config.get("peers").list;
        async.forEach(peers, function (p , callback) {
            if (!p.ip || !p.port || isNaN(p.port) || p.port <= 0 || p.port >= 65500) {
                return callback();
            }

            p = new peer(p.ip, p.port);
            app.peerprocessor.addPeer(p);
            callback();
        }, function () {
            app.peerprocessor.sendHelloToAll();
            cb();
        });*/
    function (cb) {
        logger.getInstance().info("Scanning peers...");
        var peers = [];
        peers = app.peerprocessor.getPeersAsArray();

        async.eachSeries(peers, function (p, callback) {
            p.getPeers(function (err, peersJSON) {
                if (err) {
                    //app.peerprocessor.removePeer(p.ip);
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
                            var pr = ps[i];
                            if (!pr.ip || isNaN(parseInt(pr.port)) || !pr.version || !pr.platform) {
                                return callback();
                            }

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
        }, function () {
            /*if (app.forgerKey) {
                app.peerprocessor.sendHelloToAll({
                    timestamp: utils.getEpochTime(new Date().getTime()),
                    platform: app.info.platform,
                    version: app.info.version,
                    publicKey: app.forgerKey.publicKey.toString('hex'),
                    port: config.get("port")
                });
            }*/


            cb();
        });
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
        return cb();
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
        /*setInterval(function () {
            var peers = app.peerprocessor.getPeersAsArray();
            async.forEach(peers, function (p, callback) {
                var i = p.checkBlacklisted();

                if (!i) {
                    p.setBlacklisted(false);
                }

                callback();
            }, function () {

            });
        }, 1000 * 60);*/



        var peersRunning = false;
        // peers
        setInterval(function () {
            if (peersRunning) {
                return;
            }

            peersRunning = true;
            var peers = [];
            peers = app.peerprocessor.getPeersAsArray();
            async.eachSeries(peers, function (p, callback) {
                app.logger.info("Get peers from " + p.ip);
                p.getPeers(function (err, peersJSON) {
                    if (err) {
                        if (p) {
                            //app.peerprocessor.removePeer(p.ip);
                        }

                        p = app.peerprocessor.getAnyPeer();
                        return callback();
                    } else {
                        var ps = [];
                        try {
                            ps = JSON.parse(peersJSON).peers;
                        } catch (e) {
                            p = app.peerprocessor.getAnyPeer();
                            return callback();
                        }

                        if (ps) {
                            app.logger.info("Process peers");
                            for (var i = 0; i < ps.length; i++) {
                                var p = new peer(ps[i].ip, ps[i].port, ps[i].platform, ps[i].version);

                                if (!app.peerprocessor.peers[p.ip]) {
                                    app.peerprocessor.addPeer(p);
                                }
                            }
                            callback();
                        } else {
                            p = app.peerprocessor.getAnyPeer();
                            return callback();
                        }
                    }
                });
            }, function () {
                peersRunning = false;
            });
        }, 1000 * 3);

        var requestsInterval = false;
        setInterval(function () {
            if (requestsInterval || app.synchronizedBlock) {
                return;
            }

            requestsInterval = true;
            app.logger.info("Process requests...");

            var p = app.peerprocessor.getAnyPeer();
            async.whilst(
                function (_break) { if (_break) return false; return p; },
                function (next) {
                    app.logger.info("Get requests from " + p.ip);
                    p.getRequests(function (err, requests) {
                       if (err) {
                           return next(true);
                       }  else {
                           var answer = null;

                           try {
                               answer = JSON.parse(requests);
                           } catch (e) {
                               return next(true);
                           }

                           if (answer.success) {
                               requests = answer.requests;

                               async.eachSeries(requests, function (item, c) {
                                   var account = app.accountprocessor.processRequest(item);
                                   if (!account) {
                                       app.logger.error("Can't process request of: " + item.ip);
                                       c();
                                   } else {
                                       app.db.writePeerRequest(item, function (err) {
                                           if (err) {
                                               app.logger.error(err.toString(), "error");
                                               c();
                                           } else {
                                               account.lastAliveBlock = app.blockchain.getLastBlock().getId();
                                               c();
                                           }
                                       });
                                   }
                               }, function () {
                                   next(true);
                               });
                           } else {
                               return next(true);
                           }
                       }
                    });
                },
                function () {
                    app.synchronizedRequests = true;
                    requestsInterval = false;
                });
        }, 1000 * 3);

        var blocksInterval = false;
        setInterval(function () {
            if (blocksInterval) {
                return;
            }

            blocksInterval = true;
            app.logger.info("Process blocks...");

            var p = app.peerprocessor.getAnyPeer();
            async.whilst(
                function (_break) { if (_break) return false; return p; },
                function (next) {
                    p.getNextBlocks(app.blockchain.getLastBlock().getId(), function (err, blocks) {
                        if (err) {
                            if (p) {
                                //app.logger.error(err);
                                //app.logger.error("Remove ip: " + p.ip);
                                //app.peerprocessor.removePeer(p.ip);
                                return next(true);
                            }

                            p = app.peerprocessor.getAnyPeer();
                            next();
                        } else {
                            var answer = null;
                            try {
                                answer = JSON.parse(blocks);
                            } catch (e) {
                                //app.peerprocessor.removePeer(p.ip);
                                p = app.peerprocessor.getAnyPeer();
                                return next(true);
                            }

                            if (answer.success) {
                                async.eachSeries(answer.blocks, function (item, c) {
                                    var b = new block(item.version, null, item.timestamp, item.previousBlock, [], item.totalAmount, item.totalFee, item.payloadLength, new Buffer(item.payloadHash, 'hex'), new Buffer(item.generatorPublicKey, 'hex'), new Buffer(item.generationSignature, 'hex'), new Buffer(item.blockSignature, 'hex'));
                                    b.numberOfTransactions = item.numberOfTransactions;
                                    b.numberOfAddresses = item.numberOfAddresses;
                                    b.setApp(app);
                                    b.height = item.height;
                                    var id = b.getId();

                                    logger.getInstance().info("Load block from peer: " + b.getId() + ", height: " + b.height);
                                    var transactions = [];
                                    async.eachSeries(item.trs, function (t, _c) {
                                        var tr = new transaction(t.type, t.id, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recepient, t.amount, t.fee, new Buffer(t.signature, 'hex'));

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

                                        async.eachSeries(item.addresses, function (a, __c) {
                                            var addr = new address(a.version, a.id, new Buffer(a.generatorPublicKey, 'hex'), new Buffer(a.publicKey, 'hex'), a.timestamp, new Buffer(a.signature, 'hex'), new Buffer(a.accountSignature, 'hex'));

                                            if (!addr.verify() || !addr.accountVerify()) {
                                                return __c("Can't verify address: " + addr.id);
                                            }

                                            addresses[addr.id] = addr;
                                            __c();
                                        }, function (err) {
                                            if (err) {
                                                return c(err);
                                            }

                                            b.addresses = addresses;

                                            b.numberOfTransactions = transactions.length;
                                            b.numberOfAddresses = Object.keys(addresses).length;

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
                                        });
                                    });
                                }, function (err) {
                                    if (err) {
                                        app.logger.error(err);
                                        //app.peerprocessor.removePeer(p.ip);
                                        p = app.peerprocessor.getAnyPeer();
                                        return next(true);
                                    }

                                    app.logger.info("Processed blocks from " + p.ip);

                                    if (answer.blocks && answer.blocks.length > 0) {
                                        next();
                                    } else {
                                        next(true);
                                    }
                                });
                            } else {
                                app.peerprocessor.removePeer(p.ip);
                                p = app.peerprocessor.getAnyPeer();
                                next(true);
                            }
                        }
                    });
                },
                function (err) {
                    if (p) {
                        app.logger.info("Blocks processed from " + p.ip);
                    }

                    app.synchronizedBlocks = true;
                    blocksInterval = false;
                }
            );
        }, 1000 * 3);


        var unconfirmedTransactonsInterval = false;
        setInterval(function () {
            if (unconfirmedTransactonsInterval) {
                return;
            }

            unconfirmedTransactonsInterval = true;
            var p = app.peerprocessor.getAnyPeer();
            var finished = true;

            app.logger.info("Process unconfirmed transactions...");
            async.whilst(function (_break) {
                if (_break) return false; return p;
            }, function (next) {
                p.getUnconfirmedTransactions(function (err, trs) {
                    if (err) {
                        if (p) {
                            //app.logger.error(err);
                            //app.logger.error("Remove ip: " + p.ip);
                            //app.peerprocessor.removePeer(p.ip);
                        }

                        p = app.peerprocessor.getAnyPeer();
                        next(true);
                    } else {
                        var answer = null;

                        try {
                            answer = JSON.parse(trs);
                        } catch (e) {
                            //app.peerprocessor.removePeer(p.ip);
                            p = app.peerprocessor.getAnyPeer();
                            return next(true);
                        }

                        if (answer.success) {
                            async.eachSeries(answer.transactions, function (t, cb) {
                                var tr = new transaction(t.type, t.id, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipientId, t.amount, t.fee, new Buffer(t.signature, 'hex'));

                                if (!tr.verify()) {
                                    return cb("Can't verify transaction: " + tr.getId());
                                }

                                if (app.transactionprocessor.getUnconfirmedTransaction(tr.getId()) != null) {
                                    return cb();
                                }

                                var r = app.transactionprocessor.processTransaction(tr);


                                if (r) {
                                    cb();
                                } else {
                                    cb("Can't process transaction " + tr.getId() + " from " + p.ip);
                                }
                            }, function (err) {
                                if (err) {
                                    app.logger.error(err);
                                    //app.peerprocessor.removePeer(p.ip);
                                    p = app.peerprocessor.getAnyPeer();
                                    return next(true);
                                }

                                next(true);
                            });
                        } else {
                            app.peerprocessor.removePeer(p.ip);
                            p = app.peerprocessor.getAnyPeer();
                            return next(true);
                        }
                    }
                });
            }, function () {
                if (p) {
                    app.logger.info("Unconfirmed transactions processed from " + p.ip);
                }
                unconfirmedTransactonsInterval = false;
            });
        }, 1000 * 3);

        var unconfirmedAddressesInterval = false;
        setInterval(function () {
            if (unconfirmedAddressesInterval) {
                return;
            }

            unconfirmedAddressesInterval = true;
            var p = app.peerprocessor.getAnyPeer();
            var finished = true;

            app.logger.info("Process unconfirmed addresses...");

            async.whilst(function (_break) {
                if (_break) return false; return p;
            }, function (next) {
                p.getUnconfirmedAddresses(function (err, json) {
                    if (err) {
                        //app.logger.error(err);
                        //app.peerprocessor.removePeer(p.ip);
                        p = app.peerprocessor.getAnyPeer();
                        return next(true);
                    } else {
                        var answer = null;

                        try {
                            answer = JSON.parse(json);
                        } catch (e) {
                            //app.peerprocessor.removePeer(p.ip);
                            p = app.peerprocessor.getAnyPeer();
                            return next(true);
                        }

                        if (answer.success) {
                            async.eachSeries(answer.addresses, function (a, cb) {
                                var addr = new address(a.version, a.id, new Buffer(a.generatorPublicKey, 'hex'), new Buffer(a.publicKey, 'hex'), a.timestamp, new Buffer(a.signature, 'hex'), new Buffer(a.accountSignature, 'hex'));

                                if (!addr.verify() || !addr.accountVerify()) {
                                    return cb("Can't verify address: " + addr.id);
                                }

                                if (app.addressprocessor.unconfirmedAddresses[addr.id] != null) {
                                    return cb();
                                }

                                var r = app.addressprocessor.processAddress(addr);
                                if (r) {
                                    cb();
                                } else {
                                    cb("Can't process address: " + a.id);
                                }
                            }, function (err) {
                                if (err) {
                                    //app.peerprocessor.removePeer(p.ip);
                                    p = app.peerprocessor.getAnyPeer();
                                    return next(true);
                                }

                                return next(true);
                            });
                        } else {
                            //app.peerprocessor.removePeer(p.ip);
                            p = app.peerprocessor.getAnyPeer();
                            return next(true);
                        }
                    }
                });
            }, function () {
                if (p) {
                    app.logger.info("Addresses processed from " + p.ip);
                }

                unconfirmedAddressesInterval = false;
            });
        }, 1000 * 3);

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
            while (true) {
                var p = app.peerprocessor.getAnyPeer();
                if (!p) {
                    break;
                }

                p.getNextBlocks(blockId, function (err, blocksJSON) {
                    if (err) {
                        logger.getInstance().info("Error with peer: " + p.id);
                        p = app.peerprocessor.getAnyPeer();
                        break;
                    } else {
                        try {
                            newBlocks = JSON.parse(blocksJSON).blocks;
                        }
                        catch (e) {
                            logger.getInstance().info("Error with peer: " + p.id);
                            p = app.peerprocessor.getAnyPeer();
                            return break;
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

                            continue;
                        } else {
                            logger.getInstance().info("Error with peer: " + p.id);
                            p = app.peerprocessor.getAnyPeer();
                            break;
                        }
                    }
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

            /*app.use(function (req, res, next) {
                var parts = req.url.split('/');
                var urls = parts.filter(function (v) { return (v!=='' && v!=='/') });

                if (urls[0] == "peer") {

                    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                    var p = app.peerprocessor.getPeer(ip);

                    if (!p) {
                        app.logger.info("Check ip as peer: " + ip);
                        var platform = req.headers['platform'] || "",
                            version = parseFloat(req.headers['version']),
                            port = parseInt(req.headers['port']);

                        if (platform.length == 0 || isNaN(version) || version <= 0 || isNaN(port) || port <= 0) {
                            return res.json({ success: false, error: "Invalid headers" });
                        } else {
                            p = new peer(ip, port, platform, version);
                            app.peerprocessor.addPeer(p);
                            req.peer = p;

                            app.logger.info("Peer added: " + ip);
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
            });*/

            if (config.get("serveHttpAPI")) {
                routes(app);
            }

            peerRoutes(app);
        });
    }
});