var genesisblock = require("./genesisblock.js"),
    crypto = require('crypto'),
    block = require("./block.js").block,
    transaction = require('../transactions').transaction,
    transactionprocessor = require("../transactions").transactionprocessor.getInstance(),
    utils = require('../utils.js'),
    constants = require("../Constants.js"),
    ByteBuffer = require("bytebuffer"),
    bignum = require('bignum'),
    Long = require("long"),
    requestconfirmation = require('../request').requestconfirmation,
    async = require('async'),
    _ = require('underscore'),
    bs = require('binarysearch');

var blockchain = function (app) {
    this.app = app;
    this.accountprocessor = this.app.accountprocessor;
    this.transactionprocessor = this.app.transactionprocessor;
    this.logger = this.app.logger;
    this.db = this.app.db;
    this.blocks = {};
    this.lastBlock = null;

    this.fee = constants.feeStart;
    this.nextFeeVolume = constants.feeStartVolume;
    this.actualFeeVolume = 0;
    this.totalPurchaseAmount = 0;
    this.weight = bignum(0);
    this.weights = [{
        accounts : [],
        weight : bignum(1)
    }];
}

blockchain.prototype.removeWeight = function (weightObj) {
    if (weightObj.weight.le(1)){
        return;
    }

    var index = bs(this.weights, weightObj, function (a, b) {
        if(a.weight.gt(b.weight)) return 1
        else if(a.weight.lt(b.weight)) return -1;

        if (a.weight.eq(b.weight)) {
            return 0;
        }
    });

    if (index >= 0) {
        if (this.weights[index].accounts.length == 1) {
            this.weights.splice(index, 1);
        } else {
            var accountIndex = this.weights[index].accounts.indexOf(weightObj.account);

            if (accountIndex > -1) {
                this.weights[index].accounts.splice(accountIndex, 1);
            } else {
                this.weights.splice(index, 1);
            }
        }
    }
}

blockchain.prototype.addWeight = function (weightObj) {
    if (this.weights.length > 0) {
        var max = this.weights[this.weights.length - 1],
            min = this.weights[0];

        if (weightObj.weight.gt(max.weight)) {
            this.weights.push({ accounts : [weightObj.account], weight : weightObj.weight });
        } else if (weightObj.weight.lt(min.weight)) {
            this.weights.splice(0, 0, { accounts : [weightObj.account], weight : weightObj.weight });
        } else if (weightObj.weight.eq(max.weight)) {
            this.weights[this.weights.length - 1].accounts.push(weightObj.account);
        } else if (weightObj.weight.eq(min.weight)) {
            this.weights[0].accounts.push(weightObj.account);
        }
        else if (!weightObj.weight.eq(max.weight) && !weightObj.weight.eq(min.weight))  {
            var index = bs.last(this.weights, weightObj, function (v, search) {
                if (v.weight.le(search.weight)) {
                    return 0;
                }

                if (v.weight.gt(search.weight))
                    return 1;

                return -1;
            });

            if (!this.weights[index].weight.eq(weightObj.weight)) {
                this.weights.splice(index + 1, 0, { accounts : [weightObj.account], weight : weightObj.weight });
            } else {
                this.weights[index].accounts.push(weightObj.account);
            }
        }
    } else {
        this.weights.push({ accounts : [weightObj.account], weight : weightObj.weight });
    }
}

blockchain.prototype.removeWeights = function (weightObj) {
    var index = bs(this.weights, weightObj, function (a, b) {
        if(a.weight.gt(b.weight)) return 1
        else if(a.weight.lt(b.weight)) return -1;

        if (a.weight.eq(b.weight)) {
            return 0;
        }
    });

    var removed = [];
    var accountList = [];

    if (index >= 0) {
        for (var i = this.weights.length - 1; i >= index; i--) {
            var weight = this.weights[i];

            for (var j = 0; j < weight.accounts.length; j++) {
                var owner = weight.accounts[j];
                accountList.push(owner);
                this.app.accountprocessor.getAccountById(owner).weight = bignum(1);
            }

            removed.push(this.weights[i]);
            this.weights.splice(i, 1);
        }
    }

    if (this.weights.length == 0) {
        this.weights.push({ accounts : [], weight : bignum(1) });
    }

    return { removed : removed, accounts : accountList };
}

blockchain.prototype.getWeight = function () {
    return this.getLastBlock().weight;
}

blockchain.prototype.getBlock = function (id) {
    return this.blocks[id];
}

blockchain.prototype.getLastBlock = function () {
    return this.blocks[this.lastBlock];
}

blockchain.prototype.fromJSON = function (b) {
    var block = new Block(b.version, null, b.timestamp, b.previousBlock, [], b.totalAmount, b.totalFee, b.payloadLength, b.payloadHash, b.generatorPublicKey, b.generationSignature, b.blockSignature);
    block.addressesLength = b.addressesLength;
    block.requestsLength = b.requestsLength;
    block.numberOfSignatures = b.numberOfSignatures;

    return block;
}

blockchain.prototype.getBlockIdAtHeight = function (height) {
    var block = _.find(this.blocks, function (v) { return v.height == height });

    if (block) {
        return block.getId();
    } else {
        return null;
    }
}

