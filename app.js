var express = require('express'),
    config = require('./config').config,
    configFunctions = {
        readConfig : require("./config").readConfig,
        writeConfig : require("./config").writeConfig
    },
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
    companyconfirmation = require("./company").companyconfirmation,
    requestconfirmation = require("./request").requestconfirmation,
    crypto = require('crypto'),
    doT = require('express-dot'),
    ByteBuffer = require("bytebuffer");

var app = express();

if (process.env.NODE_ENV=="development") {
    app.set('onlyToFile', false);
} else {
    app.set('onlyToFile', true);
}

app.configure(function () {
    app.set("version", config.get("version"));
    app.set("address", config.get("address"));
    app.set('port', config.get('port'));
    app.use(express.bodyParser({limit: '300mb'}));
    app.dbLoaded = false;

    app.set('views', path.join(__dirname, 'public'));
    app.set('view engine', 'html' );
    app.engine('html', doT.__express );

    app.writePassphrase = function (passphrase) {
        try {
            var jsonString = configFunctions.readConfig();

            var json = JSON.parse(jsonString);

            json.forging.secretPhrase = passphrase;
            jsonString = JSON.stringify(json, null, 4);

            configFunctions.writeConfig(jsonString);

            return true;
        } catch (e) {
            app.logger.error("Can't write/read config: " + e);
            return false;
        }
    }

    app.api = {
        whiteList : config.get('api').access.whiteList,
        auth : config.get('api').access.auth
    };

    if (config.get("serveHttpWallet")) {
        app.use(express.static(path.join(__dirname, "public")));
    }

    app.use(express.json());
    app.use(express.urlencoded());

    app.use(function (req, res, next) {
        var url = req.path.split('/');

        var ip = req.connection.remoteAddress;
        var port = config.get('port');

        if (url[1] == 'peer' && app.synchronizedBlocks) {
            var newPeer = new peer(ip, port);
            app.peerprocessor.addPeer(newPeer);
        } else if (url[1] == 'api' || req.path == '' || req.path == '/') {
            if (app.api.whiteList.length > 0) {
                if (app.api.whiteList.indexOf(ip) < 0) {
                    return res.send(401);
                }
            }
        }

        return next();
    });


    if (app.api.auth.user || app.api.auth.password) {
        app.basicAuth = express.basicAuth(app.api.auth.user, app.api.auth.password);
    } else {
        app.basicAuth = function (req, res, next) { return next(); }
    }

    app.use(app.router);
});

