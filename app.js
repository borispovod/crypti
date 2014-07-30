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
    requestprocessor = require("./request").requestprocessor,
    Request = require('./request').request,
    utils = require("./utils.js"),
    _ = require('underscore'),
    bignum = require('bignum');

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
        logger.getInstance().info("Initialize request processor...");
        app.requestprocessor = new requestprocessor();
        app.requestprocessor.setApp(app);
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
                            b.numberOfRequests = item.numberOfRequests;
                            b.addressesLength = item.addressesLength;
                            b.requestsLength = item.requestsLength;
                            b.generationWeight = bignum(item.generationWeight);
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

                                                    q = app.db.sql.prepare("SELECT * FROM requests WHERE blockId=?");
                                                    q.bind(id);
                                                    q.all(function (err, rows) {
                                                       if (err) {
                                                           c(err);
                                                       }  else {
                                                           var requests = [];
                                                           async.eachSeries(rows, function (r, _c) {
                                                               var request = new Request(null, r.blockId, r.ip, new Buffer(r.publicKey, 'hex'), r.lastAliveBlock, new Buffer(r.signature, 'hex'));
                                                               var address = app.accountprocessor.getAccountByPublicKey(request.publicKey).address;
                                                               requests.push(request);
                                                               app.requestprocessor.unconfirmedRequests[address] = request;
                                                               _c();
                                                           }.bind(this), function (err) {
                                                              if (err) {
                                                                  return _c(err);
                                                              }

                                                               b.requests = requests;

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

                                                                   for (var i = 0; i < requests.length; i++) {
                                                                       buffer = Buffer.concat([buffer, requests[i].getBytes()]);
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

            cb();
        });
    },
    function (cb) {
        logger.getInstance().info("Starting intervals...");
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
                                   var r = app.requestprocessor.fromJSON(item);
                                   delete r.blockId;

                                   var added = app.requestprocessor.processRequest(r);
                                   c();
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
                                    b.numberOfRequests = item.numberOfRequests;
                                    b.addressesLength = item.addressesLength;
                                    b.requestsLength = item.requestsLength;
                                    b.generationWeight = bignum(item.generationWeight);
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

                                            var requests = [];
                                            async.eachSeries(item.requests, function (r, _c) {
                                                var request = new Request(null, r.blockId, r.ip, new Buffer(r.publicKey, 'hex'), r.lastAliveBlock, new Buffer(r.signature, 'hex'));
                                                var address = app.accountprocessor.getAccountByPublicKey(request.publicKey).address;
                                                requests.push(request);

                                                if (!app.requestprocessor.unconfirmedRequests[address]) {
                                                    app.requestprocessor.unconfirmedRequests[address] = request;
                                                }
                                                _c();
                                            }.bind(this), function (err) {
                                                if (err) {
                                                    return _c(err);
                                                }

                                                b.requests = requests;
                                                b.numberOfTransactions = transactions.length;
                                                b.numberOfAddresses = Object.keys(addresses).length;
                                                b.numberOfRequests = requests.length;

                                                var buffer = b.getBytes();

                                                for (var t in transactions) {
                                                    buffer = Buffer.concat([buffer, transactions[t].getBytes()]);
                                                }

                                                for (var addr in addresses) {
                                                    buffer = Buffer.concat([buffer, addresses[addr].getBytes()]);
                                                }

                                                for (var i = 0; i < requests.length; i++) {
                                                    buffer = Buffer.concat([buffer, requests[i].getBytes()]);
                                                }

                                                var a = app.blockchain.pushBlock(buffer);

                                                if (!a) {
                                                    c("Can't process block: " + b.getId());
                                                } else {
                                                    c();
                                                }
                                            });
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

        cb();
    }
], function (err) {
    if (err) {
        logger.getInstance().info("Crypti stopped!");
        logger.getInstance().error("Error: " + err);
    } else {
        app.listen(app.get('port'), app.get('address'), function () {
            logger.getInstance().info("Crypti started: " + app.get("address") + ":" + app.get("port"));

            if (config.get("serveHttpAPI")) {
                routes(app);
            }

            peerRoutes(app);

            app.get("*", function (req, res) {
                res.redirect('/');
            });
        });
    }
});