blockchain.prototype.getCommonBlockId = function (commonBlock, peer, cb) {
    var finished = false;

    async.whilst(
        function () {
            return !finished;
        },
        function (next) {
            peer.getNextBlockIds(commonBlock, function (err, json) {
                if (err) {
                    return next(true);
                } if (!json.success) {
                    return next(true);
                } else if (json.blockIds.length == 0) {
                    finished = true;
                    return next();
                }
                else {
                    for (var i = 0; i < json.blockIds.length; i++) {
                        var blockId = json.blockIds[i].id;

                        if (!this.blocks[blockId]) {
                            finished = true;
                            return next();
                        }

                        commonBlock = blockId;
                    }

                    next();
                }
            }.bind(this));
        }.bind(this),
        function (err) {
            if (err) {
                return cb(err, null);
            } else if (!finished) {
                return cb(true, null);
            } else {
                return cb(null, commonBlock);
            }
        }
    )
}

blockchain.prototype.getMilestoneBlockId = function (peer,  cb) {
    var lastMilestoneBlockId = null;
    var milestoneBlock = null;
    var finished = false;

    async.whilst(
        function () {
            return !finished;
        },
        function (next) {
            var _lastBlockId = null,
                _lastMilestoneBlockId = null;

            if (lastMilestoneBlockId == null) {
                _lastBlockId = this.getLastBlock().getId();
            } else {
                _lastMilestoneBlockId = lastMilestoneBlockId;
            }

            peer.getMilestoneBlocks(_lastBlockId, _lastMilestoneBlockId, function (err, json) {
                if (err) {
                    return next(true);
                } else {
                    if (!json.milestoneBlockIds) {
                        return next(true);
                    }  else if (json.success == false) {
                        return next(true);
                    } else if (json.milestoneBlockIds.length == 0) {
                        finished = true;
                        milestoneBlock = genesisblock.blockId;
                        return next();
                    } else {
                        for (var i = 0; i < json.milestoneBlockIds.length; i++) {
                            var blockId = json.milestoneBlockIds[i];

                            if (this.blocks[blockId]) {
                                finished = true;
                                milestoneBlock = blockId;
                                return next();
                                break;
                            } else {
                                lastMilestoneBlockId = blockId;
                            }
                        }

                        next();
                    }
                }
            }.bind(this));
        }.bind(this),
        function (err) {
            if (err) {
                return cb(err, null);
            } else if (!finished) {
                return cb(true, null)
            } else {
                return cb(null, milestoneBlock);
            }
        }
    )
}

blockchain.prototype.removeForkedBlocks = function (commonBlock, cb) {
    this.forkProcessingRunning = true;

    var tempFunc = function (lastBlockId, callback) {
        async.whilst(
            function () {
                return (lastBlockId != commonBlock) && (lastBlockId != genesisblock.blockId);
            },
            function (next) {
                this.popLastBlock(function (lBId) {
                    lastBlockId = lBId;

                    setImmediate(next);
                });
            }.bind(this),
            function () {
                callback(lastBlockId);
            }.bind(this)
        )
    }.bind(this);
    if (this.app.db.blockSavingId) {
        this.app.db.queue = [];
        this.app.db.once("blockchainLoaded", function () {
            var lastBlockId = this.getLastBlock().getId();

            tempFunc(lastBlockId, function (b) {
                this.forkProcessingRunning = false;
                cb(b);
            }.bind(this));
        }.bind(this));
    } else {
        var lastBlockId = this.getLastBlock().getId();

        tempFunc(lastBlockId, function (b) {
            this.forkProcessingRunning = false;
            cb(b);
        }.bind(this));
    }
}

