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
    requestconfirmation = require("../request").requestconfirmation,
    http = require('http'),
    requestHttp = require('request');

var forger = function (accountId, publicKey, secretPharse) {
    this.accountId = accountId;
    this.secretPharse = secretPharse;
    this.publicKey = publicKey;
    this.accounts = [];
    this.lastBlock = null;
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
    try {
        requestHttp({
            url: "http://" + company.domain + "/cryptixcr.txt",
            headers: {
                'User-Agent': 'Crypti Agent'
            },
            timeout: 1500
        }, function (err, resp, body) {
            if (err) {
                cb(false);
            }

            if (resp.statusCode != 200) {
                return cb(false);
            }

            if (!data) {
                return cb(false);
            }

            var data = body.replace(/^\s+|\s+$/g, "");
            if (data != company.signature.toString('base64')) {
                cb(false);
            } else {
                cb(true);
            }
        });
    } catch (e) {
        return cb(false);
    }
}

forger.prototype.sendRequest = function () {
    if (this.sending || !this.app.synchronizedRequests) {
        return false;
    }

    var acc = this.app.accountprocessor.getAccountById(this.accountId);

    if (!acc || acc.getEffectiveBalance() < 1000) {
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
        this.app.logger.debug("Can't forge, node not synchronized!");
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
        this.app.logger.debug("Need account for forge block...");
        this.workingForger = false;
        return false;
    }

    if (this.lastBlock != this.app.blockchain.getLastBlock().getId()) {
        this.lastBlock = this.app.blockchain.getLastBlock().getId();
        this.accounts = [];
    }

    if (this.accounts.length == 0) {
        var requests = _.map(lastAliveBlock.requests, function (v) {
            return v;
        });
        var accounts = [];

        for (var i = 0; i < requests.length; i++) {
            var request = requests[i];
            var account = this.app.accountprocessor.getAccountById(request.address);

            if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
                continue;
            }

            var address = account.address;

            var confirmedRequests = this.app.requestprocessor.confirmedRequests[address];

            if (!confirmedRequests) {
                confirmedRequests = [];
            }

            confirmedRequests = confirmedRequests.slice(0);

            var accountWeightTimestamps = 0;
            var popWeightAmount = 0;

            var previousBlock = this.app.blockchain.getBlock(lastAliveBlock.getId());
            for (var j = confirmedRequests.length - 1; j >= 0; j--) {
                if (!previousBlock) {
                    break;
                }

                var confirmedRequest = confirmedRequests[j];

                var block = this.app.blockchain.getBlock(confirmedRequest.blockId);

                if (!block) {
                    break;
                }

                if (previousBlock.getId() != block.getId()) {
                    break;
                }

                accountWeightTimestamps += block.timestamp;
                var purchases = this.app.accountprocessor.purchases[block.getId()];

                if (purchases) {
                    if (purchases[address] > 10) {
                        popWeightAmount += (Math.log(1 + purchases[address]) / Math.LN10);
                        popWeightAmount = popWeightAmount / (Math.log(1 + (block.totalAmount + block.totalFee)) / Math.LN10)
                    } else if (purchases[address]) {
                        popWeightAmount += purchases[address];
                    }
                }

                if (block.generatorId == request.address) {
                    break;
                }

                // get account purcashes in this block
                previousBlock = this.app.blockchain.getBlock(previousBlock.previousBlock);
            }


            this.app.logger.debug("Account PoT weight: " + address + " / " + accountWeightTimestamps);
            this.app.logger.debug("Account PoP weight: " + address + " / " + popWeightAmount);

            var accountTotalWeight = accountWeightTimestamps + popWeightAmount;
            accounts.push({ address: address, weight: accountTotalWeight });

            this.app.logger.debug("Account " + address + " / " + accountTotalWeight);
        }

        accounts.sort(function compare(a, b) {
            if (a.weight > b.weight)
                return -1;

            if (a.weight < b.weight)
                return 1;

            return 0;
        });

        if (accounts.length == 0) {
            this.app.logger.debug("Need accounts for forging...");
            this.workingForger = false;
            return false;
        }

        this.accounts = accounts;
    }

    var cycle = parseInt(elapsedTime / 60) - 1;

    if (cycle > this.accounts.length - 1) {
        cycle = parseInt(cycle  % this.accounts.length);
    }

    this.logger.debug("Winner in cycle is: " + cycle);

    // ищем похожий вес
    var winner = this.accounts[cycle];
    var sameWeights = [winner];

    for (var i = cycle + 1; i < this.accounts.length; i++) {
        var accountWeight = this.accounts[i];

        if (winner.weight == accountWeight.weight) {
            sameWeights.push(accountWeight);
        } else {
            break;
        }
    }

    if (sameWeights.length > 1) {
        this.app.logger.debug("Same weight in cyclet: " + sameWeights.length);

        var randomWinners = [];
        for (var i = 0; i < sameWeights.length; i++) {
            var a = sameWeights[i];

            var address = a.address.slice(0, -1);
            var addressBuffer = bignum(address).toBuffer({ 'size' : '8' });
            var hash = crypto.createHash('sha256').update(bignum(a.weight).toBuffer({ size : '8' })).update(addressBuffer).digest();

            var result = new Buffer(8);
            for (var j = 0; j < 8; j++) {
                result[j] = hash[j];
            }

            var weight = bignum.fromBuffer(result, { size : '8' }).toNumber();
            this.app.logger.debug("Account " + a.address + " new weight is: " + weight);
            randomWinners.push({ address : a.address, weight : weight });
        }

        randomWinners.sort(function (a,b) {
            if (a.weight > b.weight)
                return -1;

            if (a.weight < b.weight)
                return 1;

            return 0;
        });


        if (cycle > randomWinners.length - 1) {
            cycle = parseInt(cycle  % randomWinners.length);
        }

        winner = randomWinners[cycle];
    }

    this.app.logger.debug("Winner in cycle: " + winner.address);

    if (winner.address == myAccount.address) {
        this.logger.debug("Generating block...");

        var sortedTransactions = [];
        var transactions = _.map(this.transactionprocessor.unconfirmedTransactions, function (obj, key) { return obj; });
        for (var i = 0; i < transactions.length; i++) {
            sortedTransactions.push(transactions[i]);
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

        for (var i = 0; i < sortedTransactions.length; i++) {
            var t = sortedTransactions[i];

            if (!t) {
                continue;
            }

            var size = t.getSize();

            if (size + payloadLength > constants.maxPayloadLength) {
                break;
            }

            if (newTransactions[t.getId()] != null) {
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

        var newRequests = [];
        var requestsLength = 0;
        var unconfirmedRequests = _.map(this.app.requestprocessor.unconfirmedRequests, function (v) { return v; });
        for (var i = 0 ; i < unconfirmedRequests.length; i++) {
            var size = 8;

            if (requestsLength + size > constants.maxRequestsLength) {
                break;
            }

            var account = this.app.accountprocessor.getAccountByPublicKey(unconfirmedRequests[i].publicKey);

            if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
                continue;
            }

            newRequests.push(new requestconfirmation(account.address));
            requestsLength += 8;
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
                if (!company) {
                    return cb();
                }

                var cm = new companyconfirmation(company.getId(), r, blockTimestamp);
                cm.sign(this.secretPharse);

                newConfirmations.push(cm);
                confirmationsLength += size;
                totalFee += 100 * constants.numberLength;

                cb();
            }.bind(this));
        }.bind(this), function () {
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

            block.generationSignature = ed.Sign(generationSignature, keypair);
            block.sign(this.secretPharse);

            if (block.verifyBlockSignature() && block.verifyGenerationSignature()) {
                this.logger.debug("Block generated: " + block.getId());

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
                    var result = this.blockchain.pushBlock(buffer, true, true, true);
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