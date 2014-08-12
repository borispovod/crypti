var crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js"),
    constants = require("../Constants.js"),
    _ = require("underscore"),
    Block = require("../block").block.block,
    ed  = require('ed25519'),
    async = require('async'),
    request = require('../request').request,
    genesisblock = require("../block").genesisblock,
    companyconfirmation = require("../company").companyconfirmation,
    http = require('http');

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

forger.prototype.checkCompany = function (company, cb) {
    var getOptions = {
        hostname: company.domain,
        port: 80,
        path: '/cryptixcr.txt'
    };

    var timeout = null;

    var r = http.get(getOptions, function (response) {
        var data = "";
        response.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        response.on('end', function () {
            data = data.replace(/^\s+|\s+$/g,"");
            if (data != company.signature.toString('base64')) {
                cb(false);
             } else {
                cb(true);
            }
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 3000);

    r.on('error', function (err) {
        cb(false);
    });
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
    if (!this.app.synchronizedBlocks || !this.sent) {
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
    if (effectiveBalance < 1000 * constants.numberLength) {
        this.workingForger = false;
        return false;
    }

    var lastAliveBlock = this.app.blockchain.getLastBlock();

    var now = utils.getEpochTime(new Date().getTime());
    var elapsedTime = now - lastAliveBlock.timestamp;

    if (elapsedTime <= 60) {
        this.workingForger = false;
        return false;
    }


    if (Object.keys(this.app.requestprocessor.unconfirmedRequests).length == 0) {
        this.app.logger.info("Need account for forge block...");
        this.workingForger = false;
        return false;
    }

    var requests = _.map(lastAliveBlock.requests, function (v) { return v; });
    var accounts = [];

    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        var account = this.app.accountprocessor.getAccountByPublicKey(request.publicKey);

        if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
            continue;
        }

        var address = account.address;

        var confirmedRequests = this.app.requestprocessor.confirmedRequests[address];


        if (!confirmedRequests) {
            confirmedRequests = [];
        }

        confirmedRequests = confirmedRequests.slice(0);

        var accountWeightTimestamps = bignum(0);
        var popWeightAmount = 0;

        var previousBlock = this.app.blockchain.getBlock(lastAliveBlock.getId());
        for (var j = confirmedRequests.length - 1; j >= 0; j--) {
            if (!previousBlock) {
                break;
            }

            var confirmedRequest = confirmedRequests[j];


            var block = this.app.blockchain.getBlock(confirmedRequest.blockId);

            if (previousBlock.getId() != block.getId()) {
                break;
            }

            accountWeightTimestamps = accountWeightTimestamps.add(block.timestamp);
            var purchases = this.app.accountprocessor.purchases[block.getId()];

            if (purchases) {
                if (purchases[address]) {
                    popWeightAmount += purchases[address];
                }
            }

            if (block.generatorPublicKey.toString('hex') == request.publicKey.toString('hex')) {
                break;
            }

            // get account purcashes in this block
            previousBlock = this.app.blockchain.getBlock(previousBlock.previousBlock);
        }

        accountWeightTimestamps = accountWeightTimestamps.div(lastAliveBlock.height);
        popWeightAmount  = Math.log(1 + popWeightAmount) / Math.LN10;

        var X = null;
        if (this.app.blockchain.totalPurchaseAmount == 0) {
            X = 1;
        } else {
            X = this.app.blockchain.totalPurchaseAmount;
        }

        popWeightAmount /= X;

        this.app.logger.info("Account PoT weight: " + address + " / " + accountWeightTimestamps.toString());
        this.app.logger.info("Account PoP weight: " + address + " / " + popWeightAmount);

        var accountTotalWeight = accountWeightTimestamps.add(popWeightAmount);
        accounts.push({ address : address, weight : accountTotalWeight, publicKey : request.publicKey, signature : request.signature  });

        this.app.logger.info("Account " + address + " / " + accountTotalWeight.toString());
    }

    accounts.sort(function compare(a,b) {
        if (a.weight.gt(b.weight))
            return -1;

        if (a.weight.lt(b.weight))
            return 1;

        return 0;
    });

    if (accounts.length == 0) {
        this.app.logger.info("Need accounts for forging...");
        this.workingForger = false;
        return false;
    }

    var cycle = parseInt(elapsedTime / 60) - 1;

    if (cycle > accounts.length - 1) {
        cycle = parseInt(cycle  % accounts.length);
    }

    this.logger.info("Winner in cycle is: " + cycle);

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
        this.app.logger.info("Same weight in cyclet: " + sameWeights.length);

        var randomWinners = [];
        for (var i = 0; i < sameWeights.length; i++) {
            var a = sameWeights[i];
            var hash = crypto.createHash('sha256').update(a.weight.toBuffer({ size : '8' })).update(a.signature).digest();

            var result = new Buffer(8);
            for (var j = 0; j < 8; j++) {
                result[j] = hash[j];
            }

            this.app.logger.info("Account " + a.address + " new weight is: " + bignum.fromBuffer(result, { size : '8'}));
            randomWinners.push({ address : a.address, weight : bignum.fromBuffer(result, { size : '8'}), publicKey : a.publicKey, signature : a.signature });
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

    this.app.logger.info("Winner in cycle" + winner.address + " / " + winner.weight.toString());

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
            var feeA = this.app.blockchain.getFee(a), feeB = this.app.blockchain.getFee(b);
            return feeA > feeB;
        }.bind(this));

        var newTransactions = {};
        var newTransactionsLength = sortedTransactions.length;
        var blockTimestamp = now;
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

                var fee = 0;

                switch (t.type) {
                    case 0:
                        switch (t.subtype) {
                            case 0:
                                var fee = parseInt(t.amount / 100 * this.app.blockchain.fee);

                                if (fee == 0) {
                                    fee = 1;
                                }
                                break;
                        }
                        break;

                    case 1:
                        switch (t.subtype) {
                            case 0:
                                var fee = parseInt(t.amount / 100 * this.app.blockchain.fee);

                                if (fee == 0) {
                                    fee = 1;
                                }
                                break;
                        }
                        break;

                    case 2:
                        switch (t.subtype) {
                            case 0:
                                fee = 100 * constants.numberLength;
                                break;
                        }
                        break;

                    case 3:
                        switch (t.subtype) {
                            case 0:
                                fee = 1000 * constants.numberLength;
                                break;
                        }
                        break;
                }


                var amount = t.amount + fee;

                if (accumulatedAmount + amount > sender.balance) {
                    continue;
                }

                if (t.timestamp > blockTimestamp) {
                    continue;
                }

                if (this.transactionprocessor.getTransaction(t.getId())) {
                    continue;
                }

                if (!accumulatedAmounts[sender.address]) {
                    accumulatedAmounts[sender.address] = 0;
                }

                accumulatedAmounts[sender.address] += amount;
                totalFee += fee;
                totalAmount += t.amount;
                payloadLength += size;

                newTransactions[t.getId()] = t;
            }

            if (Object.keys(newTransactions).length == prevNumberOfNewTransactions) {
                break;
            }
        }

        var newRequests = [];
        var requestsLength = 0;
        var unconfirmedRequests = _.map(this.app.requestprocessor.unconfirmedRequests, function (v) { return v; });
        for (var i = 0 ; i < unconfirmedRequests.length; i++) {
            var size = unconfirmedRequests[i].getBytes().length;

            if (requestsLength + size > constants.maxRequestsLength) {
                break;
            }

            var account = this.app.accountprocessor.getAccountByPublicKey(unconfirmedRequests[i].publicKey);

            if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
                continue;
            }

            newRequests.push(unconfirmedRequests[i]);
            requestsLength += size;
        }

        var companies = _.map(this.app.companyprocessor.addedCompanies, function (v) { return v; });
        var newConfirmations = [];
        var confirmationsLength = 0;
        async.forEach(companies, function (company, cb) {
            var size = 77;

            if (size + confirmationsLength > constants.maxConfirmations) {
                return cb(true);
            }

            this.checkCompany(company, function (r) {
                var cm = new companyconfirmation(company.getId(), r, blockTimestamp);
                cm.sign(this.secretPharse);

                newConfirmations.push(cm);
                confirmationsLength += size;
                totalFee += 100 * constants.numberLength;
                cb();
            }.bind(this));
        }.bind(this), function () {
            console.log(newConfirmations);
            var publicKey = this.publicKey;
            var hash = crypto.createHash('sha256');

            for (var t in newTransactions) {
                hash.update(newTransactions[t].getBytes());
            }

            for (var i = 0; i < newRequests.length; i++) {
                hash.update(newRequests[i].getBytes());
            }

            for (var i = 0; i < newConfirmations.length; i++) {
                hash.update(newConfirmations[i].getBytes());
            }

            var payloadHash = hash.digest();

            var previousBlock = this.blockchain.getLastBlock();
            hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(publicKey);
            var generationSignature = hash.digest();

            var previousBlockHash = crypto.createHash('sha256').update(previousBlock.getBytes()).digest();

            var block = new Block(1, null, blockTimestamp, previousBlock.getId(), null, totalAmount, totalFee, payloadLength, payloadHash, publicKey, generationSignature, null);
            block.requestsLength = requestsLength;
            block.numberOfConfirmations = newConfirmations.length;
            block.confirmationsLength = confirmationsLength;
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

                for (var i = 0; i < newRequests.length; i++) {
                    buffer = Buffer.concat([buffer, newRequests[i].getBytes()]);
                }

                for (var i = 0; i < newConfirmations.length; i++) {
                    buffer = Buffer.concat([buffer, newConfirmations[i].getBytes()]);
                }

                try {
                    var result = this.blockchain.pushBlock(buffer, true, true);
                } catch (e) {
                    result = null;
                    this.app.logger.error(e.toString());
                }

                this.workingForger = false;
            } else {
                this.logger.error("Can't verify new generated block");
            }
        }.bind(this));

    } else {
        this.workingForger = false;
    }
}

module.exports = forger;