blockchain.prototype.popLastBlock = function (cb) {
    var lastBlock = this.getLastBlock();

    if (lastBlock.getId() == genesisblock.blockId) {
        return lastBlock;
    }

    var generator = this.app.accountprocessor.getAccountById(lastBlock.generatorId);
    var ignorList = [];

    for (var i = 0; i < lastBlock.removedWeights.length; i++) {
        for (var j = 0; j < lastBlock.removedWeights[i].accounts.length; j++) {
            var owner = lastBlock.removedWeights[i].accounts[j];
            ignorList.push(owner);
            this.app.accountprocessor.getAccountById(owner).weight = lastBlock.removedWeights[i].weight;
            this.addWeight({ account : owner, weight : lastBlock.removedWeights[i].weight });
        }

    }

    generator.weight = bignum(lastBlock.generationWeight);

    var feePercent = lastBlock.previousFee || 1;

    for (var r  in lastBlock.requests) {
        var request = lastBlock.requests[r];
        var address = request.address;

        if (address != generator.address && ignorList.indexOf(address) < 0) {
            var account = this.app.accountprocessor.getAccountById(address);
            this.removeWeight({ account : address, weight : account.weight });
            account.weight = account.weight.sub(lastBlock.timestamp);
            this.addWeight({ account : address, weight : account.weight });
        }

        this.app.requestprocessor.confirmedRequests[address].pop();

        if (this.app.requestprocessor.confirmedRequests[address].length == 0) {
            this.app.requestprocessor.confirmedRequests[address] = null;
            delete this.app.requestprocessor.confirmedRequests[address];
        }
    }


    var forForger = 0;
    var senders = {};

    for (var i = 0; i < lastBlock.transactions.length; i++) {
        var t = lastBlock.transactions[i];
        var fee = 0;

        if (t.type == 0 || t.type == 1) {
            if (t.subtype == 0) {
                fee = parseInt(t.amount / 100.00 * feePercent);

                if (fee == 0) {
                    fee = 1;
                }
            }
        } else if (t.type == 2) {
            if (t.subtype == 0) {
                fee = 100 * constants.numberLength;
            }
        } else if (t.type == 3) {
            if (t.subtype == 0) {
                fee = 1000 * constants.numberLength;
            }
        }

        if (t.type == 0) {
            if (t.subtype == 0) {
                forForger += fee;
            }
        } else if (t.type == 1) {
            if (t.subtype == 0) {
                if (fee >= 2) {
                    if (fee % 2 != 0) {
                        var r = parseInt(fee / 2);
                        forForger += fee - r;
                    } else {
                        forForger += fee / 2;
                    }
                } else {
                    forForger += fee;
                }
            }
        }  else if (t.type == 2) {
            if (t.subtype == 0) {
                forForger += fee;

                var address = this.app.accountprocessor.getAddressByPublicKey(t.senderPublicKey);
                this.app.signatureprocessor.signatures[address] = null;
                delete this.app.signatureprocessor.signatures[address];
            }
        } else if (t.type == 3) {
            if (t.subtype == 0) {
                forForger += fee / 10;

                var company = t.asset;

                this.app.companyprocessor.addedCompanies[company.domain] = null;
                this.app.companyprocessor.confirmations[company.domain] = null;
                this.app.companyprocessor.addedCompaniesIds[company.getId()] = null;

                delete this.app.companyprocessor.addedCompanies[company.domain];
                delete this.app.companyprocessor.confirmations[company.domain];
                delete this.app.companyprocessor.addedCompaniesIds[company.getId()];

                var index = this.app.companyprocessor.domains.indexOf(company.domain);
                this.app.companyprocessor.domains.splice(index, 1);
            }
        }

        var recipient = this.app.accountprocessor.getAccountById(t.recipientId);
        if (t.type == 0) {
            if (t.subtype == 0) {
                recipient.setBalance(recipient.balance - t.amount);
                recipient.setUnconfirmedBalance(recipient.unconfirmedBalance - t.amount);
            }
        } else if (t.type == 1) {
            if (t.subtype == 0) {
                var value = 0;

                if (fee >= 2) {
                    if (fee % 2 != 0) {
                        value = parseInt(fee / 2);
                    } else {
                        value = fee / 2;
                    }
                }

                recipient.setBalance(recipient.balance - t.amount - value);
                recipient.setUnconfirmedBalance(recipient.unconfirmedBalance - t.amount - value);
            }
        }

        var sender = this.app.accountprocessor.getAccountByPublicKey(t.senderPublicKey);

        if (!senders[sender.address] ) {
            senders[sender.address] = 0;
        }
        senders[sender.address] += t.amount + fee;

        this.app.transactionprocessor.transactions[t.getId()] = null;
        delete this.app.transactionprocessor.transactions[t.getId()];
    }

    for (var i = 0; i < lastBlock.confirmations.length; i++) {
        forForger += 100 * constants.numberLength;

        var c = lastBlock.confirmations[i];
        var toRemove = 0;

        if (c.verified) {
            toRemove = 1;
        }

        // ищем компанию
        var company = this.app.companyprocessor.addedCompaniesIds[c.companyId];

        if (company) {
            this.app.companyprocessor.confirmations[company.domain] -= toRemove;
            this.app.companyprocessor.addedCompanies[company.domain].blocks -= 1;
        } else {
            for (var cId in this.app.companyprocessor.confirmedCompanies) {
                var cp = this.app.companyprocessor.confirmedCompanies[cId];

                if (cp.getId() == c.companyId) {
                    company = cp;
                    break;
                }
            }

            if (company) {
                company.blocks = 9;
                this.app.companyprocessor.addedCompanies[company.domain] = company;
                this.app.companyprocessor.confirmations[company.domain] = company.confirmations - toRemove;
                this.app.companyprocessor.addedCompaniesIds[company.getId()] = company;

                this.app.companyprocessor.confirmedCompanies[company.domain] = null;
                delete this.app.companyprocessor.confirmedCompanies[company.domain];
            } else {
                var index = 0;
                for (var i = 0; i < this.app.companyprocessor.deletedCompanies.length; i++) {
                    var cp = this.app.companyprocessor.deletedCompanies[i];

                    if (cp.getId() == c.companyId) {
                        index = i;
                        company = cp;
                        break;
                    }
                }

                if (company) {
                    company.blocks = 9;
                    this.app.companyprocessor.addedCompanies[company.domain] = company;
                    this.app.companyprocessor.confirmations[company.domain] = company.confirmations - toRemove;
                    this.app.companyprocessor.addedCompaniesIds[company.getId()] = company;

                    this.app.companyprocessor.deletedCompanies.splice(index, 1);
                }
            }
        }
    }

    var forger = this.app.accountprocessor.getAccountByPublicKey(lastBlock.generatorPublicKey);

    forger.setBalance(forger.balance - forForger);
    forger.setUnconfirmedBalance(forger.unconfirmedBalance - forForger);

    for (var s in senders) {
        var sender = this.app.accountprocessor.getAccountById(s);
        sender.addToBalance(senders[s]);
        sender.addToUnconfirmedBalance(senders[s]);

        var popWeight = 0;
        if (senders[s] > 10) {
            popWeight = (Math.log(1 + senders[s]) / Math.LN10);
            popWeight = popWeight / (Math.log(1 + (lastBlock.totalAmount + lastBlock.totalFee)) / Math.LN10);
        } else {
            popWeight = senders[s];
        }

        if (sender.address != generator.address && ignorList.indexOf(sender.address) < 0) {
            if (sender.weight.gt(0)) {
                this.removeWeight({ account : sender.address, weight : sender.weight });
                sender.weight = sender.weight.sub(parseInt(popWeight));
                this.addWeight({ account : sender.address, weight : sender.weight });
            }
        }
    }

    this.app.accountprocessor.purchases[lastBlock.getId()] = null;
    delete this.app.accountprocessor.purchases[lastBlock.getId()];
    this.weight = this.weight.sub(lastBlock.weight);
    this.lastBlock = lastBlock.previousBlock;
    this.fee = feePercent;
    this.nextFeeVolume = lastBlock.nextFeeVolume;
    this.actualFeeVolume = lastBlock.actualFeeVolume;

    var toDelete = lastBlock.getId();
    this.blocks[lastBlock.getId()] = null;
    delete this.blocks[lastBlock.getId()];

    this.app.requestprocessor.unconfirmedRequests = {};
    this.app.requestprocessor.ips = [];

    this.app.db.deleteBlock(toDelete, function () {
        cb(this.getLastBlock().getId());
    }.bind(this));
}

