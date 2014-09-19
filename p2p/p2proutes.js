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
    companyconfirmation = require("../company").companyconfirmation,
    requestconfirmation = require('../request').requestconfirmation,
    ByteBuffer = require('bytebuffer'),
    genesisblock = require('../block').genesisblock;

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

    app.get('/peer/getWeight', function (req, res) {
        if (!app.synchronizedBlocks) {
            return res.json({ success : false });
        }

        return res.json({ success : true, weight : app.blockchain.getWeight().toString() });
    });


    app.get('/peer/getMilestoneBlocks', function (req, res) {
        if (!app.synchronizedBlocks) {
            return res.json({ success : false, error : "Not synchronized" });
        }

        try {
            var lastBlock = req.query.lastBlock,
                lastMilestoneBlockId = req.query.lastMilestoneBlockId;

            if (lastBlock == "null") {
                lastBlock = null;
            }

            if (lastMilestoneBlockId == "null") {
                lastMilestoneBlockId = null;
            }

            var ip = req.connection.remoteAddress;

            if (lastBlock == app.blockchain.getLastBlock().getId() || app.blockchain.blocks[lastBlock]) {
                var isLast = app.blockchain.getLastBlock().getId() == lastBlock;

                return res.json({ success: true, milestoneBlockIds: [lastBlock], last: isLast });
            }

            var milestoneBlockIds = [];

            var blockId;
            var height;
            var jump;
            var limit;

            if (lastMilestoneBlockId != null) {
                var lastMilestoneBlock = app.blockchain.blocks[lastMilestoneBlockId];

                if (lastMilestoneBlock == null) {
                    return res.json({ success: false, error : "Not found lastMilestoneBlock" });
                }

                height = lastMilestoneBlock.height;
                jump = Math.min(1440, app.blockchain.getLastBlock().height - height);
                height = Math.max(height - jump, 0);
                limit = 10;
            } else if (lastBlock != null) {
                height = app.blockchain.getLastBlock().height;
                jump = 10;
                limit = 10;
            } else {
                app.peerprocessor.blockPeer(ip);
                return res.json({ success: false, error : "Data not found" });
            }

            blockId = app.blockchain.getBlockIdAtHeight(height);

            while (height > 0 && limit-- > 0) {
                milestoneBlockIds.push(blockId);
                blockId = app.blockchain.getBlockIdAtHeight(height);
                height = height - jump;
            }

            return res.json({ success: true, milestoneBlockIds: milestoneBlockIds, last: false });
        } catch (e) {
            return res.json({ success : false, error : "Exception" });
        }
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

        try {

            if (request.length == 0) {
                return res.json({ success: false });
            }

            try {
                request = JSON.parse(request);
            } catch (e) {
                return res.json({ success: false });
            }

            if (!request.publicKey || !request.lastAliveBlock || !request.signature) {

                return res.json({ success: false });
            }

            var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

            try {
                var r = new Request(null, null, ip, request.publicKey, request.lastAliveBlock, request.signature);
            } catch (e) {
                return res.json({ success: false, error: "JSON parser error" });
            }

            try {
                var added = app.requestprocessor.processRequest(r, true);
            } catch (e) {
                app.peerprocessor.blockPeer(ip);
                added = false;
            }

            if (added) {
                return res.json({ success: true });
            } else {
                return res.json({ success: false });
            }
        } catch (e) {
            app.peerprocessor.blockPeer(ip);
            return res.json({ success : false, accepted : false });
        }
    });

    app.get("/peer/getPeers", function (req, res) {
        var peers = app.peerprocessor.getPeersAsArray();

        var ip = req.connection.remoteAddress;
        peers = _.filter(peers, function (v) {
            if (v.ip != ip && !v.isNat) {
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

    app.get("/peer/getNextBlockIds", function (req, res) {
        try {
            var blockId = req.query.blockId || "";

            if (blockId.length == 0) {
                return res.json({ success: false, error: "Provide block id" });
            }

            if (!app.blockchain.blocks[blockId]) {
                return res.json({ success: false, error: "Block not found" });
            }

            var r = app.db.sql.prepare("SELECT id FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=$id LIMIT 1) ORDER BY height LIMIT 60");
            r.bind({
                $id: blockId
            });
            r.all(function (err, all) {
                if (err) {
                    return res.json({ success: false, error: "SQL error" });
                } else {
                    return res.json({ success: true, blockIds: all, previousBlock: app.blockchain.getLastBlock().previousBlock });
                }
            });
        } catch (e) {
            app.logger.error(e);
            return res.json({ success : false });
        }
    });

    app.get("/peer/getNextBlocks", function (req, res) {
        try {
            var blockId = req.query.blockId || "";

            if (blockId.length == 0) {
                return res.json({ success: false, error: "Provide block id" });
            }

            if (!app.blockchain.blocks[blockId]) {
                return res.json({ success: false, error: "Block not found", found: false });
            }

            var r = app.db.sql.prepare("SELECT * FROM blocks WHERE height > (SELECT height FROM blocks WHERE id=$id LIMIT 1) ORDER BY height LIMIT 60");
            r.bind({
                $id: blockId
            });

            r.all(function (err, blocks) {
                if (err) {
                    app.logger.error("Sqlite error: " + err);
                    return res.json({ success: false, error: "SQL error" });
                } else {
                    async.eachSeries(blocks, function (item, cb) {
                        var refs = item.refs;

                        var numberOfTransactions = item.numberOfTransactions;
                        if (item.id == genesisblock.blockId) {
                            numberOfTransactions = 13;
                        }

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

                        for (i = 0; i < item.numberOfRequests; i++) {
                            requestsIds += bb.readInt64();

                            if (i+1 != item.numberOfRequests) {
                                requestsIds += ',';
                            }
                        }

                        for (i = 0; i < item.numberOfConfirmations; i++) {
                            companyconfirmationsIds += bb.readInt64();

                            if (i+1 != item.numberOfConfirmations) {
                                companyconfirmationsIds += ',';
                            }
                        }


                        app.db.sql.all("SELECT * FROM trs WHERE rowid IN (" + trsIds + ")", function (err, trs) {
                            if (err) {
                                cb(err);
                            } else {
                                async.forEach(trs, function (t, cb) {
                                    if (t.type == 2) {
                                        if (t.subtype == 0) {
                                            app.db.sql.get("SELECT * FROM signatures WHERE rowid=$rowid", {
                                                $rowid : t.assetId
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
                                            app.db.sql.get("SELECT * FROM companies WHERE rowid=$rowid", {
                                                $rowid : t.assetId
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

                                    app.db.sql.all("SELECT * FROM requests WHERE rowid IN (" + requestsIds + ")", function (err, requests) {
                                        if (err) {
                                            cb(err);
                                        } else {
                                            item.requests = requests;
                                            app.db.sql.all("SELECT * FROM companyconfirmations WHERE rowid IN (" + companyconfirmationsIds + ")", function (err, confirmations) {
                                                if (err) {
                                                    cb(err);
                                                } else {
                                                    item.confirmations = confirmations;

                                                    item.refs = null;
                                                    delete item.refs;
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
                            console.log(err);
                            app.logger.error("SQL error");
                            return res.json({ success: false, error: "SQL error" });
                        } else {
                            return res.json({ success: true, blocks: blocks, found: true });
                        }
                    });
                }
            });
        } catch (e) {
            app.logger.error(e);
            return res.json({ success : false });
        }
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

        try {

            var t = null;

            try {
                t = JSON.parse(req.query.transaction);
            } catch (e) {
                return res.json({ success: false, error: "JSON parser error" });
            }

            try {
                var tr = new Transaction(t.type, null, t.timestamp, t.senderPublicKey, t.recipientId, t.amount, t.signature);

                if (t.signSignature) {
                    tr.signSignature = new Buffer(t.signSignature);
                }
            } catch (e) {
                return res.json({ success: false, error: "JSON parser error" });
            }

            switch (t.type) {
                case 2:
                    switch (t.subtype) {
                        case 0:
                            try {
                                tr.asset = app.signatureprocessor.fromJSON(t.asset);
                            } catch (e) {
                                return res.json({ success: false, error: "JSON parser error" });
                            }
                            break;
                    }
                    break;

                case 3:
                    switch (t.subtype) {
                        case 0:
                            try {
                                tr.asset = app.companyprocessor.fromJSON(t.asset);
                            } catch (e) {
                                return res.json({ success: false, error: "JSON parser error" });
                            }
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
                return res.json({ success: true, accepted: true });
            } else {
                return res.json({ success: false, accepted: false });
            }
        } catch (e) {
            app.peerprocessor.blockPeer(ip);
            return res.json({ success : false, accepted : false });
        }
    });

    app.post("/peer/processBlock", function (req, res) {
        if (!app.synchronizedBlocks) {
            return res.json({ success : false, accepted : false });
        }

        var ip = req.connection.remoteAddress;

        try {
            if (!app.peerprocessor.getPeer(ip)) {
                return res.json({ success: false, peerBlocked: true });
            }

            var b = req.body.block;

            if (!b) {
                return res.json({ success: false, accepted: false });
            }

            try {
                var block = new Block(b.version, null, b.timestamp, b.previousBlock, [], b.totalAmount, b.totalFee, b.payloadLength, b.payloadHash, b.generatorPublicKey, b.generationSignature, b.blockSignature);
                block.requestsLength = b.requestsLength;
                block.numberOfRequests = b.numberOfRequests;
                block.numberOfConfirmations = b.numberOfConfirmations;
                block.confirmationsLength = b.confirmationsLength;
            } catch (e) {
                app.peerprocessor.blockPeer(ip);
                return res.json({ success: false, accepted: false });
            }

            var previousBlock = b.previousBlock;

            try {
                var transactions = [];
                for (var i = 0; i < b.transactions.length; i++) {
                    var t = b.transactions[i];

                    var transaction = new Transaction(t.type, null, t.timestamp, t.senderPublicKey, t.recipientId, t.amount, t.signature);
                    if (t.signSignature) {
                        transaction.signSignature = new Buffer(t.signSignature);
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
            }
            catch (e) {
                app.peerprocessor.blockPeer(ip);
                return res.json({ success: false, accepted: false });
            }

            var requests = [];
            for (var i = 0; i < b.requests.length; i++) {
                var r = b.requests[i];

                try {
                    requests.push(new requestconfirmation(r.address));
                } catch (e) {
                    app.peerprocessor.blockPeer(ip);
                    return res.json({ success: false, accepted: false });
                }
            }

            var confirmations = [];
            for (var i = 0; i < b.confirmations.length; i++) {
                var c = b.confirmations[i];

                try {
                    confirmations.push(new companyconfirmation(c.companyId, c.verified, c.timestamp, c.signature));
                } catch (e) {
                    app.peerprocessor.blockPeer(ip);
                    return res.json({ success: false, accepted: false });
                }
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
                var r = app.blockchain.pushBlock(buffer, true, true, true);
            } catch (e) {
                r = false;
                app.peerprocessor.blockPeer(ip);
                this.app.logger.error(e.toString());
            }

            if (r) {
                return res.json({ success: true, accepted: true });
            } else {
                return res.json({ success: false, accepted: false });
            }
        } catch (e) {
            app.peerprocessor.blockPeer(ip);
            return res.json({ success : false, accepted : false });
        }
    });
}