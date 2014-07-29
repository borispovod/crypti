var crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js"),
    constants = require("../Constants.js"),
    _ = require("underscore"),
    Block = require("../block").block.block,
    ed  = require('ed25519'),
    async = require('async'),
    request = require('../request').request,
    ip = require('ip');

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

    var r = new request(null, null, "127.0.0.1", keypair.publicKey, lastAliveBlock, false);
    r.sign(this.secretPharse);

    var added = this.app.requestprocessor.processTransaction(r);

    if (!added) {
        this.sending = false;
        return false;
    }


/*
    var blockId

    var request = {
        publicKey : keypair.publicKey.toString('hex'),
        signature : signature.toString('hex'),
        lastAliveBlock : lastAliveBlock,
        ip : "127.0.0.1"
    }

    var account = this.app.accountprocessor.processRequest(request);
    if (!account) {
        this.sending = false;
        return;
    }

    this.app.db.writePeerRequest(request, function (err) {
        if (err) {
            this.app.logger.error(err.toString(), "error");
            this.sending = false;
        } else {
            account.lastAliveBlock = lastAliveBlock;
            this.app.peerprocessor.sendRequestToAll(request);
            this.sending = false;
            this.sent = true;
        }
    }.bind(this));*/
}

forger.prototype.startForge = function () {
    if (!this.app.synchronizedBlocks || !this.app.synchronizedRequests || !this.sent) {
        this.app.logger.warn("Can't forge, node not synchronized!");
        return false;
    }

    console.log(this.workingForger);

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
    if (effectiveBalance <= 0) {
        this.workingForger = false;
        return false;
    }

    // calculate need weight
    var powNumber = 0;
    var needWeight = bignum(1);

    var lastAliveBlock = this.app.blockchain.getLastBlock();

    var blockGenerationSignature = lastAliveBlock.generationSignature.toString('base64');

    for (var i = 0; i < blockGenerationSignature.length; i++) {
        if (blockGenerationSignature[i] == '=') {
            break;
        }

        var charCode = blockGenerationSignature.charCodeAt(i);

        if (charCode <= 0) {
            charCode = 1;
        } else if (powNumber == 0) {
            powNumber = charCode;
        }

        needWeight = needWeight.mul(charCode);
    }

    if (powNumber <= 0) {
        powNumber = 1;
    }

    needWeight = needWeight.pow(powNumber);

    var elapsedTime = utils.getEpochTime(new Date().getTime()) - lastAliveBlock.timestamp;

    if (elapsedTime < 60) {
        this.workingForger = false;
        return false;
    }

    var cycle = parseInt(elapsedTime / 60);

    console.log("Last alive block: " + lastAliveBlock.getId());

    this.app.db.sql.serialize(function () {
        this.app.db.sql.all("SELECT * FROM peerRequests WHERE lastAliveBlock=$lastAliveBlock", {
            $lastAliveBlock: lastAliveBlock.getId()
        }, function (err, requests) {
            if (err) {
                this.app.logger.error(err.toString());
                this.workingForger = false;
            } else {
                console.log(requests);
                var accounts = [];

                async.eachSeries(requests, function (item, cb) {
                    var accountWeight = bignum(0);
                    var accountPow = 0;

                    var account = this.app.accountprocessor.getAccountByPublicKey(new Buffer(item.publicKey, 'hex'));

                    if (!account || account.getEffectiveBalance() <= 0) {
                        return cb();
                    }

                    item.signature = item.signature.toString('base64');

                    for (var i = 0; i < item.signature.length; i++) {
                        var charCode = item.signature.charCodeAt(i);

                        if (charCode <= 0) {
                            charCode = 1;
                        } else if (accountPow == 0) {
                            accountPow = charCode;
                        }

                        accountWeight = accountWeight.mul(charCode);
                    }

                    accountWeight = accountWeight.pow(accountPow);
                    var different = bignum(0);

                    if (accountWeight.gt(needWeight)) {
                        different = different.add(accountWeight.sub(needWeight));
                    } else {
                        different = different.add(needWeight.sub(accountWeight));
                    }

                    accounts.push({ weight : different, address : account.address });
                    cb();
                }.bind(this), function () {
                    accounts.sort(function compare(a,b) {
                        if (a.weight.lt(b.weight))
                            return -1;

                        if (a.weight.gt(b.weight))
                            return 1;

                        return 0;
                    });

                    if (cycle + 1 > accounts.length) {
                        cycle = accounts.length - 1;
                    }

                    console.log(cycle);
                    var generator = accounts[cycle];
                    if (generator.address == myAccount.address) {
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
                            } else {
                                this.workingForger = false;
                            }

                        } else {
                            this.logger.error("Can't verify new generated block");
                        }

                    }
                }.bind(this));
            }
        }.bind(this));
    }.bind(this));

    /*this.app.db.sql.serialize(function () {
        // get max weight and my weight, elapsed time.
        this.app.db.sql.get("SELECT * FROM peer WHERE blocked=0 ORDER BY timestamp LIMIT 1", function (err, peer) {
            console.log(peer);
            if (err) {
                this.app.logger.error(err);
            } else if (peer) {
                var maxWeight = peer.timestamp - lastBlock.timestamp;
                var target = maxWeight + 60 - elapsedTime;

                this.workingForger = false;
            } else {
                console.log("peers not found...");
                this.workingForger = false;
            }
        }.bind(this));
    }.bind(this));*/

    //elapsedTime > 0 & account.weight

    /*if (elapsedTime > 60) {
        /*var target = bignum(lastBlock.getBaseTarget()).mul(account.weight).mul(elapsedTime);

        if (!this.forgerprocessor.hits[account.address]) {
            return false;
        }*/

        /*if (!account || !this.publicKey) {
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
    }*/
}

module.exports = forger;