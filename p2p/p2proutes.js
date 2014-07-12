var peer = require("./peer.js"),
    peerprocessor = require("./peerprocessor.js"),
    Constants = require("../Constants.js"),
    Block = require('../block').block,
    Transaction = require("../transactions").transaction,
    async = require('async');

module.exports = function (app) {
    app.get("/peer/getPeers", function (req, res) {
        var peers = app.peerprocessor.getPeersAsArray();
        return res.json({ success : true, peers : peers });
    });

    app.get("/peer/getPeer", function (req, res) {
        var ip = req.query.ip;
        var peer = peerprocessor.getPeer(ip);
        return res.json({ success : true, peer : perr });
    });

    app.get("/peer/getInfo", function (req, res) {
        return res.json({ platform : app.info.platform, version : app.info.version });
    });

    app.get("/peer/getCumulativeDifficulty", function (req, res) {
        var lastBlock = app.blockchain.getLastBlock();
        return res.json({ success : true, cumulativeDifficulty : lastBlock.cumulativeDifficulty.toString() });
    });

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
    });

    app.get("/peer/processTransactions", function (req, res) {
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
    });

    app.get('/peer/getUnconfirmedTransactions', function (req, res) {
        var results = [];
        for (var t in app.transactionprocessor.unconfirmedTransactions) {
            results.push(app.transactionprocessor.unconfirmedTransactions[t].toJSON());
        }

        return res.json({ success : true, transactions : results });
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

        if (previousBlock != app.blockchain.getLastBlock().getId()) {
            return res.json({ success : false, accepted : false });
        }

        var transactions = [];
        for (var i = 0; i < b.transactions.length; i++) {
            var t = b.transactions[i];
            var transaction = new Transaction(t.type, null, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recepientId, t.amount, t.deadline, t.fee, t.referencedTransaction, new Buffer(t.signature, 'hex'));
            transactions.push(transaction);
        }

        var buffer = block.getBytes();
        for (var i = 0; i < transactions.length; i++) {
            buffer = Buffer.concat([buffer, transactions[i].getBytes()]);
        }

        var r = app.blockchain.pushBlock(buffer);

        return res.json({ success : true, accepted : r });
    });
}