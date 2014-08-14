var sqlite3 = require('sqlite3').verbose(),
    path = require('path');
    sql = new sqlite3.Database(path.join(__dirname, "..", "blockchain.db")),
    async = require('async');

var db = function (sql) {
    this.sql = sql;
}

db.prototype.writeTransaction = function (t, cb) {
    this.sql.serialize(function () {
        var signSignature = t.signSignature;

        if (signSignature) {
            signSignature = t.signSignature.toString('hex')
        }

        var q = this.sql.prepare("INSERT INTO trs VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $sender, $recipient, $amount, $fee, $creationBlockId, $signature, $signSignature)");
        q.bind({
            $id: t.getId(),
            $blockId: t.blockId,
            $type: t.type,
            $subtype: t.subtype,
            $timestamp: t.timestamp,
            $senderPublicKey: t.senderPublicKey.toString('hex'),
            $recipient: t.recipientId,
            $amount: t.amount,
            $signature: t.signature.toString('hex'),
            $signSignature : signSignature,
            $sender : t.sender,
            $creationBlockId : t.creationBlockId,
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
        var q = this.sql.prepare("INSERT INTO blocks VALUES($id, $version, $timestamp, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generationWeight, $generatorPublicKey, $generationSignature, $blockSignature, $height)");
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
            $payloadHash: block.payloadHash.toString('hex'),
            $generatorPublicKey: block.generatorPublicKey.toString('hex'),
            $generationSignature: block.generationSignature.toString('hex'),
            $blockSignature: block.blockSignature.toString('hex'),
            $height : block.height,
            $requestsLength : block.requestsLength,
            $generationWeight : block.generationWeight,
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
        var r = this.sql.prepare("INSERT INTO requests (id, blockId, lastAliveBlock, publicKey, signature) VALUES($id, $blockId, $lastAliveBlock, $publicKey, $signature)");
        r.bind({
            $id : request.getId(),
            $blockId : request.blockId,
            $lastAliveBlock: request.lastAliveBlock,
            $publicKey : request.publicKey.toString('hex'),
            $signature : request.signature.toString('hex')
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
            $publicKey : signature.publicKey.toString('hex'),
            $generatorPublicKey : signature.generatorPublicKey.toString('hex'),
            $signature : signature.signature.toString('hex'),
            $generationSignature : signature.generationSignature.toString('hex')
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
            $generatorPublicKey : company.generatorPublicKey.toString('hex'),
            $signature : company.signature.toString('hex')
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
            $signature : confirmation.signature.toString('hex')
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

module.exports.initDb = function (callback) {
    var d = new db(sql);
    d.sql.serialize(function () {
        async.series([
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS blocks (id CHAR(25) NOT NULL, version INT NOT NULL, timestamp TIMESTAMP NOT NULL, previousBlock VARCHAR(25),  numberOfRequests INT NOT NULL, numberOfTransactions INT NOT NULL, numberOfConfirmations INT NOT NULL, totalAmount INTEGER NOT NULL, totalFee INTEGER NOT NULL, payloadLength INT NOT NULL, requestsLength INT NOT NULL, confirmationsLength INT NOT NULL, payloadHash VARCHAR(255) NOT NULL, generationWeight FLOAT(53) NOT NULL, generatorPublicKey VARCHAR(255) NOT NULL, generationSignature VARCHAR(255) NOT NULL, blockSignature VARCHAR(255) NOT NULL, height INT NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS trs (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, type INT NOT NULL, subtype INT NOT NULL, timestamp TIMESTAMP NOT NULL, senderPublicKey VARCHAR(128) NOT NULL, sender VARCHAR(25) NOT NULL, recipient VARCHAR(25) NOT NULL, amount INTEGER NOT NULL, fee INTEGER NOT NULL, creationBlockId VARCHAR(25) NOT NULL, signature CHAR(255) NOT NULL, signSignature CHAR(255), PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS requests (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, lastAliveBlock VARCHAR(25) NOT NULL, publicKey VARCHAR(128) NOT NULL, verified TINYINT(1), signature VARCHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS signatures (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, transactionId VARCHAR(25) NOT NULL, timestamp TIMESTAMP NOT NULL, publicKey VARCHAR(128) NOT NULL, generatorPublicKey VARCHAR(128) NOT NULL, signature VARCHAR(255) NOT NULL, generationSignature VARCHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companies (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, transactionId VARCHAR(25) NOT NULL, name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey VARCHAR(128) NOT NULL, signature VARCHAR(255) NOT NULL, PRIMARY KEY(id));", cb)
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companyconfirmations (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, companyId CHAR(25) NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature INT NOT NULL, PRIMARY KEY(id))", cb);
            }
        ], function (err) {
            callback(err, d);
        });
    });
}