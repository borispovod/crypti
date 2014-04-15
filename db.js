var sqlite3 = require('sqlite3').verbose(),
    path = require('path');
    db = new sqlite3.Database(path.join(__dirname, "blockchain.db")),
    async = require('async');

module.exports.db = db;
module.exports.initDb = function (cb) {
    db.serialize(function () {
        async.series([
            function (cb) {
                db.run("CREATE TABLE IF NOT EXISTS account (address CHAR(255) NOT NULL, balance INT(11) NOT NULL DEFAULT 0, unconfirmedbalance INT(11) NOT NULL DEFAULT 0, publickey TEXT, PRIMARY KEY(address))", cb);
            },
            function (cb) {
                db.run("CREATE TABLE IF NOT EXISTS block(id INT NOT NULL, timestamp TIMESTAMP NOT NULL, height INT NOT NULL, generatorId CHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            },
            function (cb) {
                db.run("CREATE TABLE IF NOT EXISTS transactiom(id NOT NULL, blockId INT NOT NULL, timestamp TIMESTAMP NOT NULL, sendId CHAR(255) NOT NULL, PRIMARY KEY(id))", cb);
            }
        ], function (err) {
            if (cb) {
                cb(err);
            }
        });
    });
}