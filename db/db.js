var sqlite3 = require('sqlite3').verbose(),
    path = require('path');
    sql = new sqlite3.Database(path.join(__dirname, "..", "blockchain.db")),
    async = require('async');

var db = function (sql) {
    this.sql = sql;
}

db.prototype.writeAddresses = function (address, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("INSERT INTO addresses VALUES($id, $blockId, $version, $timestamp, $publicKey, $generatorPublicKey, $signature, $accountSignature)");
        q.bind({
            $id: address.id,
            $blockId: address.blockId,
            $version: address.version,
            $timestamp: address.timestamp,
            $publicKey: address.publicKey.toString('hex'),
            $generatorPublicKey: address.generatorPublicKey.toString('hex'),
            $signature: address.signature.toString('hex'),
            $accountSignature: address.accountSignature.toString('hex')
        });

        q.run(function (err) {
            if (cb) {
                cb(err);
            }
        });
    }.bind(this));
}

db.prototype.writeTransaction = function (t, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("INSERT INTO trs VALUES($id, $blockId, $type, $subtype, $timestamp, $deadline, $senderPublicKey, $recepient, $amount, $fee, $referencedTransaction, $signature)");
        q.bind({
            $id: t.getId(),
            $blockId: t.blockId,
            $type: t.type,
            $subtype: t.subtype,
            $timestamp: t.timestamp,
            $deadline: t.deadline,
            $senderPublicKey: t.senderPublicKey.toString('hex'),
            $recepient: t.recepient,
            $amount: t.amount,
            $fee: t.fee,
            $referencedTransaction: t.referencedTransaction? t.referencedTransaction : null,
            $signature: t.signature.toString('hex')
        });

        q.run(function (err) {
            if (cb) {
                cb(err);
            }
        });
    }.bind(this));
}

db.prototype.writeBlock = function (block, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("INSERT INTO blocks VALUES($id, $version, $timestamp, $previousBlock, $numberOfAddresses, $numberOfTransactions, $totalAmount, $totalFee, $payloadLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature)");
        q.bind({
            $id: block.getId(),
            $version: block.version,
            $timestamp: block.timestamp,
            $previousBlock: block.previousBlock,
            $numberOfAddresses: block.numberOfAddresses,
            $numberOfTransactions: block.numberOfTransactions,
            $totalAmount: block.totalAmount,
            $totalFee: block.totalFee,
            $payloadLength: block.payloadLength,
            $payloadHash: block.payloadHash.toString('hex'),
            $generatorPublicKey: block.generatorPublicKey.toString('hex'),
            $generationSignature: block.generationSignature.toString('hex'),
            $blockSignature: block.blockSignature.toString('hex')
        });

        q.run(function (err) {
            if (cb) {
                cb(err);
            }
        });
    }.bind(this));
}

db.prototype.readAllAddresses = function (cb) {
    this.sql.serialize(function () {
        this.sql.run("SELECT * FROM addresses", function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    });
}

db.prototype.readAllTransactions = function (cb) {
    this.sql.serialize(function () {
        this.sql.run("SELECT * FROM trs", function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    });
}

db.prototype.readAllBlocks = function (cb) {
    this.sql.serialize(function () {
        this.sql.run("SELECT * FROM blocks", function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    });
}

db.prototype.readTransaction = function (id, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("SELECT * FROM trs WHERE id = ?");
        q.bind(id);
        q.run(function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    }.bind(this));
}

db.prototype.readAddress = function (id, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("SELECT * FROM addresses WHERE id = ?");
        q.bind(id);
        q.run(function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    }.bind(this));
}

db.prototype.readBlock = function (id, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("SELECT * FROM blocks WHERE id = ?");
        q.bind(id);
        q.run(function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    }.bind(this));
}

module.exports.initDb = function (callback) {
    var d = new db(sql);
    d.sql.serialize(function () {
        async.series([
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS blocks (id CHAR(25) NOT NULL, version INT NOT NULL, timestamp TIMESTAMP NOT NULL, previousBlock VARCHAR(25), numberOfAddresses INT NOT NULL, numberOfTransactions INT NOT NULL, totalAmount FLOAT NOT NULL, totalFee FLOAT NOT NULL, payloadLength INT NOT NULL, payloadHash VARCHAR(128) NOT NULL, generatorPublicKey VARCHAR(128) NOT NULL, generationSignature VARCHAR(128) NOT NULL, blockSignature VARCHAR(128) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS trs (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, type INT NOT NULL, subtype INT NOT NULL, timestamp TIMESTAMP NOT NULL, deadline INT NO NULL, senderPublicKey VARCHAR(128) NOT NULL, recepient VARCHAR(25) NOT NULL, amount FLOAT NOT NULL, fee FLOAT NOT NULL, referencedTransaction CHAR(128), signature CHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS addresses (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, version INT NOT NULL, timestamp TIMESTAMP NOT NULL, publicKey VARCHAR(128) NOT NULL, generatorPublicKey VARCHAR(128) NOT NULL, signature VARCHAR(128) NOT NULL, accountSignature VARCHAR(128) NOT NULL, PRIMARY KEY(id))", cb);
            }
        ], function (err) {
            callback(err, d);
        });
    });
}