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
    genesisblock = require('../block').genesisblock,
    async = require('async');

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
        if (!app.synchronizedBlocks || app.db.queue.length > 0 || app.blockchain.forkProcessingRunning) {
            return res.json({ success : false });
        }

        return res.json({ success : true, weight : app.blockchain.getWeight().toString(), version : "0.1.8" });
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

        if (app.peerprocessor.blockedPeers[ip]) {
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

            var block = app.blockchain.getBlock(blockId);

            if (!block.nextBlock) {
                return res.json({ success : false, error : "It's last block", hasMore : false });
            }

            blockId = block.nextBlock;

            var blocks = [];

            async.whilst(
                function () {
                    if (blocks.length >= 60) {
                        return false;
                    }

                    if (!block) {
                        return false;
                    }

                    return true;
                },
                function (next) {
                    block = app.blockchain.getBlock(blockId);

                    if (!block) {
                        return setImmediate(next);
                    }

                    blocks.push({ id : block.getId() });

                    blockId = block.nextBlock;
                    return setImmediate(next);
                },
                function () {
                    return res.json({ success : true, blockIds : blocks });
                }
            )
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

            var block = app.blockchain.getBlock(blockId);

            if (!block.nextBlock) {
                return res.json({ success : false, error : "It's last block", hasMore : false, found : true });
            }

            blockId = block.nextBlock;

            var blocks = [];


            async.whilst(
                function () {
                    if (blocks.length >= 10) {
                        return false;
                    }

                    if (!block) {
                        return false;
                    }

                    return true;
                },
                function (next) {
                    block = app.blockchain.getBlock(blockId);

                    if (!block) {
                        return setImmediate(next);
                    }

                    blocks.push(block);
                    blockId = block.nextBlock;
                    return setImmediate(next);
                }, function () {
                    return res.json({ success : true, blocks : blocks, found : true });
                }
            )
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

        if (app.peerprocessor.blockedPeers[ip]) {
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

        if (app.db.queue.length > 0) {
            return res.json({ success : false, accepted : false });
        }

        var ip = req.connection.remoteAddress;

        try {
            if (app.peerprocessor.blockedPeers[ip]) {
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

            if (block.version != 2) {
                return res.json({ success : false, accepted : false });
            }

            var lastBlock = app.blockchain.getLastBlock();
            var savedBlock = null;

            if (Object.keys(app.forgerprocessor.forgers).length > 0 && lastBlock.getId() == block.previousBlock) {
                app.peerprocessor.sendJSONBlockToAll(req.body.block);
                return res.json({ success : false, accepted : false });
            }

            if (lastBlock.previousBlock && block.previousBlock != app.blockchain.getLastBlock().getId() && app.blockchain.blocks[lastBlock.previousBlock].getId() == block.previousBlock) {
                var previousBlock = app.blockchain.blocks[lastBlock.previousBlock];
                var hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(block.generatorPublicKey).digest();

                var elapsedTime = block.timestamp - previousBlock.timestamp;

                var hit = bignum.fromBuffer(new Buffer([hash[7], hash[6], hash[5], hash[4], hash[3], hash[2], hash[1], hash[0]]));
                hit = hit.div(parseInt(elapsedTime / 60));

                if (hit.le(lastBlock.hit)) {
                    return res.json({ success : false, accepted : false});
                } else {
                    savedBlock = lastBlock;
                }
            }


            if (!savedBlock && lastBlock.getId() != block.previousBlock) {
                return res.json({ success : false, accepted : false });
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
                console.log(e);
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

            if (savedBlock) {
                app.blockchain.popLastBlock(function () {
                    try {
                        app.blockchain.pushBlock(buffer, true, true, false, function (r) {
							if (r) {
								buffer = savedBlock.getBytes();

								for (var i = 0; i < savedBlock.transactions.length; i++) {
									buffer = Buffer.concat([buffer, savedBlock.transactions[i].getBytes()]);
								}

								for (var r in savedBlock.requests) {
									buffer = Buffer.concat([buffer, savedBlock.requests[r].getBytes()]);
								}

								for (var i = 0; i < savedBlock.confirmations.length; i++) {
									buffer = Buffer.concat([buffer, savedBlock.confirmations[i].getBytes()]);
								}


								app.blockchain.pushBlock(buffer, true, true, false, function () {
									return res.json({ success: false, accepted: false });
								});
							} else {
								return res.json({ success: true, accepted: true });
							}
						});
                    } catch (e) {
						console.log(e);
                        app.peerprocessor.blockPeer(ip);
                        this.app.logger.error(e.toString());
						return res.json({ success: false, accepted: false });
                    }
                });
            } else {
				try {
					app.blockchain.pushBlock(buffer, true, true, false, function (r) {
						if (r) {
							return res.json({ success: false, accepted: false });
						} else {
							return res.json({ success: true, accepted : true });
						}
					});
				} catch (e) {
					console.log(e);
					app.peerprocessor.blockPeer(ip);
					this.app.logger.error(e.toString());
					return res.json({ success: false, accepted: false })
				}
            }
        } catch (e) {
            console.log(e);
            app.peerprocessor.blockPeer(ip);
            return res.json({ success : false, accepted : false });
        }
    });
}