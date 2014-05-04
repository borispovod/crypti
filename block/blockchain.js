var genesisblock = require("./genesisblock.js"),
    crypto = require('crypto'),
    block = require("./block.js"),
    transaction = require('../transactions').transaction;

var blockchain = function (db, transationprocessor, accountprocessor) {
    this.db = db;
    this.transactionprocessor = transactionprocessor;
    this.blocks = [];
    this.accountprocessor = accountprocessor;
}

blockchain.prototype.findBlock = function (blockId, cb) {
    this.db.serialize(function () {
        var s = this.db.prepare("SELECT * FROM block WHERE id=? LIMIT 1");
        s.bind(blockId);

        s.get(function (err, row) {
           if (err) {
               cb(err);
           } else {
                cb(null, row);
           }
        });
    }.bind(this));
}

blockchain.prototype.transactionById = function (tId, cb) {
    this.db.serialize(function () {
        var s = this.db.prepare("SELECT * FROM trs WHERE id=? LIMIT 1");
        s.bind(tId);

        s.get(function (err, row) {
            if (err) {
                cb(err);
            } else {
                cb(null, row);
            }
        });
    });
}

blockchain.prototype.pushBlock = function (b, cb) {
    b.getId(function (err, id) {
       if (err) {
           cb(err);
       }  else {
           this.db.serialize(function () {
               var s = this.db.prepare("INSERT INTO block (id, timestamp, height, generatorId, generatorPubKey, totalAmount, blockSignature, generationSignature) VALUES(?, ?, ?, ?, ?, ?, ?, ?)");
               s.bind([id, b.timestamp, b.height || 0, b.generatorId, b.generatorPublicKey, b.totalAmount, b.blockSignature.toString('hex'), b.generationSignature.toString('hex') ]);
               s.run(function (err) {
                   if (err) {
                       cb(err);
                   } else {
                       for (var i = 0; i < b.transactions.length; i++) {
                           var t = b.transactions[i];
                           var s = this.db.prepare("INSERT INTO trs (id, blockId, timestamp, senderPublicKey, senderId, recipientId, amount, deadline, fee, signature) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                           s.bind([t.getId(), id, t.timestamp, t.senderPublicKey, t.senderId, t.recipientId, t.amount, t.deadline, t.fee, t.signature.toString('hex')]);
                           s.run(function (err) {
                               if (err) {
                                   cb(err);
                               } else {
                                   this.blocks.push(b);
                                   cb();
                               }
                           }.bind(this));
                       }
                   }
               }.bind(this));
           }.bind(this));
       }
    }.bind(this));
}

blockchain.prototype.getLastBlock = function (cb) {
    if (cb) {
        cb(this.blocks[this.blocks.length - 1]);
    } else {
        return this.blocks[this.blocks.length - 1];
    }
}

blockchain.prototype.generateBlock = function (username, password, cb) {
    var amount = 0;
    var fee = 0;
    var transacations = [];
    var payloadLength = 0;
    var ammounts = {};

    var blockTimestamp = new Date().getTime();

    while (payloadLength <= 255 * 128) {
        var numberOfTransactions = this.transactionprocessor.publictransations.length;
        for (var i = 0; i < numberOfTransactions; i++) {
            var transaction = this.transactionprocessor.publictransactions[i];
            var size = transation.getSize();

            // здесь еще проверка на новые транзакции.
            if (payloadLength + size > 255 * 128) {
                continue;
            }

            var senderId = transaction.senderId;

            accountprocessor.getBalance(senderId, function (err, balance) {
               if (err) {
                   if (transaction.amount + transaction.fee > balance) {
                       continue;
                   }

                   if (transacation.timestamp > blockTimestamp || transaction.deadline > blockTimestamp) {
                       continue;
                   }

                   this.transactionprocessor.getTransaction(transaction.getId(), function (t) {
                       if (t) {
                           continue;
                       } else {
                           this.ammounts
                       }
                   }.bind(this));
               }
            }.bind(this));


        }
    }

    /*Set<TransactionImpl> sortedTransactions = new TreeSet<>();

    for (TransactionImpl transaction : transactionProcessor.getAllUnconfirmedTransactions()) {
        if (transaction.getReferencedTransactionId() == null || TransactionDb.hasTransaction(transaction.getReferencedTransactionId())) {
            sortedTransactions.add(transaction);
        }
    }

    SortedMap<Long, TransactionImpl> newTransactions = new TreeMap<>();
    Map<TransactionType, Set<String>> duplicates = new HashMap<>();
    Map<Long, Long> accumulatedAmounts = new HashMap<>();

    int totalAmount = 0;
    int totalFee = 0;
    int payloadLength = 0;

    int blockTimestamp = Convert.getEpochTime();

    while (payloadLength <= Constants.MAX_PAYLOAD_LENGTH) {

        int prevNumberOfNewTransactions = newTransactions.size();

        for (TransactionImpl transaction : sortedTransactions) {

            int transactionLength = transaction.getSize();
            if (newTransactions.get(transaction.getId()) != null || payloadLength + transactionLength > Constants.MAX_PAYLOAD_LENGTH) {
                continue;
            }

            Long sender = transaction.getSenderId();
            Long accumulatedAmount = accumulatedAmounts.get(sender);
            if (accumulatedAmount == null) {
                accumulatedAmount = 0L;
            }

            long amount = (transaction.getAmount() + transaction.getFee()) * 100L;
            if (accumulatedAmount + amount > Account.getAccount(sender).getBalance()) {
                continue;
            }

            if (transaction.getTimestamp() > blockTimestamp + 15 || (transaction.getExpiration() < blockTimestamp)) {
                continue;
            }

            if (transaction.isDuplicate(duplicates)) {
                continue;
            }

            try {
                transaction.validateAttachment();
            } catch (NxtException.ValidationException e) {
                continue;
            }

            accumulatedAmounts.put(sender, accumulatedAmount + amount);

            newTransactions.put(transaction.getId(), transaction);
            payloadLength += transactionLength;
            totalAmount += transaction.getAmount();
            totalFee += transaction.getFee();

        }

        if (newTransactions.size() == prevNumberOfNewTransactions) {
            break;
        }
    }

    final byte[] publicKey = Crypto.getPublicKey(secretPhrase);

    MessageDigest digest = Crypto.sha256();
    for (Transaction transaction : newTransactions.values()) {
        digest.update(transaction.getBytes());
    }

    byte[] payloadHash = digest.digest();

    BlockImpl previousBlock = blockchain.getLastBlock();
    if (previousBlock.getHeight() < Constants.TRANSPARENT_FORGING_BLOCK) {
        Logger.logDebugMessage("Generate block below " + Constants.TRANSPARENT_FORGING_BLOCK + " no longer supported");
        return;
    }

    digest.update(previousBlock.getGenerationSignature());
    byte[] generationSignature = digest.digest(publicKey);

    BlockImpl block;
    //int version = previousBlock.getHeight() < Constants.TRANSPARENT_FORGING_BLOCK ? 1 : 2;
    int version = 2;
    byte[] previousBlockHash = Crypto.sha256().digest(previousBlock.getBytes());

    try {

        block = new BlockImpl(version, blockTimestamp, previousBlock.getId(), totalAmount, totalFee, payloadLength,
            payloadHash, publicKey, generationSignature, null, previousBlockHash, new ArrayList<>(newTransactions.values()));

    } catch (NxtException.ValidationException e) {
        // shouldn't happen because all transactions are already validated
        Logger.logMessage("Error generating block", e);
        return;
    }

    block.sign(secretPhrase);

    block.setPrevious(previousBlock);

    try {
        pushBlock(block);
        blockListeners.notify(block, Event.BLOCK_GENERATED);
        Logger.logDebugMessage("Account " + Convert.toUnsignedLong(block.getGeneratorId()) + " generated block " + block.getStringId());
    } catch (BlockNotAcceptedException e) {
        Logger.logDebugMessage("Generate block failed: " + e.getMessage());
    }*/
}

module.exports.init = function (db, cb) {
    var bc = new blockchain(db);

    bc.findBlock(genesisblock.blockId, function (err, gb) {
        if (err) {
            cb(err);
        } else {
            if (gb) {
                cb(null, bc);
            } else {

                // creating genesis block
                var t = new transaction(null, 0, genesisblock.publicKey, genesisblock.recipient, genesisblock.recipient, genesisblock.amount,  0, 0, new Buffer(genesisblock.trSignature));
                var thash = crypto.createHash('sha256').update(JSON.stringify(t)).digest();
                var gb = new block(0, genesisblock.amount, 0, genesisblock.publicKey, genesisblock.recipient, thash, new Buffer(genesisblock.blockSignature), [t]);

                bc.pushBlock(gb, function (err) {
                    if (err) {
                        cb(err);
                    } else {
                        cb(null, bc);
                    }
                });
            }
        }
    });
}