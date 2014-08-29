var sqlite3 = require('sqlite3').verbose(),
    path = require('path'),
    async = require('async');

var db = function (path) {
    this.sql = new sqlite3.Database(path);
}

db.prototype.deleteBlock = function (b) {
    this.sql.serialize(function () {
        this.sql.run("DELETE FROM blocks WHERE id=?", b.getId());
        this.sql.run("DELETE FROM trs WHERE blockId=?",b.getId());
        this.sql.run("DELETE FROM companyconfirmations WHERE blockId=?", b.getId());
        this.sql.run("DELETE FROM requests WHERE blockId=?", b.getId());
        this.sql.run("DELETE FROM companies WHERE blockId=?", b.getId());
        this.sql.run("DELETE FROM signatures WHERE blockId=?", b.getId());
    }.bind(this));
}

db.prototype.writeTransaction = function (t, cb) {
    this.sql.serialize(function () {
        var signSignature = t.signSignature;

        if (signSignature) {
            signSignature = t.signSignature;
        }

        var q = this.sql.prepare("INSERT INTO trs VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $sender, $recipient, $amount, $fee, $signature, $signSignature)");
        q.bind({
            $id: t.getId(),
            $blockId: t.blockId,
            $type: t.type,
            $subtype: t.subtype,
            $timestamp: t.timestamp,
            $senderPublicKey: t.senderPublicKey,
            $recipient: t.recipientId,
            $amount: t.amount,
            $signature: t.signature,
            $signSignature : signSignature,
            $sender : t.sender,
            $fee : t.fee
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
        var q = this.sql.prepare("INSERT INTO blocks VALUES($id, $version, $timestamp, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature, $height)");
        q.bind({
            $id: block.getId(),
            $version: block.version,
            $timestamp: block.timestamp,
            $previousBlock: block.previousBlock,
            $numberOfRequests : block.numberOfRequests,
            $numberOfTransactions: block.numberOfTransactions,
            $totalAmount: block.totalAmount,
            $totalFee: block.totalFee,
            $payloadLength: block.payloadLength,
            $payloadHash: block.payloadHash,
            $generatorPublicKey: block.generatorPublicKey,
            $generationSignature: block.generationSignature,
            $blockSignature: block.blockSignature,
            $height : block.height,
            $requestsLength : block.requestsLength,
            $numberOfConfirmations : block.numberOfConfirmations,
            $confirmationsLength : block.confirmationsLength
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
        this.sql.all("SELECT * FROM addresses", function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    });
}

db.prototype.readAllTransactions = function (cb) {
    this.sql.serialize(function () {
        this.sql.all("SELECT * FROM trs", function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    });
}

db.prototype.readAllBlocks = function (cb) {
    this.sql.serialize(function () {
        this.sql.all("SELECT * FROM blocks ORDER BY height", function (err, rows) {
            if (!rows) {
                rows = [];
            }

            if (cb) {
                cb(err, rows);
            }
        });
    }.bind(this));
}

db.prototype.readTransaction = function (id, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("SELECT * FROM trs WHERE id = ?");
        q.bind(id);
        q.get(function (err, rows) {
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
        q.get(function (err, rows) {
            if (cb) {
                cb(err, rows);
            }
        });
    }.bind(this));
}

db.prototype.writePeerRequest = function (request, callback) {
    this.sql.serialize(function () {
        var r = this.sql.prepare("INSERT INTO requests (id, blockId, address) VALUES($id, $blockId, $address)");
        r.bind({
            $id : request.getId(),
            $blockId : request.blockId,
            $address : request.address
        });

        r.run(function (err) {

           if (callback) {
                callback(err);
            }
        });
    }.bind(this));
}

db.prototype.writeSignature = function (signature, callback) {
    this.sql.serialize(function () {
        var r = this.sql.prepare("INSERT INTO signatures (id, blockId, transactionId, timestamp, publicKey, generatorPublicKey, signature, generationSignature) VALUES ($id, $blockId, $transactionId, $timestamp, $publicKey, $generatorPublicKey, $signature, $generationSignature)");
        r.bind({
            $id : signature.getId(),
            $blockId : signature.blockId,
            $transactionId : signature.transactionId,
            $timestamp : signature.timestamp,
            $publicKey : signature.publicKey,
            $generatorPublicKey : signature.generatorPublicKey,
            $signature : signature.signature,
            $generationSignature : signature.generationSignature
        });
        r.run(function (err) {

            if (callback) {
                callback(err);
            }
        })
    }.bind(this));
}

db.prototype.writeCompany = function (company, callback) {
    this.sql.serialize(function () {
        var data = {
            $id : company.getId(),
            $blockId : company.blockId,
            $transactionId : company.transactionId,
            $name : company.name,
            $description : company.description || "",
            $domain : company.domain,
            $email : company.email,
            $timestamp : company.timestamp,
            $generatorPublicKey : company.generatorPublicKey,
            $signature : company.signature
        };

        var r = this.sql.prepare("INSERT INTO companies (id, blockId, transactionId, name, description, domain, email, timestamp, generatorPublicKey, signature) VALUES ($id, $blockId, $transactionId, $name, $description, $domain, $email, $timestamp, $generatorPublicKey, $signature)");
        r.bind(data);
        r.run(function (err) {
            if (callback) {
                callback(err);
            }
        })
    }.bind(this));
}

db.prototype.writeCompanyConfirmation = function (confirmation, callback) {
    this.sql.serialize(function () {
        var data = {
            $id : confirmation.getId(),
            $blockId : confirmation.blockId,
            $companyId :  confirmation.companyId,
            $verified : confirmation.verified,
            $timestamp : confirmation.timestamp,
            $signature : confirmation.signature
        };

        var r = this.sql.prepare("INSERT INTO companyconfirmations (id, blockId, companyId, verified, timestamp, signature) VALUES ($id, $blockId, $companyId, $verified, $timestamp, $signature)");
        r.bind(data);
        r.run(function (err) {
            if (callback) {
                callback(err);
            }
        });
    }.bind(this));
}

module.exports.initDb = function (path, callback) {
    var d = new db(path);

    d.sql.serialize(function () {
        async.series([
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(20) NOT NULL, version INT NOT NULL, timestamp TIMESTAMP NOT NULL, previousBlock VARCHAR(20),  numberOfRequests INT NOT NULL, numberOfTransactions INT NOT NULL, numberOfConfirmations INT NOT NULL, totalAmount INTEGER NOT NULL, totalFee INTEGER NOT NULL, payloadLength INT NOT NULL, requestsLength INT NOT NULL, confirmationsLength INT NOT NULL, payloadHash BLOB NOT NULL, generatorPublicKey BLOB NOT NULL, generationSignature BLOB NOT NULL, blockSignature BLOB NOT NULL, height INT NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS trs (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, type INT NOT NULL, subtype INT NOT NULL, timestamp TIMESTAMP NOT NULL, senderPublicKey BLOB NOT NULL, sender VARCHAR(21) NOT NULL, recipient VARCHAR(21) NOT NULL, amount INTEGER NOT NULL, fee INTEGER NOT NULL, signature BLOB NOT NULL, signSignature BLOB, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS requests (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, address VARCHAR(21) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS signatures (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, timestamp TIMESTAMP NOT NULL, publicKey BLOB NOT NULL, generatorPublicKey BLOB NOT NULL, signature BLOB NOT NULL, generationSignature BLOB NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companies (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey BLOB NOT NULL, signature BLOB NOT NULL, PRIMARY KEY(id));", cb)
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companyconfirmations (id VARCHAR(20) NOT NULL, blockId VARCHAR(20) NOT NULL, companyId VARCHAR(20) NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature BLOB NOT NULL, PRIMARY KEY(id))", cb);
            }
        ], function (err) {
            callback(err, d);
        });
    });
}