async.series([
    function (cb) {
        logger.init("logs.log", config.get('logLevel'), app.get('onlyToFile'));
        logger.getInstance().info("Logger initialized");
        app.logger = logger.getInstance();
        cb();
    },
    function (cb) {
        logger.getInstance().info("Load forging panel configruation");
        app.forgingConfig = config.get("adminPanel");

        if (app.forgingConfig.auth.user || app.forgingConfig.auth.password) {
            app.forgingPanelAuth = express.basicAuth(app.forgingConfig.auth.user, app.forgingConfig.auth.password);
        } else {
            app.forgingPanelAuth = function (req, res, next) { return next (); }
        }

        app.forgingFile = fs.readFileSync(path.join(__dirname, "public", "forging.html"));

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

        if (forgerPassphrase.length === 0) {
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
        app.listen(app.get('port'), app.get('address'), function () {
            logger.getInstance().info("Crypti started: " + app.get("address") + ":" + app.get("port"));
            console.log("Crypti started: " + app.get("address") + ":" + app.get("port"));

            app.get('/', function (req, res) {
                var ip = req.connection.remoteAddress;

                var showLinkToAdminPanel = false;

                if (app.forgingConfig.whiteList.length > 0 && app.forgingConfig.whiteList.indexOf(ip) >= 0) {
                    showLinkToAdminPanel = true;
                }

                if (app.api.whiteList.length > 0) {
                    if (app.api.whiteList.indexOf(ip) < 0) {
                        return res.send(401);
                    } else {
                        if (app.dbLoaded) {
                            res.render('wallet', { showAdmin : showLinkToAdminPanel,  layout : false });
                        } else {
                            res.sendfile(path.join(__dirname, "public", "loading.html"));
                        }
                    }
                } else {
                    if (app.dbLoaded) {
                        res.render('wallet', { showAdmin : showLinkToAdminPanel, layout : false });
                    } else {
                        res.sendfile(path.join(__dirname, "public", "loading.html"));
                    }
                }
            });

            app.get("/api/getLoading", function (req, res) {
                if (app.blockchain.getLastBlock() && app.blocksCount) {
                    return res.json({ success: true, height : app.blockchain.getLastBlock().height, blocksCount : app.blocksCount, loaded : app.dbLoaded });
                } else {
                    return res.json({ success : false });
                }
            });

            app.get("*", function (req, res) {
                return res.redirect('/');
            });

            cb();
        });
    },
    function (cb) {
        logger.getInstance().info("Initializing and scanning database...");
        initDb("./blockchain.db", app, function (err, db) {
            if (err) {
                cb(err);
            } else {
                app.db = db;
                app.db.readAllBlocks(function (err, blocks) {
                    if (err) {
                        cb(err);
                    } else {
                        app.blocksCount = blocks.length;

                        async.eachSeries(blocks, function (item, c) {
                            var b = new block(item.version, null, item.timestamp, item.previousBlock, [], item.totalAmount, item.totalFee, item.payloadLength, item.payloadHash, item.generatorPublicKey, item.generationSignature, item.blockSignature);
                            b.numberOfTransactions = item.numberOfTransactions;
                            b.numberOfRequests = item.numberOfRequests;
                            b.requestsLength = item.requestsLength;
                            b.numberOfConfirmations = item.numberOfConfirmations;
                            b.confirmationsLength = item.confirmationsLength;
                            b.setApp(app);
                            b.height = item.height;
                            var id = b.getId();

                            var numberOfTransactions = b.numberOfTransactions;
                            if (id == genesisblock.blockId) {
                                numberOfTransactions = 13;
                            }

                            var refs = item.refs;

                            var trsIds = "",
                                requestsIds = "",
                                companyconfirmationsIds = "";

                            var bb = ByteBuffer.wrap(refs);

                            var i = 0;
                            for (i = 0; i < numberOfTransactions; i++) {
                                trsIds += bb.readInt64();

                                if (i+1 != numberOfTransactions) {
                                    trsIds += ',';
                                }
                            }

                            for (i = 0; i < b.numberOfRequests; i++) {
                                requestsIds += bb.readInt64();

                                if (i+1 != b.numberOfRequests) {
                                    requestsIds += ',';
                                }
                            }

                            for (i = 0; i < b.numberOfConfirmations; i++) {
                                companyconfirmationsIds += bb.readInt64();

                                if (i+1 != b.numberOfConfirmations) {
                                    companyconfirmationsIds += ',';
                                }
                            }


                            logger.getInstance().info("Load block: " + b.getId() + ", height: " + b.height);

                            var q = app.db.sql.prepare("SELECT * FROM trs WHERE rowid IN (" + trsIds + ")");
                            q.all(function (err, rows) {
                                if (err) {
                                    c(err);
                                } else {
                                    var transactions = [];
                                    async.eachSeries(rows, function (t, _c) {
                                        var tr = new transaction(t.type, t.id, t.timestamp, t.senderPublicKey, t.recipient, t.amount, t.signature);

                                        if (t.signSignature) {
                                            tr.signSignature = t.signSignature;
                                        }

                                        var req = null;
                                        if (tr.type == 2) {
                                            if (tr.subtype === 0) {
                                                req = app.db.sql.prepare("SELECT * FROM signatures WHERE rowid=$rowid");
                                                req.bind({
                                                    $rowid : t.assetId
                                                });
                                                req.get(function (err, asset) {
                                                    if (err) {
                                                        _c(err);
                                                    } else {
                                                        tr.asset = new signature(asset.publicKey, asset.generatorPublicKey, asset.timestamp, asset.signature, asset.generationSignature);
                                                        tr.asset.blockId = asset.blockId;
                                                        tr.asset.transactionId = asset.transactionId;

                                                        transactions.push(tr);
                                                        _c();
                                                    }
                                                });
                                            }
                                        } else if (tr.type == 3) {
                                            if (tr.subtype === 0) {
                                                req = app.db.sql.prepare("SELECT * FROM companies WHERE rowid=$rowid");
                                                req.bind({
                                                    $rowid : t.assetId
                                                });
                                                req.get(function (err, asset) {
                                                    if (err) {
                                                        _c(err);
                                                    } else {
                                                        tr.asset = new company(asset.name, asset.description, asset.domain, asset.email, asset.timestamp, asset.generatorPublicKey, asset.signature);
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

                                        q = app.db.sql.prepare("SELECT * FROM requests WHERE rowid IN (" + requestsIds + ")");
                                        q.all(function (err, rows) {
                                            if (err) {
                                                c(err);
                                            } else {
                                                var requests = [];
                                                async.eachSeries(rows, function (r, _c) {
                                                    var request = new requestconfirmation(r.address);
                                                    request.blockId = r.blockId;
                                                    requests.push(request);
                                                    _c();
                                                }.bind(this), function (err) {
                                                    if (err) {
                                                        return c(err);
                                                    }

                                                    b.requests = requests;

                                                    q = app.db.sql.prepare("SELECT * FROM companyconfirmations WHERE rowid IN (" + companyconfirmationsIds + ")");
                                                    q.all(function (err, rows) {
                                                        if (err) {
                                                            return c(err);
                                                        } else {
                                                            var confirmations = [];
                                                            async.eachSeries(rows, function (conf, _c) {
                                                                var confirmation = new companyconfirmation(conf.companyId, conf.verified, conf.timestamp, conf.signature);
                                                                confirmations.push(confirmation);
                                                                _c();
                                                            }, function () {
                                                                b.confirmations = confirmations;

                                                                var a = false;
                                                                if (b.getId() == genesisblock.blockId) {

                                                                    var r = b.requests[0];
                                                                    app.requestprocessor.confirmedRequests[r.address] = [r];

                                                                    a = b.analyze();

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

                                                                    i = 0;
                                                                    for (i = 0; i < requests.length; i++) {
                                                                        buffer = Buffer.concat([buffer, requests[i].getBytes()]);
                                                                    }

                                                                    for (i = 0; i < confirmations.length; i++) {
                                                                        buffer = Buffer.concat([buffer, confirmations[i].getBytes()]);
                                                                    }

                                                                    try {
                                                                        a = app.blockchain.pushBlock(buffer, false);
                                                                    } catch (e) {
                                                                       a = false;
                                                                       app.logger.error(e.toString());
                                                                    }

                                                                    if (!a) {
                                                                        app.badBlock = {
                                                                            id : b.getId(),
                                                                            height : b.height
                                                                        };

                                                                        logger.getInstance().warn("Bad block found, will remove now...");
                                                                        app.db.deleteFromHeight(app.badBlock.height - 1, function (err) {
                                                                            if (err) {
                                                                                return c(err);
                                                                            }

                                                                            logger.getInstance().warn("Invalid blocks deleted...");

                                                                            app.badBlock = null;
                                                                            delete app.badBlock;

                                                                            return c(true);
                                                                        });
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
                        }, function () {
                            cb();
                        });
                    }
                });
            }
        });
    },
    function (cb) {
        logger.getInstance().debug("Find or add genesis block...");

        blockchain.addGenesisBlock(app, function (err) {
            app.dbLoaded = true;

            if (err) {
               logger.getInstance().debug("Genesis block not added");
               cb(err);
            } else {
                logger.getInstance().debug("Genesis block added...");
                cb();
            }
        });
    },
    function (cb) {
        logger.getInstance().info("Connecting to peers...");
        var peers = config.get("peers").list;
        var blackList = config.get("peers").blackList;
        app.peerprocessor.blackList = blackList;
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
            try {
                if (peersRunning || !app.synchronizedBlocks) {
                    return;
                }

                if (Object.keys(app.peerprocessor.peers).length >= 100) {
                    return;
                }

                peersRunning = true;

                var peers = [];
                peers = app.peerprocessor.getPeersAsArray();
                async.eachSeries(peers, function (p, callback) {
                    app.logger.debug("Get peers from " + p.ip);
                    p.getPeers(function (err, peersJSON) {
                        if (err) {
                            p = app.peerprocessor.getAnyPeer();
                            return callback(true);
                        } else {
                            var ps = peersJSON.peers;

                            if (ps) {
                                app.logger.debug("Process peers");
                                for (var i = 0; i < ps.length; i++) {
                                    if (!ps[i].ip || ps[i].ip == "127.0.0.1") {
                                        continue;
                                    }

                                    var _peer = new peer(ps[i].ip, ps[i].port, ps[i].platform, ps[i].version);

                                    if (!app.peerprocessor.peers[_peer.ip]) {
                                        app.peerprocessor.addPeer(_peer);
                                    }
                                }
                                callback();
                            } else {
                                p = app.peerprocessor.getAnyPeer();
                                return callback();
                            }
                        }
                    });
                }, function (e) {
                    peersRunning = false;
                });
            } catch (e) {
                peersRunning = false;
            }
        }, 1000 * 10);

        var requestsInterval = false;
        setInterval(function () {
            var p = null;
            try {
                if (requestsInterval || !app.synchronizedBlocks) {
                    return;
                }

                requestsInterval = true;
                app.logger.debug("Process requests...");
                var finished = false;

                p = app.peerprocessor.getAnyPeer();

                if (!p) {
                    app.synchronizedRequests = true;
                    requestsInterval = false;
                    return;
                }

                async.whilst(
                    function () {
                        return !finished;
                    },
                    function (next) {
                        app.logger.debug("Get requests from " + p.ip);
                        p.getRequests(function (err, requests) {
                            if (err) {
                                return next(true);
                            } else {
                                var answer = requests;

                                if (answer.success) {
                                    requests = answer.requests;

                                    async.eachSeries(requests, function (item, c) {
                                        var r = app.requestprocessor.fromJSON(item);
                                        r.blockId = null;
                                        delete r.blockId;

                                        var added = false;

                                        try {
                                            added = app.requestprocessor.processRequest(r);
                                        } catch (e) {
                                            app.peerprocessor.blockPeer(p.ip);
                                            added = false;
                                        }

                                        if (!added) {
                                            return c(true);
                                        }

                                        c();
                                    }, function (err) {
                                        if (err) {
                                            return next(true);
                                        } else {
                                            finished = true;
                                            next();
                                        }
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
            } catch (e) {
                if (p) {
                    app.peerprocessor.blockPeer(p.ip);
                }

                return false;
            }
        }, 1000 * 3);

        app.blocksInterval = false;
        setInterval(function () {
            var p = null;
            try {
                if (app.blocksInterval) {
                    return;
                }

                app.blocksInterval = true;
                p = app.peerprocessor.getAnyPeer();

                if (!p || !p.ip) {
                    app.synchronizedBlocks = true;
                    app.blocksInterval = false;
                    return;
                }

                app.logger.warn("Process blocks from peer: " + p.ip);

                var getCommonBlock = function (blockId, peer, cb) {
                    app.blockchain.getCommonBlockId(blockId, peer, function (err, blockId) {
                        cb(err, blockId);
                    });
                };

                var loadBlocks = function (blockId, commonBlock, cb) {
                    var forks = [];
                    var lastAdded = blockId;

                    var inFork = false,
                        forkBlock = null,
                        lastWeight = app.blockchain.getWeight();

                    var finished = false;

                    async.whilst(function () {
                        return !finished;
                    }, function (next) {
                        p.getNextBlocks(blockId, function (err, json) {
                            if (err) {
                                return next(true);
                            } else {
                                if (json.success && json.blocks.length > 0) {
                                    app.syncFromPeer = true;

                                    async.eachSeries(json.blocks, function (item, c) {
                                        var b = new block(item.version, null, item.timestamp, item.previousBlock, [], item.totalAmount, item.totalFee, item.payloadLength, item.payloadHash, item.generatorPublicKey, item.generationSignature, item.blockSignature);
                                        b.numberOfTransactions = item.numberOfTransactions;
                                        b.numberOfRequests = item.numberOfRequests;
                                        b.requestsLength = item.requestsLength;
                                        b.numberOfConfirmations = item.numberOfConfirmations;
                                        b.confirmationsLength = item.confirmationsLength;
                                        b.setApp(app);
                                        b.height = item.height;

                                        var id = b.getId();

                                        var transactions = [];
                                        async.eachSeries(item.trs, function (t, _c) {
                                            var tr = new transaction(t.type, t.id, t.timestamp, t.senderPublicKey, t.recipient, t.amount, t.signature);

                                            if (t.signSignature) {
                                                tr.signSignature = new Buffer(t.signSignature);
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

                                            transactions.push(tr);
                                            _c();
                                        }, function (err) {
                                            if (err) {
                                                return setImmediate(function () {
                                                    return c({ error: true });
                                                });
                                            }

                                            b.transactions = transactions;

                                            var requests = [];
                                            async.eachSeries(item.requests, function (r, _c) {
                                                var request = new requestconfirmation(r.address);
                                                request.blockId = r.blockId;
                                                requests.push(request);
                                                _c();
                                            }.bind(this), function (err) {
                                                if (err) {
                                                    return setImmediate(function () {
                                                        return c({ error: true });
                                                    });
                                                }

                                                b.requests = requests;

                                                var confirmations = [];
                                                async.eachSeries(item.confirmations, function (conf, _c) {
                                                    var confirmation = new companyconfirmation(conf.companyId, conf.verified, conf.timestamp, conf.signature);
                                                    confirmations.push(confirmation);
                                                    _c();
                                                }, function () {
                                                    b.confirmations = confirmations;

                                                    if (app.blockchain.getLastBlock().getId() == b.previousBlock) {
                                                        var a = false;

                                                        var buffer = b.getBytes();

                                                        for (var t in transactions) {
                                                            buffer = Buffer.concat([buffer, transactions[t].getBytes()]);
                                                        }

                                                        var i = 0;
                                                        for (i = 0; i < requests.length; i++) {
                                                            buffer = Buffer.concat([buffer, requests[i].getBytes()]);
                                                        }

                                                        for (i = 0; i < confirmations.length; i++) {
                                                            buffer = Buffer.concat([buffer, confirmations[i].getBytes()]);
                                                        }

                                                        try {
                                                            a = app.blockchain.pushBlock(buffer, true, false, false);
                                                        } catch (e) {
                                                            app.logger.warn("Error in process block: " + e);
                                                            app.peerprocessor.blockPeer(p.ip);
                                                            return setImmediate(function () {
                                                                return c({ error: true });
                                                            });
                                                        }

                                                        if (a) {
                                                            lastAdded = b.getId();
                                                        } else {
                                                            return setImmediate(function () {
                                                                return c({ error: true });
                                                            });
                                                        }

                                                        blockId = b.getId();
                                                        return setImmediate(function () {
                                                            return c();
                                                        });
                                                    } else if (!app.blockchain.blocks[b.getId()]) {
                                                        if (!inFork) {
                                                            forkBlock = lastAdded;
                                                            inFork = true;
                                                            app.logger.info("Process fork...");
                                                            app.blockchain.removeForkedBlocks(commonBlock, function (lastBlock) {
                                                                app.logger.info("Forked blocks removed...");
                                                                blockId = lastBlock;
                                                                lastAdded = lastBlock;
                                                                return setImmediate(function () {
                                                                    return c({ _continue: true });
                                                                });
                                                            });
                                                        } else {
                                                            app.logger.error("Invalid fork...");
                                                            app.blockchain.removeForkedBlocks(forkBlock, function () {
                                                                return setImmediate(function () {
                                                                    return c({ error: true });
                                                                });
                                                            });
                                                        }
                                                    } else {
                                                        return setImmediate(function () {
                                                            return c({ error : true });
                                                        });
                                                    }
                                                });
                                            });
                                        });
                                    }, function (s) {
                                        if (s && s._continue) {
                                            return next();
                                        } else if (s && s.error) {
                                            return next(true);
                                        } else {
                                            if (json.blocks && json.blocks.length === 0) {
                                                if (inFork && lastWeight.gt(app.blockchain.getWeight())) {
                                                    if (!forkBlock) {
                                                        forkBlock = commonBlock;
                                                    }

                                                    app.blockchain.removeForkedBlocks(forkBlock, function () {
                                                        app.logger.info("Remove invalid fork blocks...");
                                                        app.peerprocessor.blockPeer(p.ip);
                                                        return next(true);
                                                    });
                                                } else {
                                                    return next(true);
                                                }
                                            } else {
                                                return next();
                                            }
                                        }
                                    });
                                } else if (!json.success) {
                                    return next(true);
                                } else {
                                    finished = true;
                                    return next();
                                }
                            }
                        });
                    }, function () {
                        app.syncFromPeer = false;
                        cb();
                    });
                };

                p.getWeight(function (err, json) {
                    if (err) {
                        app.blocksInterval = false;
                    } else if (json.success && json.weight && json.version == "0.1.7") {
                        if (app.blockchain.getWeight().lt(bignum(json.weight))) {
                            var commonBlockId = genesisblock.blockId;

                            if (app.blockchain.getLastBlock().getId() != commonBlockId) {
                                app.blockchain.getMilestoneBlockId(p, function (err, blockId) {
                                    if (err || !blockId) {
                                        app.blocksInterval = false;
                                    } else {
                                        commonBlockId = blockId;
                                        getCommonBlock(commonBlockId, p, function (err, blockId) {
                                            if (err || !blockId) {
                                                app.blocksInterval = false;
                                            } else {
                                                commonBlockId = blockId;

                                                if (!app.blockchain.blocks[commonBlockId]) {
                                                    app.logger.info("Common block not found in blockchain: " + p.ip + " / " + commonBlockId);
                                                    app.synchronizedBlocks = true;
                                                    app.blocksInterval = false;
                                                } else {
                                                    app.logger.info("Load blocks from: " + p.ip + " / " + commonBlockId);
                                                    loadBlocks(commonBlockId, commonBlockId, function () {
                                                        app.synchronizedBlocks = true;
                                                        app.blocksInterval = false;
                                                    });
                                                }
                                            }
                                        });
                                    }
                                });
                            } else {
                                getCommonBlock(commonBlockId, p, function (err, blockId) {
                                    if (err || !blockId) {
                                        app.blocksInterval = false;
                                    } else {
                                        commonBlockId = blockId;

                                        if (!app.blockchain.blocks[commonBlockId]) {
                                            app.logger.info("Common block not found in blockchain: " + p.ip + " / " + commonBlockId);
                                            app.synchronizedBlocks = true;
                                            app.blocksInterval = false;
                                        } else {
                                            app.logger.info("Load blocks from: " + p.ip);
                                            loadBlocks(commonBlockId, commonBlockId, function () {
                                                app.synchronizedBlocks = true;
                                                app.blocksInterval = false;
                                            });
                                        }
                                    }
                                });
                            }
                        } else {
                            app.synchronizedBlocks = true;
                            app.blocksInterval = false;
                        }
                    } else {
                        app.synchronizedBlocks = true;
                        app.blocksInterval = false;
                    }
                });
            } catch (e) {
                app.syncFromPeer = false;
                app.logger.warn("Exception: " + e);

                if (p) {
                    app.logger.warn("Block peer: " + p.ip);
                    app.peerprocessor.blockPeer(p.ip);
                }

                app.blocksInterval = false;
            }
        }, 1000 * 15);


        var unconfirmedTransactonsInterval = false;
        setInterval(function () {
            try {
                if (unconfirmedTransactonsInterval || !app.synchronizedBlocks) {
                    return;
                }

                unconfirmedTransactonsInterval = true;
                var p = app.peerprocessor.getAnyPeer();

                if (!p) {
                    unconfirmedTransactonsInterval = false;
                    return;
                }

                var finished = false;

                app.logger.debug("Process unconfirmed transactions...");
                async.whilst(function () {
                    return !finished;
                }, function (next) {
                    p.getUnconfirmedTransactions(function (err, trs) {
                        if (err) {
                            p = app.peerprocessor.getAnyPeer();
                            next(true);
                        } else {
                            var answer = trs;
                            if (answer.success) {
                                async.eachSeries(answer.transactions, function (t, cb) {
                                    var tr = new transaction(t.type, t.id, t.timestamp, t.senderPublicKey, t.recipientId, t.amount, t.signature);


                                    if (t.signSignature) {
                                        tr.signSignature = new Buffer(t.signSignature);
                                    }

                                    if (app.transactionprocessor.getUnconfirmedTransaction(tr.getId()) !== null) {
                                        return cb();
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

                                    var r = false;

                                    try {
                                        r = app.transactionprocessor.processTransaction(tr);
                                    } catch (e) {
                                        app.peerprocessor.blockPeer(p.ip);
                                        r = false;
                                    }

                                    if (r) {
                                        cb();
                                    } else {
                                        cb("Can't process transaction " + tr.getId() + " from " + p.ip);
                                    }
                                }, function (err) {
                                    if (err) {
                                        return next(true);
                                    }

                                    finished = true;
                                    return next();
                                });
                            } else {
                                return next(true);
                            }
                        }
                    });
                }, function (err) {
                    if (p) {
                        app.logger.debug("Unconfirmed transactions processed from " + p.ip);
                    }

                    unconfirmedTransactonsInterval = false;
                });
            } catch (e) {
                if (p) {
                    app.peerprocessor.blockPeer(p.ip);
                }

                unconfirmedTransactonsInterval = false;
            }
        }, 1000 * 3);

        cb();
    }
], function (err) {
    if (err) {
        logger.getInstance().info("Crypti stopped!");
        logger.getInstance().error("Error: " + err);
    } else {
        logger.getInstance().info("API/P2P routes initializing...");

        for (var i = 0; i < app.routes.get.length; i++) {
            var route = app.routes.get[i];
            if (route.path == '*') {
                app.routes.get.splice(i, 1);
                break;
            }
        }

        if (config.get("serveHttpAPI")) {
            routes(app);
        }

        peerRoutes(app);

        app.get("*", function (req, res) {
            res.redirect('/');
        });

        logger.getInstance().info("Initializing done!");
    }
});
