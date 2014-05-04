var crypto = require('crypto'),
    bignum = require('bignum');

var forger = function (username, password, publicKey, account, accountprocessor, blockchain) {
    this.username = username;
    this.password = password;
    this.publicKey = publicKey;
    this.account = account;
    this.accountprocessor = accountprocessor;
    this.blockchain = blockchain;
    this.deadline = 0;

    this.lastBlocks = {};
    this.hits = {};
}

forger.prototype.forge = function (cb) {
    this.accountprocessor.getEffectiveBalance(function (err, balance) {
        if (err) {
            cb(err);
        } else {
            if (balance <= 0) {
                return cb("Error, dont have balance for foging");
            }

            var lastBlock = this.blockchain.getLastBlock();
            if (lastBlock.getId() != this.lastBlocks[this.account]) {
                var hash = crypto.createHash('sha256');
                hash.update(lastBlock.generationSignature);
                hash.update(this.publicKey);
                var genHash = hash.digest();


                var id = new Buffer(8);
                for (var i = 0; i < 8; i++) {
                    id[i] = genHash[7-i];
                }

                this.lastBlocks[this.account] = lastBlock;
                this.hits[this.account] = id;

                var total = bignum.fromBuffer(id).div(bignum.fromBuffer(lastBlock.baseTarget)).mul(bignum(balance));
                var epochTime = new Date().setDate(1).setMonth(4).setFullYear(2014).setTime(0, 0, 0, 0).getTime();
                var elapsed = new Date().getTime() - epochTime - lastBlock.timestamp;

                if (total.lt(0)) {
                    this.deadline = 0;
                } else {
                    this.deadline = total;
                }

            }

            var epochTime = new Date().setDate(1).setMonth(4).setFullYear(2014).setTime(0, 0, 0, 0).getTime();
            var elapsed = new Date().getTime() - epochTime - lastBlock.timestamp;
            if (elapsed > 0) {
                var target = bignum.fromBuffer(lastBlock.baseTarget).mul(bignum(balance)).mul(bignum(elapsed)).toBuffer();
                if (hits[this.account] != target) {
                    this.blockchain.generateBlock(this.username, this.password, function () {
                        if (cb) {
                            cb();
                        }
                    });
                }
            } else {
                if (cb) {
                    cb();
                }
            }

        }
    }.bind(this));
}

forger.prototype.stopforge = function () {

}

forger.prototype.getDeadline = function () {

}