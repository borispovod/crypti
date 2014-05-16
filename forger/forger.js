var crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js"),
    constants = require("../Constants.js"),
    _ = require("underscore"),
    Block = require("../block").block.block,
    ed  = require('ed25519');

var forger = function (accountId, secretPharse) {
    this.accountId = accountId;
    this.secretPharse = secretPharse;
}

forger.prototype.setApp = function (app) {
    this.app = app;
    this.accountprocessor = app.accountprocessor;
    this.blockchain = app.blockchain;
    this.transactionprocessor = app.transactionprocessor;
    this.forgerprocessor = app.forgerprocessor;
    this.logger = app.logger;
    
}

forger.prototype.startForge = function () {
    var account = this.accountprocessor.getAccountById(this.accountId);

    if (!account) {
        return false;
    }

    var effectiveBalance = account.getEffectiveBalance();
    if (effectiveBalance <= 0) {
        return false;
    }

    var lastBlock = this.blockchain.getLastBlock();
    if (lastBlock != this.forgerprocessor.lastBlocks[account.address]) {

        var hash = crypto.createHash("sha256").update(lastBlock.generationSignature).update(account.publickey);
        var generationSignatureHash = hash.digest();

        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = generationSignatureHash[7 - i];
        }

        var hit = bignum.fromBuffer(temp);

        this.forgerprocessor.lastBlocks[account.address] = lastBlock;
        this.forgerprocessor.hits[account.address] = temp.toString('hex');

        var total = hit.div(bignum(lastBlock.getBaseTarget()).mul(bignum(account.getEffectiveBalance()))).toNumber();

        var elapsed = utils.getEpochTime(new Date().getTime()) - lastBlock.timestamp;

        this.deadline = Math.max(total - elapsed, 0);
    }

    var elapsedTime = utils.getEpochTime(new Date().getTime()) - lastBlock.timestamp;
    if (elapsedTime > 0) {
        var target = bignum(lastBlock.getBaseTarget()).mul(effectiveBalance).mul(elapsedTime);

        if (!this.forgerprocessor.hits[account.address]) {
            return false;
        }

        if (bignum.fromBuffer(new Buffer(this.forgerprocessor.hits[account.address], 'hex')).lt(target)) {
            this.logger.info("Generating block...");

            var sortedTransactions = [];
            var transactions = _.map(this.transactionprocessor.unconfirmedTransactions, function (obj, key) { return obj });
            for (var i = 0; i < transactions.length; i++) {
                if (transactions[i].referencedTransaction == null || this.transactionprocessor.getTransaction(transactions[i].referencedTransaction)) {
                    sortedTransactions.push(transactions[i]);
                }
            }

            sortedTransactions.sort(function(a, b){
                return a.fee > b.fee;
            });

            var newTransactions = {};
            var newTransactionsLength = sortedTransactions.length;
            var blockTimestamp = utils.getEpochTime(new Date().getTime());
            var payloadLength = 0;
            var totalAmount = 0;
            var totalFee = 0;
            var accumulatedAmounts = {};

            while (payloadLength <= constants.maxPayloadLength) {
                var prevNumberOfNewTransactions = newTransactionsLength;

                for (var i = 0; i < sortedTransactions.length; i++) {
                    var t = sortedTransactions[i];
                    var size = t.getSize();

                    if (newTransactions[t.getId()] != null || size + payloadLength > constants.maxPayloadLength) {
                        continue;
                    }

                    var sender = this.accountprocessor.getAccountByPublicKey(t.senderPublicKey);

                    if (!sender) {
                        continue;
                    }

                    var accumulatedAmount = accumulatedAmounts[sender.address] || 0;
                    var amount = t.amount + t.fee;

                    if (accumulatedAmount + amount > sender.balance) {
                        continue;
                    }

                    if (t.timestamp > blockTimestamp || t.timestamp + (t.deadline * 60 * 60) < blockTimestamp) {
                        continue;
                    }

                    if (this.transactionprocessor.getTransaction(t.getId())) {
                        continue;
                    }

                    if (!accumulatedAmounts[sender.address]) {
                        accumulatedAmounts[sender.address] = 0;
                    }

                    accumulatedAmounts[sender.address] += amount;
                    totalFee += t.fee;
                    totalAmount += t.amount;
                    payloadLength += size;

                    newTransactions[t.getId()] = t;
                }

                if (Object.keys(newTransactions).length == prevNumberOfNewTransactions) {
                    break;
                }
            }

            var publicKey = account.publickey;
            var hash = crypto.createHash('sha256');

            for (var t in newTransactions) {
                hash.update(newTransactions[t].getBytes());
            }

            var payloadHash = hash.digest();

            var previousBlock = this.blockchain.getLastBlock();
            hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(publicKey);
            var generationSignature = hash.digest();


            var previousBlockHash = crypto.createHash('sha256').update(previousBlock.getBytes()).digest();

            var block = new Block(1, null, blockTimestamp, previousBlock.getId(), null, totalAmount, totalFee, payloadLength, payloadHash, publicKey, generationSignature, null);
            block.setApp(this.app);
            block.numberOfTransactions = Object.keys(newTransactions).length;

            var passHash = crypto.createHash('sha256').update(this.secretPharse, 'utf8').digest();
            var keypair = ed.MakeKeypair(passHash);

            block.generationSignature = ed.Sign(generationSignature, keypair);

            block.sign(this.secretPharse);


            if (block.verifyBlockSignature() && block.verifyGenerationSignature()) {
                this.logger.info("Block generated: " + block.getId());
                var buffer = block.getBytes();

                for (var t in newTransactions) {
                    buffer = Buffer.concat([buffer, newTransactions[t].getBytes()]);
                }

                this.blockchain.pushBlock(buffer, true);
            } else {
                this.logger.error("Can't verify new generated block");
            }
        }
    }
}

module.exports = forger;