blockchain.prototype.blockFromBytes = function (buffer) {
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();
    var b = new block();

    b.version = bb.readInt();
    b.timestamp = bb.readInt();
    b.previousBlock = bb.readLong();
    b.numbersOfTransactions = bb.readInt();
    b.totalAmount = bb.readLong();
    b.totalFee = bb.readLong();

    b.payloadLength = bb.readInt();
    b.requestsLength = bb.readInt();

    var payloadHash = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        payloadHash[i] = bb.readByte();
    }

    var generatorPublicKey = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        generatorPublicKey[i] = bb.readByte();
    }

    var generationSignature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        generationSignature[i] = bb.readByte();
    }

    var blockSignature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        blockSignature[i] = bb.readByte();
    }

    b.payloadHash = payloadHash;
    b.generatorPublicKey = generatorPublicKey;
    b.blockSignature = blockSignature;

    return b;
}

blockchain.prototype.getFee = function (transaction) {
    var fee = 0;

    switch (transaction.type) {
        case 0:
        case 1:
            switch (transaction.subtype) {
                case 0:
                    fee = parseInt(transaction.amount / 100 * this.fee);

                    if (fee == 0) {
                        fee = 1;
                    }
                break;
            }
        break;

        case 2:
            switch (transaction.subtype) {
                case 0:
                    fee = 100 * constants.numberLength;
                break;
            }
            break;
    }

    return fee;
}


