var sqlite3 = require('sqlite3').verbose(),
    path = require('path');
    db = new sqlite3.Database(path.join(__dirname, "blockchain.db")),
    async = require('async');

module.exports.db = db;
module.exports.initDb = function (callback) {
    db.serialize(function () {
        async.series([
            function (cb) {
                db.run("CREATE TABLE IF NOT EXISTS account (address CHAR(255) NOT NULL, balance INT(11) NOT NULL DEFAULT 0, unconfirmedbalance INT(11) NOT NULL DEFAULT 0, publickey TEXT, PRIMARY KEY(address))", cb);
            },
            function (cb) {
                db.run("CREATE TABLE IF NOT EXISTS block (id CHAR(255) NOT NULL, timestamp TIMESTAMP NOT NULL, height INT NOT NULL, generatorId CHAR(255) NOT NULL, generatorPubKey CHAR(255) NOT NULL, totalAmount INT NOT NULL, blockSignature CHAR(255) NOT NULL, generationSignature CHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                db.run("CREATE TABLE IF NOT EXISTS trs (id CHAR(255) NOT NULL, blockId CHAR(255) NOT NULL, timestamp TIMESTAMP NOT NULL, senderPublicKey CHAR(255) NOT NULL, senderId CHAR(255) NOT NULL, recipientId CHAR(255) NOT NULL, amount NOT NULL DEFAULT 0, deadline TIMESTAMP, fee INT NOT NULL DEFAULT 0, signature CHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            }
        ], function (err) {
            if (callback) {
                callback(err);
            }
        });
    });
}