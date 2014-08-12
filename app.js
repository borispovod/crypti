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
    bignum = require('bignum'),
    signatureprocessor = require('./signature').signatureprocessor,
    signature = require('./signature').signature,
    companyprocessor = require("./company").companyprocessor,
    company = require("./company").company,
    companyconfirmation = require("./company").companyconfirmation;

var app = express();

if (process.env.PRODUCTION) {
    process.on('uncaughtException', function (exception) {
        console.log(exception);
    });
}


if (process.env.NODE_ENV=="development") {
    app.set('onlyToFile', false);
} else {
    app.set('onlyToFile', true);
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

    app.use(function (req, res, next) {
        var url = req.path.split('/');

        if (url[1] == 'peer' && app.synchronizedBlocks) {
            var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            var port = config.get('port');

            var newPeer = new peer(ip, port);
            app.peerprocessor.addPeer(newPeer);
        }

        next();
    });


    app.use(app.router);
});

app.configure("development", function () {
    app.use(express.logger('dev'));
    app.use(express.errorHandler());
});


async.series([
    function (cb) {
        logger.init("logs.log", app.get('onlyToFile'));
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
        logger.getInstance().info("Initializing company processor...");
        app.companyprocessor = new companyprocessor();
        app.companyprocessor.setApp(app);
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
        logger.getInstance().info("Initialize signature processor...");
        app.signatureprocessor = new signatureprocessor();
        app.signatureprocessor.setApp(app);
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
        app.synchronizedBlocks = false;
        app.synchronizedPeers = false;
        app.synchronizedRequests = false;

        logger.getInstance().info("Initialize forger...");
        // get public key

        var forgerPassphrase = config.get("forging");//.secretPhrase;

        if (!forgerPassphrase) {
            logger.getInstance().info("Provide secret phrase to start forging...");
            console.log("Provide secret phrase to start forging...");
            return cb();
        }

        forgerPassphrase = forgerPassphrase.secretPhrase;

        if (forgerPassphrase.length == 0) {
            logger.getInstance().info("Provide secret phrase to start forging...");
            console.log("Provide secret phrase to start forging...");
            return cb();
        }

        if (forgerPassphrase && forgerPassphrase.length > 0) {
            var keypair = app.accountprocessor.getKeyPair(forgerPassphrase);
            app.forgerKey = keypair;
            app.mytime = utils.getEpochTime(new Date().getTime());
            app.forgerAccountId = app.accountprocessor.getAddressByPublicKey(app.forgerKey.publicKey);

            logger.getInstance().info("Forger public key: " + keypair.publicKey.toString('hex'));
            logger.getInstance().info("Forger account: " + app.forgerAccountId);
            logger.getInstance().info("Forging enabled...");
            console.log("Forging enabled...");

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
                            b.numberOfRequests = item.numberOfRequests;
                            b.requestsLength = item.requestsLength;
                            b.generationWeight = bignum(item.generationWeight);
                            b.numberOfConfirmations = item.numberOfConfirmations;
                            b.confirmationsLength = item.confirmationsLength;
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
                                        var tr = new transaction(t.type, t.id, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipient, t.amount, t.creationBlockId, new Buffer(t.signature, 'hex'));

                                        if (t.signSignature) {
                                            tr.signSignature = new Buffer(t.signSignature, 'hex');
                                        }

                                        if (tr.type == 2) {
                                            if (tr.subtype == 0) {
                                                var req = app.db.sql.prepare("SELECT * FROM signatures WHERE blockId=$blockId AND transactionId=$transactionId");
                                                req.bind({
                                                    $blockId: id,
                                                    $transactionId: t.id
                                                });
                                                req.get(function (err, asset) {
                                                    if (err) {
                                                        _c(err);
                                                    } else {
                                                        tr.asset = new signature(new Buffer(asset.publicKey, 'hex'), new Buffer(asset.generatorPublicKey, 'hex'), asset.timestamp, new Buffer(asset.signature, 'hex'), new Buffer(asset.generationSignature, 'hex'));
                                                        tr.asset.blockId = asset.blockId;
                                                        tr.asset.transactionId = asset.transactionId;

                                                        transactions.push(tr);
                                                        _c();
                                                    }
                                                });
                                            }
                                        } else if (tr.type == 3) {
                                            if (tr.subtype == 0) {
                                                var req = app.db.sql.prepare("SELECT * FROM companies WHERE blockId=$blockId AND transactionId=$transactionId");
                                                req.bind({
                                                    $blockId: id,
                                                    $transactionId: t.id
                                                });
                                                req.get(function (err, asset) {
                                                    if (err) {
                                                        _c(err);
                                                    } else {
                                                        tr.asset = new company(asset.name, asset.description, asset.domain, asset.email, asset.timestamp, new Buffer(asset.generatorPublicKey, 'hex'), new Buffer(asset.signature, 'hex'));
                                                        tr.asset.blockId = asset.blockId;
                                                        tr.asset.transactionId = asset.transactionId;

                                                        transactions.push(tr);
                                                        _c();
                                                    }
                                                });
                                            } else {
                                                transactions.push(tr);
                                                _c();
                                            }
                                        } else {
                                            transactions.push(tr);
                                            _c();
                                        }
                                    }, function (err) {
                                        if (err) {
                                            return c(err);
                                        }

                                        b.transactions = transactions;

                                        q = app.db.sql.prepare("SELECT * FROM requests WHERE blockId=?");
                                        q.bind(id);
                                        q.all(function (err, rows) {
                                            if (err) {
                                                c(err);
                                            } else {
                                                var requests = [];
                                                async.eachSeries(rows, function (r, _c) {
                                                    var request = new Request(null, r.blockId, r.ip, new Buffer(r.publicKey, 'hex'), r.lastAliveBlock, new Buffer(r.signature, 'hex'));
                                                    var address = app.accountprocessor.getAddressByPublicKey(request.publicKey);
                                                    requests.push(request);
                                                    _c();
                                                }.bind(this), function (err) {
                                                    if (err) {
                                                        return c(err);
                                                    }

                                                    b.requests = requests;

                                                    q = app.db.sql.prepare("SELECT * FROM companyconfirmations WHERE blockId=?");
                                                    q.bind(id);
                                                    q.all(function (err, rows) {
                                                        if (err) {
                                                            return c(err);
                                                        } else {
                                                            var confirmations = [];
                                                            async.eachSeries(rows, function (conf, _c) {
                                                                var confirmation = new companyconfirmation(conf.companyId, conf.verified, conf.timestamp, new Buffer(conf.signature, 'hex'));
                                                                confirmations.push(confirmation);
                                                                _c();
                                                            }, function () {
                                                                b.confirmations = confirmations;

                                                                if (b.getId() == genesisblock.blockId) {

                                                                    var r = b.requests[0];

                                                                    if (r.getId() == genesisblock.genesisRequest) {
                                                                        app.requestprocessor.confirmedRequests[app.accountprocessor.getAddressByPublicKey(r.publicKey)] = [r];
                                                                    }


                                                                    var a = b.analyze();

                                                                    if (!a) {
                                                                        c("Can't process block: " + b.getId());
                                                                    } else {
                                                                        app.blockchain.blocks[b.getId()] = b;
                                                                        app.blockchain.lastBlock = b.getId();

                                                                        c();
                                                                    }
                                                                } else {
                                                                    var buffer = b.getBytes();

                                                                    for (var t in transactions) {
                                                                        buffer = Buffer.concat([buffer, transactions[t].getBytes()]);
                                                                    }

                                                                    for (var i = 0; i < requests.length; i++) {
                                                                        buffer = Buffer.concat([buffer, requests[i].getBytes()]);
                                                                    }

                                                                    for (var i = 0; i < confirmations.length; i++) {
                                                                        buffer = Buffer.concat([buffer, confirmations[i].getBytes()]);
                                                                    }

                                                                    try {
                                                                        var a = app.blockchain.pushBlock(buffer);
                                                                    } catch (e) {
                                                                        a = null;
                                                                        app.logger.error(e.toString());
                                                                    }

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
        logger.getInstance().info("Starting intervals...");

        var peersRunning = false;
        setInterval(function () {
            if (peersRunning || !app.synchronizedBlocks) {
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
            if (requestsInterval || !app.synchronizedBlocks) {
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

                                   try {
                                       var added = app.requestprocessor.processRequest(r);
                                   } catch (e) {
                                       added = false;
                                   }

                                   if (!added) {

                                   }

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
                function (_break) { if (_break) {if (_break.error || _break.syncrhonized) return false;} return p; },
                function (next) {
                    app.logger.info("From ip: " + p.ip);
                    p.getNextBlocks(app.blockchain.getLastBlock().getId(), function (err, blocks) {
                        if (err) {
                            if (p) {
                                return next({ error : true });
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
                                return next({ error : true });
                            }

                            if (answer.success) {
                                async.eachSeries(answer.blocks, function (item, c) {
                                    var b = new block(item.version, null, item.timestamp, item.previousBlock, [], item.totalAmount, item.totalFee, item.payloadLength, new Buffer(item.payloadHash, 'hex'), new Buffer(item.generatorPublicKey, 'hex'), new Buffer(item.generationSignature, 'hex'), new Buffer(item.blockSignature, 'hex'));
                                    b.numberOfTransactions = item.numberOfTransactions;
                                    b.numberOfRequests = item.numberOfRequests;
                                    b.requestsLength = item.requestsLength;
                                    b.generationWeight = bignum(item.generationWeight);
                                    b.numberOfConfirmations = item.numberOfConfirmations;
                                    b.confrimationsLength = item.confirmationsLength;
                                    b.setApp(app);
                                    b.height = item.height;
                                    var id = b.getId();

                                    logger.getInstance().info("Load block from peer: " + b.getId() + ", height: " + b.height);
                                    var transactions = [];
                                    async.eachSeries(item.trs, function (t, _c) {
                                        var tr = new transaction(t.type, t.id, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipient, t.amount, t.creationBlockId, new Buffer(t.signature, 'hex'));

                                        if (t.signSignature) {
                                            tr.signSignature = new Buffer(t.signSignature, 'hex');
                                        }

                                        switch (tr.type) {
                                            case 2:
                                                switch (tr.subtype) {
                                                    case 0:
                                                        tr.asset = app.signatureprocessor.fromJSON(t.asset);
                                                        break;
                                                }
                                                break;

                                            case 3:
                                                switch (tr.subtype) {
                                                    case 0:
                                                        tr.asset = app.companyprocessor.fromJSON(t.asset);
                                                        break;
                                                }
                                                break;
                                        }

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

                                        var requests = [];
                                        async.eachSeries(item.requests, function (r, _c) {
                                            var request = new Request(null, r.blockId, r.ip, new Buffer(r.publicKey, 'hex'), r.lastAliveBlock, new Buffer(r.signature, 'hex'));
                                            var address = app.accountprocessor.getAddressByPublicKey(request.publicKey);
                                            requests.push(request);
                                            _c();
                                        }.bind(this), function (err) {
                                            if (err) {
                                                return _c(err);
                                            }

                                            b.requests = requests;

                                            var confirmations = [];
                                            async.eachSeries(item.confirmations, function (conf, _c) {
                                                var confirmation = new companyconfirmation(conf.companyId, conf.verified, conf.timestamp, new Buffer(conf.signature, 'hex'));
                                                confirmations.push(confirmation);
                                                _c();
                                            }, function () {

                                                var buffer = b.getBytes();

                                                for (var t in transactions) {
                                                    buffer = Buffer.concat([buffer, transactions[t].getBytes()]);
                                                }

                                                for (var i = 0; i < requests.length; i++) {
                                                    buffer = Buffer.concat([buffer, requests[i].getBytes()]);
                                                }

                                                for (var i = 0; i < confirmations.length; i++) {
                                                    buffer = Buffer.concat([buffer, confirmations[i].getBytes()]);
                                                }

                                                try {
                                                    var checkUnconfirmed = app.synchronizedBlocks;
                                                    var a = app.blockchain.pushBlock(buffer, false, checkUnconfirmed);
                                                } catch (e) {
                                                    a = null;
                                                    app.logger.error(e.toString());
                                                }

                                                if (!a) {
                                                    app.peerprocessor.blockPeer(p.ip);
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
                                        app.peerprocessor.blockPeer(p.ip);
                                        p = app.peerprocessor.getAnyPeer();
                                        return next({error : true });
                                    }

                                    app.logger.info("Processed blocks from " + p.ip);

                                    if (answer.blocks && answer.blocks.length > 0) {
                                        next();
                                    } else {
                                        next({ error : false, syncrhonized : true });
                                    }
                                });
                            } else {
                                app.peerprocessor.blockPeer(p.ip);
                                p = app.peerprocessor.getAnyPeer();
                                next({ error : true });
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
            if (unconfirmedTransactonsInterval || app.synchronizedBlocks) {
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
                            app.peerprocessor.blockPeer(p.ip);
                            p = app.peerprocessor.getAnyPeer();
                            return next(true);
                        }

                        if (answer.success) {
                            async.eachSeries(answer.transactions, function (t, cb) {
                                var tr = new transaction(t.type, t.id, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipientId, t.amount, t.creationBlockId, new Buffer(t.signature, 'hex'));


                                if (t.signSignature) {
                                    tr.signSignature = new Buffer(t.signSignature, 'hex');
                                }

                                if (!tr.verify()) {
                                    return cb("Can't verify transaction: " + tr.getId());
                                }

                                if (app.transactionprocessor.getUnconfirmedTransaction(tr.getId()) != null) {
                                    return cb();
                                }

                                switch (tr.type) {
                                    case 2:
                                        switch (tr.subtype) {
                                            case 0:
                                                console.log("here");
                                                tr.asset = app.signatureprocessor.fromJSON(t.asset);
                                                break;
                                        }
                                        break;

                                    case 3:
                                        switch (tr.subtype) {
                                            case 0:
                                                tr.asset = app.companyprocessor.fromJSON(t.asset);
                                                break;
                                        }
                                        break;
                                }

                                try {
                                    var r = app.transactionprocessor.processTransaction(tr);
                                } catch (e) {
                                    r = false;
                                }

                                if (r) {
                                    cb();
                                } else {
                                    app.peerprocessor.blockPeer(p.ip);
                                    cb("Can't process transaction " + tr.getId() + " from " + p.ip);
                                }
                            }, function (err) {
                                if (err) {
                                    app.logger.error(err);
                                    //app.peerprocessor.removePeer(p.ip);
                                    app.peerprocessor.blockPeer(p.ip);
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


        cb();
    }
], function (err) {
    if (err) {
        logger.getInstance().info("Crypti stopped!");
        logger.getInstance().error("Error: " + err);
    } else {
        app.listen(app.get('port'), app.get('address'), function () {
            logger.getInstance().info("Crypti started: " + app.get("address") + ":" + app.get("port"));
            console.log("Crypti started: " + app.get("address") + ":" + app.get("port"));

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
