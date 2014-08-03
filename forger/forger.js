var crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js"),
    constants = require("../Constants.js"),
    _ = require("underscore"),
    Block = require("../block").block.block,
    ed  = require('ed25519'),
    async = require('async'),
    request = require('../request').request;

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
    this.sending = false;
}

forger.prototype.sendRequest = function () {
    if (this.sending || !this.app.synchronizedRequests) {
        return false;
    }

    this.sending = true;
    var passHash = crypto.createHash('sha256').update(this.secretPharse, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);

    var hash = crypto.createHash('sha256').update(keypair.publicKey).digest();
    var signature = ed.Sign(hash, keypair);

    var lastAliveBlock = this.app.blockchain.getLastBlock().getId();

    var r = new request(null, null, "127.0.0.1", keypair.publicKey, lastAliveBlock);
    r.sign(this.secretPharse);

    var added = this.app.requestprocessor.processRequest(r);
    this.app.peerprocessor.sendRequestToAll(r);


    this.sending = false;
    this.sent = true;
    return false;
}

forger.prototype.startForge = function () {
    if (!this.app.synchronizedBlocks || !this.app.synchronizedRequests || !this.sent) {
        this.app.logger.warn("Can't forge, node not synchronized!");
        return false;
    }

    if (this.workingForger) {
        return false;
    }

    this.workingForger = true;

    var myAccount = this.accountprocessor.getAccountById(this.accountId);

    if (!myAccount) {
        this.workingForger = false;
        return false;
    }

    var effectiveBalance = myAccount.getEffectiveBalance();
    if (effectiveBalance <= 1000 * constants.numberLength) {
        this.workingForger = false;
        return false;
    }

    var lastAliveBlock = this.app.blockchain.getLastBlock();

    var elapsedTime = utils.getEpochTime(new Date().getTime()) - lastAliveBlock.timestamp;

    if (elapsedTime < 60) {
        this.workingForger = false;
        return false;
    }

    var requests = _.map(this.app.requestprocessor.unconfirmedRequests, function (v) { return v; });
    var accounts = [];

    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        var account = this.app.accountprocessor.getAccountByPublicKey(request.publicKey);

        if (!account || account.getEffectiveBalance() <= 1000 * constants.numberLength) {
            continue;
        }

        var address = account.address;

        var confirmedRequests = this.app.requestprocessor.confirmedRequests[address];

        console.log(confirmedRequests);

        if (!confirmedRequests) {
            confirmedRequests = [];
        }

        var accountWeightTimestamps = bignum(lastAliveBlock.timestamp);
        var popWeightAmount = bignum(0);

        var previousBlock = this.app.blockchain.getBlock(lastAliveBlock.previousBlock);
        for (var j = confirmedRequests.length - 1; j >= 0; j--) {
            var block = this.app.blockchain.getBlock(confirmedRequests[j].lastAliveBlock);

            if (this.app.accountprocessor.getAccountByPublicKey(block.generatorPublicKey).address == account.address) {
                console.log("break");
                break;
            }

            if (block.getId() != previousBlock.getId()) {
                break;
            } else {
                accountWeightTimestamps = accountWeightTimestamps.add(previousBlock.timestamp);
                var purchases = this.app.accountprocessor.purchases[previousBlock.getId()];

                if (purchases) {
                    if (purchases[address]) {
                        popWeightAmount = popWeightAmount.add(purchases[address]);
                    }
                }

                // get account purcashes in this block

                previousBlock = this.app.blockchain.getBlock(previousBlock.previousBlock);
            }
        }

        accountWeightTimestamps = accountWeightTimestamps.div(lastAliveBlock.height);
        popWeightAmount = popWeightAmount.div(this.app.blockchain.totalPurchaseAmount);

        this.app.logger.info("Account " + address + " PoT weight " + accountWeightTimestamps.toString());
        this.app.logger.info("Account " + address + " PoP weight " + popWeightAmount.toString());

        var accountTotalWeight = accountWeightTimestamps.add(popWeightAmount);
        accounts.push({ address : address, weight : accountTotalWeight });

        this.app.logger.info("Account " + address + " weight " + accountTotalWeight.toString());
    }

    accounts.sort(function compare(a,b) {
        if (a.weight.gt(b.weight))
            return -1;

        if (a.weight.lt(b.weight))
            return 1;

        return 0;
    });

    var cycle = elapsedTime / 60 - 1;

    if (cycle > accounts.length - 1) {
        cycle = accounts.length - 1;
    }

    // ищем похожий вес
    var winner = accounts[cycle];
    var sameWeights = [winner];

    for (var i = cycle + 1; i < accounts.length; i++) {
        var accountWeight = accounts[i];

        if (winner.weight.eq(accountWeight.weight)) {
            sameWeights.push(accountWeight);
        } else {
            break;
        }
    }

    if (sameWeights.length > 1) {
        this.app.logger.info("Accounts with same weight founds, count: " + sameWeights.length);

        var randomWinners = [];
        for (var i = 0; i < sameWeights.length; i++) {
            var a = sameWeights[i];
            var hash = crypto.createHash('sha256').update(a.weight.toBuffer({ size : '8' })).update(this.app.requestprocessor.unconfirmedRequests[a.address].publicKey).digest();

            var result = new Buffer(8);
            for (var j = 0; j < 8; j++) {
                result[j] = hash[j];
            }

            this.app.logger.info("Account with same weight " + a.address + " new weight: " + bignum.fromBuffer(result, { size : '8'}));
            randomWinners.push({ address : a.address, weight : bignum.fromBuffer(result, { size : '8'})});
        }

        randomWinners.sort(function compare(a,b) {
            if (a.weight.gt(b.weight))
                return -1;

            if (a.weight.lt(b.weight))
                return 1;

            return 0;
        });

        winner = randomWinners[0];
    }

    this.app.logger.info("Winner " + winner.address + " with weight " + winner.weight.toString());

    if (winner.address == myAccount.address) {
        // let's generate block
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

            if (addressesLength + size > constants.maxAddressesLength) {
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

        //payloadLength += addressesLength;

        var newRequests = [];
        var requestsLength = 0;
        for (var i = 0 ; i < requests.length; i++) {
            var size = requests[i].getBytes().length;

            if (requestsLength + size > constants.maxRequestsLength) {
                break;
            }

            if (this.app.requestprocessor.confirmedRequests[requests[i].getId()]) {
                continue;
            }

            var account = this.app.accountprocessor.getAccountByPublicKey(requests[i].publicKey);

            if (!account || account.getEffectiveBalance() < 10000 * constants.numberLength) {
                continue;
            }

            newRequests.push(requests[i]);
            requestsLength += size;
        }

        var publicKey = this.publicKey;
        var hash = crypto.createHash('sha256');

        for (var t in newTransactions) {
            hash.update(newTransactions[t].getBytes());
        }

        for (var a in newAddresses) {
            hash.update(newAddresses[a].getBytes());
        }

        for (var i = 0; i < newRequests.length; i++) {
            hash.update(newRequests[i].getBytes());
        }

        var payloadHash = hash.digest();


        var previousBlock = this.blockchain.getLastBlock();
        hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(publicKey);
        var generationSignature = hash.digest();

        var previousBlockHash = crypto.createHash('sha256').update(previousBlock.getBytes()).digest();

        var block = new Block(1, null, blockTimestamp, previousBlock.getId(), null, totalAmount, totalFee, payloadLength, payloadHash, publicKey, generationSignature, null);
        block.addressesLength = addressesLength;
        block.requestsLength = requestsLength;
        block.numberOfAddresses = Object.keys(newAddresses).length;
        block.numberOfRequests = newRequests.length;
        block.setApp(this.app);
        block.numberOfTransactions = Object.keys(newTransactions).length;

        var passHash = crypto.createHash('sha256').update(this.secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(passHash);

        block.generationWeight = winner.weight;
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

            for (var i = 0; i < newRequests.length; i++) {
                buffer = Buffer.concat([buffer, newRequests[i].getBytes()]);
            }

            var result = this.blockchain.pushBlock(buffer, true);

            if (!result) {
                this.transactionprocessor.unconfirmedTransactions = {};
                this.addressprocessor.unconfirmedAddresses = {};
                this.app.requestprocessor.unconfirmedRequests = {};
            }

            this.workingForger = false;

        } else {
            this.logger.error("Can't verify new generated block");
        }

    } else {
        this.workingForger = false;
    }
}

module.exports = forger;