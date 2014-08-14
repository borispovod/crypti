var peer = require("./peer.js"),
    peerprocessor = require("./peerprocessor.js"),
    Constants = require("../Constants.js"),
    Block = require('../block').block.block,
    Transaction = require("../transactions").transaction,
    async = require('async'),
    utils = require("../utils.js"),
    _ = require('underscore'),
    ed = require('ed25519'),
    crypto = require('crypto'),
    Request = require("../request").request,
    bignum = require('bignum'),
    signature = require('../signature').signature,
    companyconfirmation = require("../company").companyconfirmation;

module.exports = function (app) {
    app.get("/peer/getRequests", function (req, res) {
        if (!app.synchronizedBlocks) {
            return res.json({ success : false });
        }

        var requests = _.map(app.requestprocessor.unconfirmedRequests, function (v) {
            return v;
        });


        return res.json({ success : true, requests : requests });
    });

    app.get("/peer/alive", function (req, res) {
        if (!app.synchronizedBlocks) {
            return res.json({ success : false, error : "Node not synchronized" });
        }

        var ip = req.connection.remoteAddress;

        if (!app.peerprocessor.getPeer(ip)) {
            return res.json({ success : false, peerBlocked : true });
        }

        var request = req.query.request || "";

        if (request.length == 0) {
            return res.json({ success : false });
        }

        try {
            request = JSON.parse(request);
        } catch (e) {
            return res.json({ success : false });
        }

        if (!request.publicKey || !request.lastAliveBlock || !request.signature) {

            return res.json({ success : false });
        }

        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        var r = new Request(null, null, ip, new Buffer(request.publicKey, 'hex'), request.lastAliveBlock, new Buffer(request.signature, 'hex'));

        try {
            var added = app.requestprocessor.processRequest(r, true);
        } catch (e) {
            app.peerprocessor.blockPeer(ip);
            added = false;
        }

        if (added) {
            return res.json({ success : true });
        } else {
            return res.json({ success : false });
        }
    });

    app.get("/peer/getPeers", function (req, res) {
        var peers = app.peerprocessor.getPeersAsArray();

        var ip = req.connection.remoteAddress;
        peers = _.filter(peers, function (v) {
            if (v.ip != ip) {
                return true;
            }
        });

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

    app.get("/peer/getNextBlocksIds", function (req, res) {
        var blockId = req.query.blockId || "";

        if (blockId.length == 0) {
            return res.json({ success : false, error : "Provide block id" });
        }

        if (!app.blockchain.blocks[blockId]) {
            return res.json({ success : false, error : "Block not found" });
        }

        var r = app.db.sql.prepare("SELECT id FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=$id LIMIT 1)");
        r.bind({
            $id: blockId
        });
        r.all(function (err, all) {
            if (err) {
                return res.json({ success : false, error : "SQL error" });
            } else {
                return res.json({ success : true, blockIds : all, previousBlock : app.blockchain.getLastBlock().previousBlock });
            }
        });
    });

    app.get("/peer/getNextBlocks", function (req, res) {
        var blockId = req.query.blockId || "";

        if (blockId.length == 0) {
            return res.json({ success : false, error : "Provide block id" });
        }

        if (!app.blockchain.blocks[blockId]) {
            return res.json({ success : false, error : "Block not found", found : false });
        }

        var r = app.db.sql.prepare("SELECT * FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=$id LIMIT 1) ORDER BY height LIMIT 10");
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
                            async.forEach(trs, function (t, cb) {
                                if (t.type == 2) {
                                    if (t.subtype == 0) {
                                        app.db.sql.get("SELECT * FROM signatures WHERE transactionId=$transactionId", {
                                            $transactionId : t.id
                                        }, function (err, asset) {
                                            if (err) {
                                                cb(err);
                                            } else {
                                                t.asset = asset;
                                                cb();
                                            }
                                        });
                                    } else {
                                        cb();
                                    }
                                } else if (t.type == 3) {
                                    if (t.subtype == 0) {
                                        app.db.sql.get("SELECT * FROM companies WHERE transactionId=$transactionId", {
                                            $transactionId : t.id
                                        }, function (err, asset) {
                                           if (err) {
                                               cb(err);
                                           } else {
                                               t.asset = asset;
                                               cb();
                                           }
                                        });
                                    } else {
                                        cb();
                                    }
                                } else {
                                    cb();
                                }
                            }, function (err) {
                                if (err) {
                                    return cb(err);
                                }

                                item.trs = trs;

                                app.db.sql.all("SELECT * FROM requests WHERE blockId=$id", {
                                    $id : item.id
                                }, function (err, requests) {
                                    if (err) {
                                        cb(err);
                                    }  else {
                                        item.requests = requests;
                                        app.db.sql.all("SELECT * FROM companyconfirmations WHERE blockId=$id", {
                                            $id: item.id
                                        }, function (err, confirmations) {
                                            if (err) {
                                                cb(err);
                                            } else {
                                                item.confirmations = confirmations;
                                                cb();
                                            }
                                        });
                                    }
                                });
                            });
                        }
                    });
                }, function (err) {
                    if (err) {
                        app.logger.error("SQL error");
                        return res.json({ success : false, error : "SQL error" });
                    } else {
                        return res.json({ success : true, blocks : blocks, found : true });
                    }
                });
            }
        })
    });

    app.get('/peer/getUnconfirmedTransactions', function (req, res) {
        if (!app.synchronizedBlocks) {
            return res.json({ success : false, transactions : [] });
        }

        var results = [];
        for (var t in app.transactionprocessor.unconfirmedTransactions) {
            results.push(app.transactionprocessor.unconfirmedTransactions[t].toJSON());
        }

        return res.json({ success : true, transactions : results });
    });

    app.get("/peer/processUnconfirmedTransaction", function (req, res) {
        if (!app.synchronizedBlocks) {
            return res.json({ success : false, accepted : false });
        }

        var ip = req.connection.remoteAddress;

        if (!app.peerprocessor.getPeer(ip)) {
            return res.json({ success : false, peerBlocked : true });
        }

        var t = null;

        try {
            t = JSON.parse(req.query.transaction);
        } catch (e) {
            return res.json({ success : false, error : "JSON parser error" });
        }

        var tr = new Transaction(t.type, null, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipientId, t.amount, t.creationBlockId, new Buffer(t.signature, 'hex'));

        if (t.signSignature) {
            tr.signSignature = new Buffer(t.signSignature, 'hex');
        }

        switch (t.type) {
            case 2:
                switch (t.subtype) {
                    case 0:
                        tr.asset = app.signatureprocessor.fromJSON(t.asset);
                        break;
                }
                break;

            case 3:
                switch (t.subtype) {
                    case 0:
                        tr.asset = app.companyprocessor.fromJSON(t.asset);
                        break;
                }
                break;
        }

        try {
            var r = app.transactionprocessor.processTransaction(tr, true);
        } catch (e) {
            app.peerprocessor.blockPeer(ip);
            r = false;
        }

        if (r) {
            return res.json({ success : true, accepted : true });
        } else {
            return res.json({ success : false, accepted : false });
        }
    });

    app.get("/peer/processBlock", function (req, res) {
        if (!app.synchronizedBlocks) {
            return res.json({ success : false, accepted : false });
        }

        var ip = req.connection.remoteAddress;

        if (!app.peerprocessor.getPeer(ip)) {
            return res.json({ success : false, peerBlocked : true });
        }

        var b = null;
        try {
            b = JSON.parse(req.query.block);
        } catch (e) {
            return res.json({ success : false, accepted : false });
        }

        var block = new Block(b.version, null, b.timestamp, b.previousBlock, [], b.totalAmount, b.totalFee, b.payloadLength, new Buffer(b.payloadHash,'hex'), new Buffer(b.generatorPublicKey, 'hex'), new Buffer(b.generationSignature, 'hex'), new Buffer(b.blockSignature, 'hex'));
        block.requestsLength = b.requestsLength;
        block.generationWeight = b.generationWeight;
        block.numberOfRequests = b.numberOfRequests;
        block.numberOfConfirmations = b.numberOfConfirmations;
        block.confirmationsLength = b.confirmationsLength;

        var previousBlock = b.previousBlock;

        var transactions = [];
        for (var i = 0; i < b.transactions.length; i++) {
            var t = b.transactions[i];
            var transaction = new Transaction(t.type, null, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipientId, t.amount, t.creationBlockId, new Buffer(t.signature, 'hex'));
            if (t.signSignature) {
                transaction.signSignature = new Buffer(t.signSignature, 'hex');
            }

            switch (transaction.type) {
                case 2:
                    switch (transaction.subtype) {
                        case 0:
                            transaction.asset = app.signatureprocessor.fromJSON(t.asset);
                            break;
                    }
                    break;

                case 3:
                    switch (transaction.subtype) {
                        case 0:
                            transaction.asset = app.companyprocessor.fromJSON(t.asset);
                            break;
                    }
                    break;
            }

            transactions.push(transaction);
        }

        var requests = [];
        for (var i = 0; i < b.requests.length; i++) {
            var r = b.requests[i];
            requests.push(new Request(null, null, r.ip, new Buffer(r.publicKey, 'hex'), r.lastAliveBlock, new Buffer(r.signature, 'hex')));
        }

        var confirmations = [];
        for (var i = 0; i < b.confirmations.length; i++) {
            var c = b.confirmations[i];
            confirmations.push(new companyconfirmation(c.companyId, c.verified, c.timestamp, new Buffer(c.signature, 'hex')));
        }

        block.numberOfTransactions = transactions.length;
        block.numberOfRequests = requests.length;

        var buffer = block.getBytes();
        for (var i = 0; i < transactions.length; i++) {
            buffer = Buffer.concat([buffer, transactions[i].getBytes()]);
        }

        for (var i = 0; i < requests.length; i++) {
            buffer = Buffer.concat([buffer, requests[i].getBytes()]);
        }

        for (var i = 0; i < confirmations.length; i++) {
            buffer = Buffer.concat([buffer, confirmations[i].getBytes()]);
        }

        try {
            var r = app.blockchain.pushBlock(buffer, true, true);
        } catch (e) {
            r = false;
            app.peerprocessor.blockPeer(ip);
            this.app.logger.error(e.toString());
        }

        if (r) {
            return res.json({ success: true, accepted: true });
        } else {
            return res.json({ success : false, accepted : false });
        }
    });
}