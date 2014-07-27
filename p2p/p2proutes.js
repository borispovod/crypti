var peer = require("./peer.js"),
    peerprocessor = require("./peerprocessor.js"),
    Constants = require("../Constants.js"),
    Block = require('../block').block.block,
    Transaction = require("../transactions").transaction,
    Address = require("../address").address,
    async = require('async'),
    utils = require("../utils.js"),
    _ = require('underscore'),
    ed = require('ed25519'),
    crypto = require('crypto');

module.exports = function (app) {
    app.get("/peer/getRequests", function (req, res) {
        if (app.synchronizedBlock) {
            return res.json({ success : false });
        }

        app.db.sql.serialize(function () {
            var r  = app.db.sql.prepare("SELECT * FROM peerRequests WHERE lastAliveBlock=$lastAliveBlock");
            r.bind({
                $lastAliveBlock : app.blockchain.getLastBlock().getId()
            });
            r.all(function (err, requests) {
                if (err) {
                    app.logger.error(err.toString(), "error");
                    return res.json({ success : false, error : "SQL error" });
                } else {
                    return res.json({ success : true, requests : requests });
                }
            });
        });
    });

    app.get("/peer/alive", function (req, res) {
        if (!app.synchronizedBlock) {
            return res.json({ success : false, error : "Node not synchronized" });
        }

        var publicKey = req.query.publicKey,
            signature = req.query.signature,
            ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        var request = {
            publicKey : publicKey,
            signature : signature,
            ip : ip
        };

        var account = app.accountprocessor.processRequest(request);

        if (!account) {
            return res.json({ success : false });
        }

        app.db.writePeerRequest(request, function (err) {
            if (err) {
                app.logger.error(err.toString(), "error");
                return res.json({ success : false });
            } else {
                account.lastAliveBlock = app.blockchain.getLastBlock().getId();
                return res.json({ success : true });
            }
        });

/*
        return res.json({ success : true });


        var publicKey = req.query.publicKey,
            timestamp = parseInt(req.query.timestamp),
            signature = req.query.signature,
            ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        app.logger.info("Process peer...");

        if (!publicKey || !timestamp || isNaN(timestamp) || !signature) {
            app.logger.error("Peer parameters missed");
            return res.json({ success : false, error : "Parameters missed" });
        }

        var time = utils.getEpochTime(new Date().getTime()) - 60;
        if (timestamp < time || timestamp > utils.getEpochTime(new Date().getTime())) {
            app.logger.error("Peer timestamp not valid: " + timestamp + "/" + time);
            return res.json({ success : false, error : "Invalid timestamp" });
        }

        var hash = crypto.createHash('sha256').update(timestamp.toString(), 'utf8').digest();
        var verify = ed.Verify(hash, new Buffer(signature, 'hex'), new Buffer(publicKey, 'hex'));

        if (!verify) {
            app.logger.error("Peer has not valid signature");
            return res.json({ success : false, error : "Can't verify signature" });
        }

        var account = app.accountprocessor.getAccountByPublicKey(new Buffer(publicKey, 'hex'));
        if (!account) {
            app.logger.error("Account not found...");
            return res.json({ success : false, error : "Account not found" });
        }

        /*if (account.getEffectiveBalance() <= 0) {
            app.logger.error("Effective balance is empty");
            return res.json({ success : false, error : "Account effective balance is empty" });
        }*/
        /*

        var now = utils.getEpochTime(new Date().getTime());
        var alive = app.accountprocessor.getAliveAccountTime(account.address);

        if (now - alive < 30) {
            app.logger.error("Forging value already added");
            return res.json({ success : false, error : "You already added weight in this 10 seconds" });
        }

        var requests = app.accountprocessor.getRequests(account.address);
        async.forEach(requests, function (item, cb) {
            if (item.timestamp == timestamp) {
                return cb(true);
            }

            /*if ((item.ip == ip && item.publicKey != publicKey) || (item.publicKey == publicKey && item.ip != ip)) {
                return cb(true);
            }*/
        /*

            cb();
        }, function (found) {
            if (found) {
                app.logger.error("Request found");
                return res.json({ success : false, error : "Request with this timestamp already existing "});
            } else {
                var request = {
                    timestamp : timestamp,
                    publicKey : publicKey,
                    signature : signature,
                    time : now
                    //ip : ip
                };

                app.accountprocessor.addRequest(account, request);

                if (account.weight > 0) {
                    account.weight += timestamp / 1000;
                    app.accountprocessor.addAliveAccounts(account, now);
                    return res.json({ success : true });
                } else {
                    account.weight = timestamp / 1000;
                    app.accountprocessor.addAliveAccounts(account, now);
                    return res.json({ success : true });
                }

                // send to another nodes
                app.peerprocessor.sendRequestToAll(request);
            }
        });*/
    });

    /*app.get("/peer/hello", function (req, res) {
        var params = req.query.params || "";

        if (params.length == 0) {
            return res.json({ success : false });
        }

        try {
            params = JSON.parse(params);
        } catch (e) {
            app.logger.error(e);
            return res.json({ success : false });
        }

        if (!params) {
            return res.json({ success : false });
        }

        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        params.ip = ip;

        var timestamp = params.timestamp - 10;
        if (timestamp > utils.getEpochTime(new Date().getTime())) {
            return res.json({ success : false });
        }


        var forger = null;
        if (app.forgerKey) {
            forger = {
                publicKey : app.forgerKey.toString('hex'),
                time: app.mytime
            }
        }

        app.db.sql.serialize(function () {
            var q = app.db.sql.prepare("SELECT * FROM peer WHERE publicKey=$publicKey LIMIT 1");
            q.bind({
                $publicKey : params.publicKey
            });

            q.get(function (err, pr) {
                if (err) {
                    app.logger.error(err);
                    return res.json({ success : false });
                } else if (pr) {
                    q = app.db.sql.prepare("UPDATE peer SET timestamp=$timestamp, blocked=0, ip=$ip WHERE publicKey=$publicKey");
                    q.bind({
                        $timestamp : timestamp,
                        $publicKey : params.publicKey,
                        $ip : params.ip
                    });
                    q.run(function (err) {
                        if (err) {
                            return res.json({ success: false });
                        } else {
                            var p = app.peerprocessor.getPeerByPublicKey(params.publicKey);

                            if (!p) {
                                var p = new peer(params.ip, params.port, params.platform, params.version, timestamp, new Buffer(params.publicKey, 'hex'), false);
                                app.peerprocessor.addPeer(p);
                            } else {
                                p.publicKey = new Buffer(params.publicKey, 'hex');
                                p.timestamp = timestamp;
                                p.blocked = false;
                                p.ip = params.ip;
                            }

                            return res.json({ success : true, forger : forger });
                        }
                    });
                } else {
                    var p = new peer(params.ip, params.port, params.platform, params.version, timestamp, new Buffer(params.publicKey, 'hex'), false);

                    app.db.writePeer(p, function (err) {
                        if (err) {
                            app.logger.error(err);
                            return res.json({ success : false });
                        } else {
                            app.peerprocessor.addPeer(p);
                            return res.json({ success : true, forger : forger });
                        }
                    });
                }
            });
        });
    });*/

    app.get("/peer/getPeers", function (req, res) {
        var peers = app.peerprocessor.getPeersAsArray();
        return res.json({ success : true, peers : peers });
    });

    app.get("/peer/getPeer", function (req, res) {
        var ip = req.query.ip;
        var peer = app.peerprocessor.getPeer(ip);
        return res.json({ success : true, peer : peer });
    });

    app.get("/peer/getInfo", function (req, res) {
        return res.json({ platform : app.info.platform, version : app.info.version });
    });

    /*app.get("/peer/getCumulativeDifficulty", function (req, res) {
        var lastBlock = app.blockchain.getLastBlock();
        return res.json({ success : true, cumulativeDifficulty : lastBlock.cumulativeDifficulty.toString() });
    });*/

    app.get("/peer/getNextBlocksIds", function (req, res) {
        var blockId = req.query.blockId || "";

        if (blockId.length == 0) {
            return res.json({ success : false, error : "Provide block id" });
        }

        var r = app.db.sql.prepare("SELECT id FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=$id LIMIT 1)");
        r.bind({
            $id: blockId
        });
        r.all(function (err, all) {
            if (err) {
                return res.json({ success : false, error : "SQL error" });
            } else {
                return res.json({ success : true, blockIds : all });
            }
        });
    });

    app.get("/peer/getNextBlocks", function (req, res) {
        var blockId = req.query.blockId || "";

        if (blockId.length == 0) {
            return res.json({ success : false, error : "Provide block id" });
        }

        var r = app.db.sql.prepare("SELECT * FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=$id LIMIT 1) ORDER BY height LIMIT 60");
        r.bind({
            $id: blockId
        });

        r.all(function (err, blocks) {
            if (err) {
                app.logger.error("Sqlite error: " + err);
                return res.json({ success : false, error : "SQL error" });
            } else {
                async.eachSeries(blocks, function (item, cb) {
                    app.db.sql.all("SELECT * FROM trs WHERE blockId=$id", {
                        $id: item.id
                    }, function (err, trs) {
                        if (err) {
                            cb(err);
                        } else {
                            item.trs = trs;
                            app.db.sql.all("SELECT * FROM addresses WHERE blockId=$id", {
                                $id : item.id
                            }, function (err, addresses) {
                                if (err) {
                                    cb(err);
                                } else {
                                    item.addresses = addresses;
                                    cb();
                                }
                            });
                        }
                    });
                }, function (err) {
                    if (err) {
                        app.logger.error("SQL error");
                        return res.json({ success : false, error : "SQL error" });
                    } else {
                        return res.json({ success : true, blocks : blocks });
                    }
                });
            }
        })
    });

    app.get('/peer/getUnconfirmedTransactions', function (req, res) {
        var results = [];
        for (var t in app.transactionprocessor.unconfirmedTransactions) {
            results.push(app.transactionprocessor.unconfirmedTransactions[t].toJSON());
        }

        return res.json({ success : true, transactions : results });
    });

    app.get('/peer/getUnconfirmedAddresses', function (req, res) {
        var addresses = [];
        for (var t in app.addressprocessor.unconfirmedAddresses) {
            addresses.push(app.addressprocessor.unconfirmedAddresses[t].toJSON());
        }

        return res.json({ success : true, addresses : addresses });
    });

    /*
    app.get("/peer/getNextBlockIds", function (req, res) {
        var blockId = req.query.blockId || "";

        if (blockId.length == 0) {
            return res.json({ success : false, error : "Provide block id" });
        }

        var blocks = Object.keys(app.blockchain.blocks);
        var index = blocks[blockId];

        if (index < 0) {
            return res.json({ success : false, error : "Block not found" });
        }

        index += 1;
        if (index >= blocks.length) {
            return res.json({ success : true, blockIds : [] });
        }

        var r = blocks.slice(index, -1);

        return res.json({ success : true, blockIds : r });
    });
    */

    /*
    app.get("/peer/getNextBlocks", function (req, res) {
        var blockId = req.query.blockId || "";

        if (blockId.length == 0) {
            return res.json({ success : false, error : "Provide block id" });
        }

        var blocks = Object.keys(app.blockchain.blocks);
        var index = blocks[blockId];

        if (index < 0) {
            return res.json({ success : false, error : "Block not found" });
        }

        index += 1;
        if (index >= blocks.length) {
            return res.json({ success : true, blocks : [] });
        }

        var nextBlocks = [];
        var totalLength = 0;
        for (var i = 0; i < blocks.length; i++) {
            var block = app.blockchain.getBlock(blocks[i]);

            if (totalLength + block.payloadLength + blockHeaderLength > 1048576) {
                break;
            }

            var blockJson = block.toJSON();
            var transactions = [];

            for (var i = 0; i < blockJSON.transactions.length; i++) {
                transactions.push(blockJSON.transactions[i].toJSON());
            }

            blockJSON.transactions = transactions;

            nextBlocks.push(blockJSON);
            totalLength += block.payloadLength + blockHeaderLength;
        }

        return res.json({ success : true, blocks : nextBlocks });
    });*/

    /*app.get("/peer/processUnconfirmedTransaction", function (req, res) {
        var transactions = null;
        try {
            transactions = JSON.parse(req.query.transactions);
        } catch (e) {
            return res.json({ success : false });
        }

        var newTrs = [];
        for (var i = 0; i < transactions.length; i++) {
            var t = transactions[i];
            var transaction = new Transaction(t.type, null, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recepientId, t.amount, t.deadline, t.fee, new Buffer(t.referencedTransaction, 'hex'), new Buffer(t.signature, 'hex'));
            newTrs.push(transaction);
        }

        async.forEach(newTrs, function (item, cb) {
            var r = app.transactionprocess.processTransaction(item);

            if (!r) {
                cb(true);
            } else {
                cb();
            }
        }, function (err) {
            if (err) {
                var peer = req.peer;
                peer.setBlacklisted(true);
            }

            return res.json({ success : true });
        });
    });*/

    app.get("/peer/processUnconfirmedTransaction", function (req, res) {
        var t = null;

        try {
            t = JSON.parse(req.query.transaction);
        } catch (e) {
            return res.json({ success : false, error : "JSON parser error" });
        }

        var tr = new Transaction(t.type, null, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipientId, t.amount, t.fee, new Buffer(t.signature, 'hex'));
        var r = app.transactionprocessor.processTransaction(tr);

        if (r) {
            return res.json({ success : true, accepted : true });
        } else {
            return res.json({ success : false, accepted : false });
        }
    });

    app.get("/peer/processUnconfirmedAddress", function (req, res) {
        var a = null;

        try {
            a = JSON.parse(req.query.address);
        } catch (e) {
            return res.json({ success : false, error : "JSON parse error" });
        }

        var addr = new Address(a.version, a.id, new Buffer(a.generatorPublicKey, 'hex'), new Buffer(a.publicKey, 'hex'), a.timestamp, new Buffer(a.signature, 'hex'), new Buffer(a.accountSignature, 'hex'));
        var r = app.addressprocessor.processAddress(addr);
        if (r) {
            return res.json({ success : true, accepted : true });
        } else {
            return res.json({ success : false, accepted : false });
        }
    });

    app.get("/peer/processBlock", function (req, res) {
        var b = null;
        try {
            b = JSON.parse(req.query.block);
        } catch (e) {
            return res.json({ success : false, accepted : false });
        }

        var block = new Block(b.version, null, b.timestamp, b.previousBlock, [], b.totalAmount, b.totalFee, b.payloadLength, new Buffer(b.payloadHash,'hex'), new Buffer(b.generatorPublicKey, 'hex'), new Buffer(b.generationSignature, 'hex'), new Buffer(b.blockSignature, 'hex'));
        var previousBlock = b.previousBlock;


        var transactions = [];
        for (var i = 0; i < b.transactions.length; i++) {
            var t = b.transactions[i];
            var transaction = new Transaction(t.type, null, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipientId, t.amount, t.fee, new Buffer(t.signature, 'hex'));
            transactions.push(transaction);
        }

        var addresses = [];
        for (var i = 0; i < b.addresses.length; i++) {
            var a = b.addresses[i];
            var addr = new Address(a.version, a.id, new Buffer(a.generatorPublicKey, 'hex'), new Buffer(a.publicKey, 'hex'), a.timestamp, new Buffer(a.signature, 'hex'), new Buffer(a.accountSignature, 'hex'));
            addresses.push(addr);
        }

        block.numberOfTransactions = transactions.length;
        block.numberOfAddresses = addresses.length;

        var buffer = block.getBytes();
        for (var i = 0; i < transactions.length; i++) {
            buffer = Buffer.concat([buffer, transactions[i].getBytes()]);
        }

        for (var i = 0; i < addresses.length; i++) {
            buffer = Buffer.concat([buffer, addresses[i].getBytes()]);
        }

        var r = app.blockchain.pushBlock(buffer);

        return res.json({ success : true, accepted : r });
    });
}