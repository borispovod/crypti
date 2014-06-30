var crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js"),
    constants = require("../Constants.js"),
    _ = require("underscore"),
    Block = require("../block").block.block,
    ed  = require('ed25519'),
    async = require('async');

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
    this.addressprocessor = app.addressprocessor;
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



    /*if (lastBlock != this.forgerprocessor.lastBlocks[account.address]) {
        // find max amount
        var s = this.app.db.prepare("SELECT * FROM ")
    }*/


    /*if (lastBlock != this.forgerprocessor.lastBlocks[account.address]) {

        var hash = crypto.createHash("sha256").update(lastBlock.generationSignature).update(account.publickey);
        var generationSignatureHash = hash.digest();

        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = generationSignatureHash[7 - i];
        }

        var hit = bignum.fromBuffer(temp);

        // let's get last payments by address
        var s = this.app.db.sql.prepare("SELECT * FROM blocks WHERE generatorPublicKey=?");
        s.bind([account.publickey.toString('hex')]);
        s.get(function (err, block) {
            if (err) {
                this.logger.error(err);
            } else {
                var timestamp = 0;

                if (block) {
                    timestamp = block.timestamp;
                }

                s = this.app.db.sql.prepare("SELECT senderPublicKey, SUM(amount) as s FROM trs WHERE type=1 AND timestamp > ? ORDER BY s DESC LIMIT 1");
                s.bind([timestamp]);
                s.get(function (err, trs) {
                    if (err) {
                        this.logger(err);
                    } else {
                        if (trs.s) {

                        }
                        var amount = 0;
                        // add node time
                        var nodeTime = bignum(600 / 60 + 1).pow(10);
                        console.log("node time: " + nodeTime.toString());

                        var totalWeight = bignum(totalAmount).add(nodeTime);
                        account.weight = totalWeight;

                        this.forgerprocessor.lastBlocks[account.address] = lastBlock;
                        this.forgerprocessor.hits[account.address] = temp.toString('hex');

                        //account.getEffectiveBalance()
                        var total = hit.div(bignum(lastBlock.getBaseTarget()).mul(totalWeight)).toNumber();

                        var elapsed = utils.getEpochTime(new Date().getTime()) - lastBlock.timestamp;

                        this.deadline = Math.max(total - elapsed, 0);
                    }
                }.bind(this));
            }
        }.bind(this));
    }*/

    var lastBlock = this.blockchain.getLastBlock();
    var elapsedTime = utils.getEpochTime(new Date().getTime()) - lastBlock.timestamp;
    //elapsedTime > 0 & account.weight
    if (elapsedTime > 60) {
        /*var target = bignum(lastBlock.getBaseTarget()).mul(account.weight).mul(elapsedTime);

        if (!this.forgerprocessor.hits[account.address]) {
            return false;
        }*/

        //bignum.fromBuffer(new Buffer(this.forgerprocessor.hits[account.address], 'hex')).lt(target)
        if (account.publickey.toString('hex') == "9e51284be9f60a367d57b8d9dc40fb7a1e95cdf9c4ba249f4e96809fa05d5982") {
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

            var addresses = _.map(this.addressprocessor.unconfirmedAddresses, function (obj, key) { return obj });
            addresses.sort(function(a, b){
                return a.timestamp > b.timestamp;
            });

            var newAddresses = {};
            var addressesLength = 0;

            for (var i = 0; i < addresses.length; i++) {
                var size = addresses[i].getBytes().length;

                if (newAddresses[addresses[i].id]) {
                    continue;
                }

                if (addressesLength + payloadLength > constants.maxPayloadLength) {
                    break;
                }

                if (this.addressprocessor.addresses[addresses[i].id]) {
                    continue;
                }

                var addrAccount = this.accountprocessor.getAddressByPublicKey(addresses[i].generatorPublicKey);
                if (newAddresses[addrAccount]) {
                    continue;
                }

                if (!this.accountprocessor.accounts[addrAccount] || this.accountprocessor.accounts[addrAccount].getEffectiveBalance() <= 0) {
                    continue;
                }

                if (addressesLength + addresses[i].getBytes().length > constants.maxAddressLength) {
                    break;
                }

                newAddresses[addresses[i].id] = addresses[i];
                addressesLength += addresses[i].getBytes().length;
            }

            payloadLength += addressesLength;
            console.log(payloadLength);
            console.log("addr len: " + addressesLength);

            var publicKey = account.publickey;
            var hash = crypto.createHash('sha256');

            for (var t in newTransactions) {
                hash.update(newTransactions[t].getBytes());
            }

            var payloadHash = hash.digest();


            var previousBlock = this.blockchain.getLastBlock();
            hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(publicKey);
            var generationSignature = hash.digest();

            console.log("here 2");

            var previousBlockHash = crypto.createHash('sha256').update(previousBlock.getBytes()).digest();

            var block = new Block(1, null, blockTimestamp, previousBlock.getId(), null, totalAmount, totalFee, payloadLength, payloadHash, publicKey, generationSignature, null);
            block.numberOfAddresses = Object.keys(newAddresses).length;
            block.setApp(this.app);
            block.numberOfTransactions = Object.keys(newTransactions).length;

            var passHash = crypto.createHash('sha256').update(this.secretPharse, 'utf8').digest();
            var keypair = ed.MakeKeypair(passHash);

            block.generationSignature = ed.Sign(generationSignature, keypair);

            console.log(this.secretPharse);
            block.sign(this.secretPharse);

            console.log(block.verifyGenerationSignature());
            console.log(block.verifyBlockSignature());

            if (block.verifyBlockSignature() && block.verifyGenerationSignature()) {
                this.logger.info("Block generated: " + block.getId());
                var buffer = block.getBytes();

                for (var t in newTransactions) {
                    buffer = Buffer.concat([buffer, newTransactions[t].getBytes()]);
                }

                for (var addr in newAddresses) {
                    console.log(newAddresses[addr]);
                    buffer = Buffer.concat([buffer, newAddresses[addr].getBytes()]);
                }

                console.log("addrs count: " + block.numberOfAddresses);

                this.blockchain.pushBlock(buffer, true);
            } else {
                this.logger.error("Can't verify new generated block");
            }
        }
    }
}

module.exports = forger;