blockchain.prototype.pushBlock = function (buffer, saveToDb, sendToPeers, checkRequests) {
    if (this.forkProcessingRunning) {
        return;
    }

    var b = null;
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();
    b = new block();

    b.version = bb.readInt();
    b.timestamp = bb.readInt();

    var pb = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        pb[i] = bb.readByte();
    }

    b.previousBlock = bignum.fromBuffer(pb, { size: 'auto' }).toString();
    b.numberOfTransactions = bb.readInt();
    b.numberOfRequests = bb.readInt();
    b.numberOfConfirmations = bb.readInt();

    var amountLong = bb.readLong();
    b.totalAmount = new Long(amountLong.low, amountLong.high, false).toNumber();
    var feeLong = bb.readLong();
    b.totalFee = new Long(feeLong.low, feeLong.high, false).toNumber();

    b.payloadLength = bb.readInt();
    b.requestsLength = bb.readInt();
    b.confirmationsLength = bb.readInt();

    var payloadHash = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        payloadHash[i] = bb.readByte();
    }

    var generatorPublicKey = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        generatorPublicKey[i] = bb.readByte();
    }

    var generationSignature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        generationSignature[i] = bb.readByte();
    }

    var blockSignature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        blockSignature[i] = bb.readByte();
    }

    b.payloadHash = payloadHash;
    b.generatorPublicKey = generatorPublicKey;
    b.generationSignature = generationSignature;
    b.blockSignature = blockSignature;

    b.setApp(this.app);

    if (this.getLastBlock().previousBlock == b.previousBlock) {
        this.logger.error("Invalid previous block: " + b.getId() + ", " + b.previousBlock + " must be " + this.getLastBlock().getId());
        return false;
    }

    var curTime = utils.getEpochTime(new Date().getTime());
    if (b.numberOfRequests == 0 || b.timestamp > curTime || b.timestamp <= this.getLastBlock().timestamp || curTime - this.getLastBlock().timestamp < 60) {
        this.logger.error("Invalid block (" + b.getId() + ") time: " + b.timestamp + ", current time: " + curTime + ", last block time: " + this.getLastBlock().timestamp);
        return false;
    }


    if (b.payloadLength > constants.maxPayloadLength || b.requestsLength > constants.maxRequestsLength || b.confirmationsLength > constants.maxConfirmations || b.payloadLength + constants.blockHeaderLength + b.confirmationsLength + b.requestsLength  != buffer.length) {
        this.logger.error("Invalid payload length: " + b.getId(), " length: " + (b.payloadLength + constants.blockHeaderLength + b.requestsLength + b.confirmationsLength), "buffer length: " + buffer.length);
        return false;
    }

    b.index = Object.keys(this.blocks).length + 1;

    if (b.previousBlock != this.lastBlock || this.getBlock(b.getId()) != null || !b.verifyGenerationSignature() || !b.verifyBlockSignature()) {
        this.logger.error("Invalid block signatures: " + b.getId() + ", previous block: " + b.previousBlock + "/" + this.lastBlock + ", generation signature verification: " + b.verifyGenerationSignature() + ", block signature verification: " + b.verifyBlockSignature());
        return false;
    }

    this.logger.info("Load addresses and transactions from block: " + b.getId());

    b.transactions = [];
    for (var i = 0; i < b.numberOfTransactions; i++) {
        b.transactions.push(this.transactionprocessor.transactionFromBuffer(bb));
    }

    b.requests = {};
    for (var i = 0; i < b.numberOfRequests; i++) {
        var r = this.app.requestprocessor.confirmationFromBuffer(bb);
        b.requests[r.address] = r;
    }

    if (Object.keys(b.requests).length == 0) {
        this.app.logger.error("Not enough requests in block: " + b.getId());
        return false;
    }

    b.signatures = [];
    for (var i = 0; i < b.numberOfSignatures; i++) {
        var s = this.app.signatureprocessor.fromByteBuffer(bb);
        b.signatures.push(s);
    }

    b.confirmations = [];
    for (var i = 0; i < b.numberOfConfirmations; i++) {
        var c = this.app.companyprocessor.confirmationFromByteBuffer(bb);
        b.confirmations.push(c);
    }

    b.forForger = 0;

    this.logger.info("Process transactions in block: " + b.getId());
    var accumulatedAmounts = {};
    var i, calculatedTotalAmount = 0, calculatedTotalFee = 0;
    var foundsTrs = {};
    for (i = 0; i < b.transactions.length; i++) {
        var t = b.transactions[i];

        if (t.timestamp > curTime || foundsTrs[t.getId()] || this.transactionprocessor.getTransaction(t.getId()) || (this.transactionprocessor.getUnconfirmedTransaction(t.getId()) && !t.verify())) {
            break;
        }

        var fee = 0;

        if (t.type == 0 || t.type == 1) {
            if (t.subtype == 0) {
                fee = parseInt(t.amount / 100.00 * this.fee);

                if (fee == 0) {
                    fee = 1;
                }
            } else {
                break;
            }
        } else if (t.type == 2) {
            if (t.subtype == 0) {
                fee = 100 * constants.numberLength;

                if (t.amount > 0) {
                    this.logger.error("Amount not valid: " + t.getId());
                    break;
                }

                var s = t.asset;

                if (!s) {
                    this.logger.error("Asset not found: " + t.getId());
                    break;
                }

                if (s.timestamp > curTime || s.timestamp > b.timestamp) {
                    this.logger.error("Can't process asset: " + s.getId() + "(signature), invalid timestamp");
                    break;
                }

                if (!s.verify()) {
                    this.logger.error("Can't process asset: " + s.getId() + "(signature), invalid signature");
                    break;
                }

                if (!s.verifyGenerationSignature()) {
                    this.logger.error("Can't process asset: " + s.getId() + "(signature), invalid generation signature");
                    break;
                }

                var account = this.app.accountprocessor.getAccountByPublicKey(s.generatorPublicKey);

                if (!account) {
                    this.logger.error("Can't process account signature, account not found: " + s.getId());
                    break;
                }

                if (this.app.signatureprocessor.getSignatureByAddress(account.address)) {
                    this.logger.error("Can't process account signature, it's already added: " + s.getId() + " / " + account.address);
                    break;
                }

                s.blockId = b.getId();
                s.transactionId = t.getId();
            } else {
                break;
            }
        } else if (t.type == 3) {
            if (t.subtype == 0) {
                fee = 1000 * constants.numberLength;

                if (t.amount > 0) {
                    this.logger.error("Amount not valid: " + t.getId());
                    break;
                }

                var c = t.asset;

                if (!c) {
                    this.logger.error("Asset not found: " + t.getId());
                    break;
                }

                if (c.timestamp > curTime || c.timestamp > b.timestamp) {
                    this.logger.error("Can't process asset: " + c.getId() + "(signature), invalid timestamp");
                    break;
                }

                if (!c.verify()) {
                    this.logger.error("Can't process asset: " + c.getId() + "(signature), invalid signature");
                    break;
                }

                var account = this.app.accountprocessor.getAccountByPublicKey(c.generatorPublicKey);

                if (!account) {
                    this.logger.error("Can't process account company, account not found: " + c.getId());
                    break;
                }

                var result = this.app.companyprocessor.checkCompanyData(c);

                if (!result) {
                    this.logger.error("Can't process company, invalid data of company: " + c.getId());
                    break;
                }

                if (this.app.companyprocessor.domainExists(c.domain)) {
                    this.logger.error("Can't process request, company domain already added: " + c.getId() + "/" + c.domain);
                    break;
                }

                if (this.app.companyprocessor.confirmations[c.domain] > 0 || this.app.companyprocessor.addedCompanies[c.domain] || this.app.companyprocessor.confirmedCompanies[c.domain]) {
                    this.logger.error("Can't process company, company already added and wait for confirmations: " + c.getId() + "/" + c.domain);
                    break;
                }

                c.blockId = b.getId();
                c.transactionId = t.getId();
            } else {
                break;
            }
        }
        else {
            break;
        }

        var sender = this.accountprocessor.getAccountByPublicKey(t.senderPublicKey);
        if (!accumulatedAmounts[sender.address]) {
            accumulatedAmounts[sender.address] = 0;
        }

        var signature = this.app.signatureprocessor.getSignatureByAddress(sender.address);

        if (signature) {
            if (!t.verifySignature(signature.publicKey)) {
                this.logger.error("Can't verify second segnature: " + transaction.getId());
                break;
            }
        }

        if (t.type == 1 && t.subtype == 0 && t.recipientId[t.recipientId.length - 1] != "D") {
            this.app.logger.error("Can't process transaction: " + t.getId() + ", because invalid type: 0/1");
            break;
        }

        if (t.type == 0 && t.subtype == 0 && t.recipientId[t.recipientId.length - 1] != "C") {
            this.app.logger.error("Can't process transaction: " + t.getId() + ", because invalid type: 1/0");
            break;
        }

        if (t.type == 1 && t.subtype == 0) {
            var recipientId = t.recipientId;

            if (!this.app.companyprocessor.addresses[recipientId]) {
                this.app.logger.error("Can't process transaction: " + t.getId() + ", recipient not found: " + recipientId);
                break;
            }
        }

        accumulatedAmounts[sender.address] += t.amount + fee;
        if (t.type == 0) {
            if (t.subtype == 0) {
                calculatedTotalAmount += t.amount;
                b.forForger += fee;
            } else {
                break;
            }
        } else if (t.type == 1) {
            if (t.subtype == 0) {
                calculatedTotalAmount += t.amount;

                if (fee >= 2) {
                    if (fee % 2 != 0) {
                        var r = parseInt(fee / 2);
                        b.forForger += fee - r;
                    } else {
                        b.forForger += fee / 2;
                    }
                } else {
                    b.forForger += fee;
                }
            } else {
                break;
            }
        }  else if (t.type == 2) {
            if (t.subtype == 0) {
                b.forForger += fee;
            } else {
                break;
            }
        } else if (t.type == 3) {
            if (t.subtype == 0) {
                b.forForger += fee / 10;
            } else {
                break;
            }
        } else {
            break;
        }

        foundsTrs[t.getId()] = true;
        calculatedTotalFee += fee;
    }

    var confirmationsLength = 0;
    var foundsCompany = [];
    for (confirmationsLength = 0; confirmationsLength < b.confirmations.length; confirmationsLength++) {
        var c = b.confirmations[confirmationsLength];

        if (!c.verify(b.generatorPublicKey)) {
            this.app.logger.error("Can't process confirmation, invalid signature: " + b.getId() + " / " + c.getId());
            break;
        }

        if (c.timestamp > b.timestamp || c.timestamp > curTime) {
            this.app.logger.error("Invalid timestamp of confirmation: " + c.getId() + " / " + b.getId());
            break;
        }

        var company = this.app.companyprocessor.addedCompaniesIds[c.companyId];

        if (!company || !this.app.companyprocessor.addedCompanies[company.domain] || this.app.companyprocessor.confirmations[company.domain] <= 0 || this.app.companyprocessor.addedCompanies[company.domain].blocks >= 10 || !this.app.companyprocessor.confirmations[company.domain]) {
            this.app.logger.error("Invalid company: " + c.getId() + " / " + b.getId());
            break;
        }

        if (foundsCompany[company.domain]) {
            this.app.logger.error("Company confirmation already processed in this block: " + c.getId());
            break;
        }

        if (this.app.companyprocessor.confirmedCompanies[company.domain]) {
            this.app.logger.error("Company already confirmed: " + c.getId() + " / " + company.domain);
            break;
        }

        c.blockId = b.getId();
        foundsCompany[company.domain] = company.domain;
        calculatedTotalFee += 100 * constants.numberLength;
        b.forForger += 100 * constants.numberLength;
    }

    if (confirmationsLength != b.numberOfConfirmations) {
        this.logger.error("Invalid number of confirmations: " + b.getId());
        return false;
    }

    if (calculatedTotalAmount != b.totalAmount || calculatedTotalFee != b.totalFee || i != b.transactions.length) {
        this.logger.error("Total amount, fee, transactions count invalid: " + b.getId() + ", total amount: " + calculatedTotalAmount + "/" + b.totalAmount + ", total fee: " + calculatedTotalFee + "/" + b.totalFee + ", transactions count: " + i + "/" + b.transactions.length);
        return false;
    }

    var numOfRequests = 0;
    var found = 0;
    var founds = {};
    for (var r in b.requests) {
        var request = b.requests[r];

        var account = this.app.accountprocessor.getAccountById(request.address);
        if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
            this.logger.error("Request has not enough fee: " + account.address);
            break;
        }

        if (this.app.requestprocessor.unconfirmedRequests[account.address] && !founds[account.address]) {
            founds[account.address] = 1;
            found++;
        }

        request.blockId = b.getId();
        numOfRequests += 1;
    }

    if (numOfRequests == 0) {
        return false;
    }

    if (checkRequests) {
        if (found != Object.keys(this.app.requestprocessor.unconfirmedRequests).length) {
            this.app.logger.error("Can't process, requests in blocks invalids: " + b.getId() + " / " + found + " / " + Object.keys(this.app.requestprocessor.unconfirmedRequests).length);
            return false;
        }
    }

    if (numOfRequests != b.numberOfRequests) {
        this.app.logger.error("Can't process block: " + b.getId() + ", invalid requests invalid: " + numOfRequests + '/' + b.numberOfRequests);
        return false;
    }

    var hash = crypto.createHash('sha256');

    for (i = 0; i < b.transactions.length; i++) {
        hash.update(b.transactions[i].getBytes());
    }

    for (var r in b.requests) {
        hash.update(b.requests[r].getBytes());
    }

    for (var i = 0; i < b.confirmations.length; i++) {
        hash.update(b.confirmations[i].getBytes());
    }

    var a = hash.digest();

    if (this.getLastBlock().height >= 350) {
        if (!utils.bufferEqual(a, b.payloadHash)) {
            this.logger.error("Payload hash invalid: " + b.getId());
            return false;
        }
    }

    for (var a in accumulatedAmounts) {
        var account = this.accountprocessor.getAccountById(a);

        if (account.balance < accumulatedAmounts[a]) {
            this.logger.error("Amount not valid: " + b.getId() + ", with account: " + account.address + ", amount: " + account.balance + "/" + accumulatedAmounts[a]);
            return false;
        }
    }

    if (b.previousBlock != this.getLastBlock().getId()) {
        this.logger.error("Previous block not valid: " + b.getId() + ", " + b.previousBlock + " must be " + this.getLastBlock().getId());
        return false;
    }

    // reset popWeight
    this.app.accountprocessor.resetPopWeight();

    if (!b.analyze()) {
        this.logger.error("Block can't be analyzed: " + b.getId());
        return false;
    }

    for (var i = 0; i < b.transactions.length; i++) {
        b.transactions[i].blockId = b.getId();

        if (!this.transactionprocessor.addTransaction(b.transactions[i])) {
            this.logger.error("Can't add transaction: " + b.getId() + ", transaction: " + b.transactions[i].getId());
            return false;
        }
    }

    for (var i = 0; i < b.confirmations.length; i++) {
        var c = b.confirmations[i];
        var company = this.app.companyprocessor.addedCompaniesIds[c.companyId];

        if (c.verified == true || c.verified == 1) {
            this.app.companyprocessor.confirmations[company.domain] += 1;
        }

        this.app.companyprocessor.addedCompanies[company.domain].blocks += 1;

        if (this.app.companyprocessor.addedCompanies[company.domain].blocks == 10) {
            var confirmations = this.app.companyprocessor.confirmations[company.domain];

            this.app.companyprocessor.confirmations[company.domain] = null;
            this.app.companyprocessor.addedCompanies[company.domain] = null;
            this.app.companyprocessor.addedCompaniesIds[company.getId()] = null;

            delete this.app.companyprocessor.confirmations[company.domain];
            delete this.app.companyprocessor.addedCompanies[company.domain];
            delete this.app.companyprocessor.addedCompaniesIds[company.getId()];

            if (confirmations > 5) {
                company.confirmations = confirmations;
                this.app.companyprocessor.confirmedCompanies[company.domain] = company;

                var addr = new Buffer(8);
                for (var i = 0; i < 8; i++) {
                    addr[i] = company.signature[i];
                }

                addr = bignum.fromBuffer(addr).toString() + "D";
                this.app.companyprocessor.addresses[addr] = company;
            } else {
                company.confirmations = confirmations;

                this.app.companyprocessor.deletedCompanies.push(company);

                var indexOf = this.app.companyprocessor.domains.indexOf(company.domain);

                if (indexOf >= 0) {
                    this.app.companyprocessor.domains.splice(indexOf, 1);
                }
            }
        }
    }

    b.generatorId = this.app.accountprocessor.getAddressByPublicKey(b.generatorPublicKey);

    var generator = this.app.accountprocessor.getAccountById(b.generatorId);
    b.generatorWeight = bignum(generator.weight);
    var tmp = this.removeWeights({ account : b.generatorId, weight : bignum(b.generatorWeight) });
    b.removedWeights = tmp.removed;

    // обнуляем здесь, ибо нужно сделать так, чтоб все не форжащие обнулялись и могли набрать вес.

    for (var i = 0; i < b.transactions.length; i++) {
        var r = this.transactionprocessor.removeUnconfirmedTransaction(b.transactions[i]);

        var fee = 0;

        switch (b.transactions[i].type) {
            case 0:
            case 1:
                switch (b.transactions[i].subtype) {
                    case 0:
                        fee = parseInt(b.transactions[i].amount / 100 * this.fee);

                        if (fee == 0) {
                            fee = 1;
                        }
                        break;
                }
                break;

            case 2:
                switch(b.transactions[i].subtype) {
                    case 0:
                        fee = 100 * constants.numberLength;
                        break;

                }
                break;

            case 3:
                switch (b.transactions[i].subtype) {
                    case 0:
                        fee = 1000 * constants.numberLength;
                        break;
                }
                break;
        }

        b.transactions[i].sender = this.app.accountprocessor.getAccountByPublicKey(b.transactions[i].senderPublicKey).address;

        if (r) {
            var a = this.accountprocessor.getAccountByPublicKey(b.transactions[i].senderPublicKey);
            a.setUnconfirmedBalance(a.unconfirmedBalance + b.transactions[i].amount + fee);
        }

        this.transactionprocessor.getTransaction(b.transactions[i].getId()).fee = fee;
        this.transactionprocessor.getTransaction(b.transactions[i].getId()).blockId = b.getId();

        var sender = b.transactions[i].sender;
        var popWeight = 0;
        var amount = b.transactions[i].fee + b.transactions[i].amount;

        if (amount > 10) {
            popWeight = (Math.log(1 + amount) / Math.LN10);
            popWeight = popWeight / (Math.log(1 + (b.totalAmount + b.totalFee)) / Math.LN10);
        } else {
            popWeight = amount;
        }

        var senderAcc = this.app.accountprocessor.getAccountById(sender);

        if (senderAcc.address != b.generatorId && tmp.accounts.indexOf(sender.address) < 0) {
            if (senderAcc.weight.gt(0)) {
                this.removeWeight({ account: sender, weight: bignum(senderAcc.weight) });
                senderAcc.weight = senderAcc.weight.add(parseInt(popWeight));
                this.addWeight({ account: sender, weight: bignum(senderAcc.weight) });
            }
        }
    }

    for (var r in b.requests) {
        var request = b.requests[r];
        var address = request.address;

        if (!this.app.requestprocessor.confirmedRequests[address]) {
            this.app.requestprocessor.confirmedRequests[address] = [];
        }

        this.app.requestprocessor.confirmedRequests[address].push(request);

        // add some for address weight
        var acc = this.app.accountprocessor.getAccountById(address);

        if (acc.address != b.generatorId && tmp.accounts.indexOf(acc.address) < 0) {
            if (acc.weight.gt(0)) {
                this.removeWeight({ account : acc.address, weight : bignum(acc.weight) });
            }

            acc.weight = acc.weight.add(b.timestamp);
            this.addWeight({ account: acc.address, weight: bignum(acc.weight) });
        }
    }


    generator.weight = bignum(1);

    var elapsedTime = b.timestamp - this.getLastBlock().timestamp;
    b.weight = this.getLastBlock().weight.add(bignum(b.generatorWeight.mul(elapsedTime)));

    this.lastBlock = b.getId();

    this.logger.info("Block processed: " + b.getId());

    // save block, transactions, addresses to db.

    if (saveToDb) {
        this.app.db.writeBlock(b.getId());
    }

    this.app.requestprocessor.unconfirmedRequests = {};
    this.app.requestprocessor.ips = [];

    b.nextFeeVolume = this.nextFeeVolume;
    b.actualFeeVolume = this.actualFeeVolume;

    this.actualFeeVolume += b.totalAmount + b.totalFee;

    var lastFee = this.fee;
    b.previousFee = lastFee;

    if (b.previousBlock) {
        this.blocks[b.previousBlock].nextBlock = b.getId();
    }

    if (this.nextFeeVolume <= this.actualFeeVolume) {
        this.fee -= this.fee / 100 * 25;
        this.nextFeeVolume *= 2;
        this.actualFeeVolume = 0;
    }

    b.fee = this.fee;

    this.weight = this.weight.add(b.generatorWeight);

    for (var tId in this.app.transactionprocessor.unconfirmedTransactions) {
        var t = this.app.transactionprocessor.unconfirmedTransactions[tId];

        if ((t.type == 1 || t.type == 0) && t.subtype == 0) {
            var lastAmount = parseInt(t.amount / 100 * lastFee);

            if (lastAmount == 0) {
                lastAmount = 1;
            }

            lastAmount += t.amount;

            var fee = parseInt(t.amount / 100.00 * this.fee);

            if (fee == 0) {
                fee = 1;
            }

            fee += t.amount;

            a.setUnconfirmedBalance(a.unconfirmedBalance + lastAmount - fee);
        }
    }

    if (sendToPeers) {
        this.app.peerprocessor.sendBlockToAll(b);
    }

    return true;
}

