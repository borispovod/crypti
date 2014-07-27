var sqlite3 = require('sqlite3').verbose(),
    path = require('path');
    sql = new sqlite3.Database(path.join(__dirname, "..", "blockchain.db")),
    async = require('async');

var db = function (sql) {
    this.sql = sql;
}

/*db.prototype.writePeer = function (peer, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("INSERT INTO peer VALUES($ip, $port, $version, $platform, $timestamp, $publicKey, $blocked)");
        q.bind({
            $ip : peer.ip,
            $port : peer.port,
            $version : peer.version,
            $platform: peer.platform,
            $timestamp: peer.timestamp,
            $publicKey : peer.publicKey.toString('hex'),
            $blocked : peer.blocked
        });

        q.run(function (err) {
            if (cb) {
                if (err) {
                    console.log(err);
                }

                cb(err);
            }
        });
    }.bind(this));
}*/

db.prototype.writeAddress = function (address, cb) {
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
                console.log(err);
                cb(err);
            }
        });
    }.bind(this));
}

db.prototype.writeTransaction = function (t, cb) {
    this.sql.serialize(function () {
        var q = this.sql.prepare("INSERT INTO trs VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $recepient, $amount, $fee, $signature)");
        q.bind({
            $id: t.getId(),
            $blockId: t.blockId,
            $type: t.type,
            $subtype: t.subtype,
            $timestamp: t.timestamp,
            $senderPublicKey: t.senderPublicKey.toString('hex'),
            $recepient: t.recipientId,
            $amount: t.amount,
            $fee: t.fee,
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
        var q = this.sql.prepare("INSERT INTO blocks VALUES($id, $version, $timestamp, $previousBlock, $numberOfAddresses, $numberOfTransactions, $totalAmount, $totalFee, $payloadLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature, $height)");
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
            $blockSignature: block.blockSignature.toString('hex'),
            $height : block.height
        });

        q.run(function (err) {
            if (cb) {
                console.log(err);
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

db.prototype.writePeerRequest = function (peerRequest, callback) {
    this.sql.serialize(function () {
        var r = this.sql.prepare("SELECT ip FROM peerRequests WHERE id=$ip");

        r.bind({
            $ip : peerRequest.ip
        });

        r.get(function (err, peerRequest) {
            if (err) {
                callback(err);
            } else {
                if (peerRequest) {
                    r = this.sql.prepare("UPDATE peerRequests SET ip=$ip, lastAliveBlock=$lastAliveBlock, publicKey=$publicKey, signature=$signature");

                    r.bind({
                        $ip : peerRequest.ip,
                        $lastAliveBlock : peerRequest.lastAliveBlock,
                        $publicKey : $peerRequest.pubicKey,
                        $signature : $peerRequest.signature
                    });

                    r.run(function (err) {
                        callback(err);
                    });
                } else {
                    r = this.sql.prepare("INSERT INTO peerRequest VALUES($ip, $lastActiveBlock, $publicKey, $signature)");

                    r.bind({
                        $ip : peerRequest.ip,
                        $lastAliveBlock : peerRequest.lastAliveBlock,
                        $publicKey : peerRequest.publicKey,
                        $signature : peerRequest.signature
                    });

                    r.run(function (err) {
                        callback(err);
                    });
                }
            }
        }.bind(this));
    }.bind(this));
}

module.exports.initDb = function (callback) {
    var d = new db(sql);
    d.sql.serialize(function () {
        async.series([
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS blocks (id CHAR(25) NOT NULL, version INT NOT NULL, timestamp TIMESTAMP NOT NULL, previousBlock VARCHAR(25), numberOfAddresses INT NOT NULL, numberOfTransactions INT NOT NULL, totalAmount INTEGER NOT NULL, totalFee INTEGER NOT NULL, payloadLength INT NOT NULL, payloadHash VARCHAR(255) NOT NULL, generatorPublicKey VARCHAR(255) NOT NULL, generationSignature VARCHAR(255) NOT NULL, blockSignature VARCHAR(255) NOT NULL, height INT NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS trs (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, type INT NOT NULL, subtype INT NOT NULL, timestamp TIMESTAMP NOT NULL, senderPublicKey VARCHAR(128) NOT NULL, recepient VARCHAR(25) NOT NULL, amount INTEGER NOT NULL, fee INTEGER NOT NULL, signature CHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS addresses (id CHAR(25) NOT NULL, blockId CHAR(25) NOT NULL, version INT NOT NULL, timestamp TIMESTAMP NOT NULL, publicKey VARCHAR(128) NOT NULL, generatorPublicKey VARCHAR(128) NOT NULL, signature VARCHAR(255) NOT NULL, accountSignature VARCHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS peerRequests (ip VARCHAR(20) NOT NULL, lastAliveBlock VARCHAR(25) NOT NULL, publicKey VARCHAR(128) NOT NULL, signature VARCHAR(255) NOT NULL, PRIMARY KEY(ip))", cb);
            }
            /*function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS peer (ip CHAR(20) NOT NULL, port INT NOT NULL, version VARCHAR(10) NOT NULL, platform VARCHAR(255), timestamp TIMESTAMP NOT NULL, publicKey VARCHAR(128) NOT NULL UNIQUE, blocked BOOL NOT NULL DEFAULT 0, PRIMARY KEY(ip))", cb);
            }*/
        ], function (err) {
            callback(err, d);
        });
    });
}