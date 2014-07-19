var crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js"),
    constants = require("../Constants.js"),
    _ = require("underscore"),
    Block = require("../block").block.block,
    ed  = require('ed25519'),
    async = require('async');

var forger = function (accountId, publicKey, secretPharse) {
    this.accountId = accountId;
    this.secretPharse = secretPharse;
    this.publicKey = publicKey;
}

forger.prototype.setApp = function (app) {
    this.app = app;
    this.accountprocessor = app.accountprocessor;
    this.blockchain = app.blockchain;
    this.transactionprocessor = app.transactionprocessor;
    this.forgerprocessor = app.forgerprocessor;
    this.logger = app.logger;
    this.addressprocessor = app.addressprocessor;
    this.workingForger = false;
}

forger.prototype.startForge = function () {
    if (!this.app.synchronized) {
        this.app.logger.warn("Can't forge, node not synchronized!");
        return false;
    }

    if (this.workingForger) {
        return false;
    }

    this.workingForger = true;

    //return false;

    var account = this.accountprocessor.getAccountById(this.accountId);

    if (!account) {
        return false;
    }

    var effectiveBalance = account.getEffectiveBalance();
    if (effectiveBalance <= 0) {
        return false;
    }

    var lastBlock = this.blockchain.getLastBlock();
    var elapsedTime = utils.getEpochTime(new Date().getTime()) - lastBlock.timestamp;

    this.app.db.sql.serialize(function () {
        // get max weight and my weight, elapsed time.
        this.app.db.sql.get("SELECT * FROM peer WHERE blocked=0 ORDER BY timestamp LIMIT 1", function (err, peer) {
            console.log(peer);
            if (err) {
                this.app.logger.error(err);
            } else if (peer) {
                var maxWeight = peer.timestamp - lastBlock.timestamp;
                var target = maxWeight + 60 - elaspedTime;

                console.log("target: " + target);
                this.workingForger = false;
            } else {
                console.log("peer not found");
            }
        }.bind(this));
    }.bind(this));

    //elapsedTime > 0 & account.weight

    if (elapsedTime > 60) {
        /*var target = bignum(lastBlock.getBaseTarget()).mul(account.weight).mul(elapsedTime);

        if (!this.forgerprocessor.hits[account.address]) {
            return false;
        }*/

        if (!account || !this.publicKey) {
            return;
        }

        //bignum.fromBuffer(new Buffer(this.forgerprocessor.hits[account.address], 'hex')).lt(target)
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


            var publicKey = this.publicKey;
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
            block.numberOfAddresses = Object.keys(newAddresses).length;
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

                for (var addr in newAddresses) {
                    buffer = Buffer.concat([buffer, newAddresses[addr].getBytes()]);
                }

                var result = this.blockchain.pushBlock(buffer, true);

                if (!result) {
                    this.transactionprocessor.unconfirmedTransactions = {};
                    this.addressprocessor.unconfirmedAddresses = {};
                }

            } else {
                this.logger.error("Can't verify new generated block");
            }
    }
}

module.exports = forger;