module.exports.addGenesisBlock = function (app, cb) {
    var bc = app.blockchain;
    app.logger.info("Blockchain is trying to find genesis block...");
    var b = bc.getBlock(genesisblock.blockId);

    if (!b) {
        var transactions = [];
        for (var i = 0; i < genesisblock.transactions.length; i++) {
            var gt = genesisblock.transactions[i];
            var t = new transaction(0, null, 0, new Buffer(genesisblock.sender, 'hex'), gt.recipient, gt.amount * constants.numberLength, new Buffer(gt.signature, 'hex'));

            t.sender = app.accountprocessor.getAddressByPublicKey(t.senderPublicKey);
            t.fee = 0;

            if (!t.verify()) {
                app.logger.error("Genesis transaction has not valid signature: " + t.recipientId);
                return cb("Genesis transaction has not valid signature: " + t.recipientId);
            }

            transactions.push(t);
        }

        var req = new requestconfirmation(app.accountprocessor.getAddressByPublicKey(new Buffer(genesisblock.requestGeneratorPublicKey, 'hex')));

        var requestsLength = req.getBytes().length;
        var payloadHash = crypto.createHash('sha256');
        var payloadLength = 0;

        for (var i = 0; i < transactions.length; i++) {
            var bytes = transactions[i].getBytes();
            payloadHash.update(bytes);
            payloadLength += bytes.length;
        }

        payloadHash.update(req.getBytes());

        payloadHash = payloadHash.digest();

        var generationSignature = new Buffer(64);
        generationSignature.fill(0);

        b = new block(0, null, 0, null, transactions, 100000000 * constants.numberLength, 0 * constants.numberLength, payloadLength, payloadHash, new Buffer(genesisblock.sender, 'hex'), generationSignature, new Buffer(genesisblock.blockSignature, 'hex'));
        b.requestsLength = requestsLength;
        b.numberOfTransactions = 1;
        b.numberOfRequests = 1;
        b.height = 1;
        b.requests = [req];
        bc.lastBlock = b.getId();

        for (var i = 0; i < transactions.length; i++) {
            transactions[i].blockId = b.getId();
        }

        req.blockId = b.getId();

        b.setApp(app);
        b.generatorId = '5776140615420062008C';


        var r = b.analyze();

        if (!r) {
            app.logger.error("Genesis block not added");
            return cb("Genesis block not added");
        }


        var address = req.address;
        app.requestprocessor.confirmedRequests[address] = [req];
        app.blockchain.blocks[b.getId()] = b;
        app.blockchain.lastBlock = b.getId();

        app.db.writeBlock(b.getId(), function (err) {
            cb(err);
        });
    } else {
        app.logger.info("Genesis block is found!");
        cb();
    }
}

module.exports.init = function (app) {
    var logger = app.logger;
    var bc = new blockchain(app);
    return bc;
}