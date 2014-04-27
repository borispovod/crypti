//
// 1. Проверяем транзакцию на баланс и double spending.
// 2. Добавляем транзакцию в список приватных.
// 3. Рассылаем всем пирам.
// 4. Удаляем из списка приватных, переносим в список публичных.
// 5. Ждем включения транзакции в блок.
//

var transactionprocessor = function (blockchain, accountprocessor, peernetwork) {
    this.privatetransactions = {};
    this.publictransations = {};
    this.blockchain = blockchain;
    this.accountprocessor = accountprocessor;
    this.peernetwork = peernetwork;
}

transactionprocessor.prototype.processTransaction = function (t, sendToPeers, isPublic, cb) {
    var id = t.getId();
    if (this.privatetransactions[id]) {
        delete this.privatetransactions[id];
        this.publictransactions[id] = t;

        if (sendToPeers) {
            this.sendToPeers(t);
        }

        cb(null, true);
    } else {
        t.verify(new Buffer(t.senderPublicKey), 'hex', function (err, r) {
            if (err) {
                return cb(err);
            } else {
                var time = new Date().getTime();
                if (time > t.timestamp + t.deadline) {
                    return cb("Transaction has expired");
                }

                var balance = this.accountprocessor.getBalance(t.senderId);

                this.accountprocessor.getBalance(t.senderId, function (err, balance) {
                    if (err) {
                        return cb(err);
                    } else {
                        if (balance < t.amount + t.fee) {
                            return cb("Account doesn't have needs amount");
                        }

                        if (this.getTransaction(id) || this.blockchain.transactionById(id)) {
                            return cb("Double spending transaction");
                        }

                        if (isPublic) {
                            this.publictransactions[id] = t;
                        } else {
                            this.privatetransactions[id] = t;
                        }

                        if (sendToPeers) {
                            this.sendToPeers(t);
                        }

                        cb(null, true);
                    }
                }.bind(this));


            }
        }.bind(this));
    }
}

transactionprocessor.prototype.getTransaction = function (id, cb) {
    if (this.privatetransactions[id]) {
        if (cb) {
            return cb(this.privatetransactions[id], "private");
        } else {
            return { t : this.privatetransactions[id], type : "private" }
        }
    } else {
        if (this.publictransations[id]) {
            if (cb) {
                return cb(this.publictransations[id], "public");
            } else {
                return { t : this.publictransations[id], type : "public" }
            }
        } else {
            if (cb) {
                cb();
            } else {
                return null;
            }
        }
    }
}

transactionprocessor.prototype.sendToPeers = function (t) {
    this.peernetwork.sendTransactionToPeers(t);
}

module.exports = transactionprocessor;