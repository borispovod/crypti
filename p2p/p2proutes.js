var peer = require("./peer.js"),
    peerprocessor = require("./peerprocessor.js"),
    Constants = require("../Constants.js"),
    Block = require('../block').block.block,
    Transaction = require("../transactions").transaction,
    Address = require("../address").address,
    async = require('async'),
    utils = require("../utils.js"),
    _ = require('underscore');

module.exports = function (app) {
    app.get("/peer/hello", function (req, res) {
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

        var timestamp = params.timestamp - 10;
        if (timestamp > utils.getEpochTime(new Date().getTime())) {
            return res.json({ success : false });
        }

        app.db.sql.serialize(function () {
            var q = app.db.sql.prepare("SELECT * FROM peer WHERE publicKey=$publicKey LIMIT 1");
            q.bind({
                $publicKey : params.publicKey
            });

            q.get(function (err, peer) {
                if (err) {
                    app.logger.error(err);
                    return res.json({ success : false });
                } else if (peer) {
                    q = app.db.sql.prepare("UPDATE peer SET timestamp=$timestamp AND blocked=0 AND ip=$ip WHERE publicKey=$publicKey");
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
                            p.publicKey = new Buffer(params.publicKey, 'hex');
                            p.timestamp = timestamp;
                            p.blocked = false;
                            p.ip = params.ip;

                            return res.json({ success : true });
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
                            return res.json({ success : true });
                        }
                    });
                }
            });
        });
    });

    app.get("/peer/getPeers", function (req, res) {
        app.db.sql.serialize(function () {
            app.db.sql.all("SELECT * FROM peer ORDER BY timestamp", function (err, rows) {
               if (err) {
                   return res.json({ success : false, error : "SQL error" });
               }  else {
                   return res.json({ success : true, peers : rows });
               }
            });
        });
        /*
        var peers = app.peerprocessor.getPeersAsArray();
        return res.json({ success : true, peers : peers });
        */
    });

    app.get("/peer/getPeer", function (req, res) {
        var ip = req.query.ip;

        app.db.sql.serialize(function () {
            app.db.sql.get("SELECT * FROM peer WHERE ip=$ip", {
                $ip : ip
            }, function (err, peer) {
                if (err) {
                    return res.json({ success : false, error : "SQL error" });
                } else {
                    return res.json({ success : true, peer : peer });
                }
            });
        });
        /*var ip = req.query.ip;
        var peer = app.peerprocessor.getPeer(ip);
        return res.json({ success : true, peer : peer });*/
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