var dblite = require('dblite');
var async = require('async');
var path = require('path');

//dblite.bin = path.join(process.cwd(), 'sqlite', 'sqlite3');

module.exports.connect = function (connectString, cb) {
	var db = dblite(connectString);

	var sql = [
		"CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(20) PRIMARY KEY, version INT NOT NULL, timestamp INT NOT NULL, height INT NOT NULL, previousBlock VARCHAR(21), numberOfRequests INT NOT NULL, numberOfTransactions INT NOT NULL, numberOfConfirmations INT NOT NULL, totalAmount BIGINT NOT NULL, totalFee BIGINT NOT NULL, previousFee REAL NOT NULL, nextFeeVolume BIGINT NOT NULL, feeVolume BIGINT NOT NULL, payloadLength INT NOT NULL, requestsLength INT NOT NULL, confirmationsLength INT NOT NULL, payloadHash BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, generationSignature BINARY(64) NOT NULL, blockSignature BINARY(64) NOT NULL, FOREIGN KEY ( previousBlock ) REFERENCES blocks ( id ) ON DELETE SET NULL)",
		"CREATE TABLE IF NOT EXISTS trs (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, type TINYINT NOT NULL, subtype TINYINT NOT NULL, timestamp INT NOT NULL, senderPublicKey BINARY(32) NOT NULL, senderId VARCHAR(21) NOT NULL, recipientId VARCHAR(21), amount BIGINT NOT NULL, fee BIGINT NOT NULL, signature BINARY(64) NOT NULL, signSignature BINARY(64), FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS requests (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, address VARCHAR(21) NOT NULL, FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS signatures (id VARCHAR(20) PRIMARY KEY, transactionId VARCHAR(20) NOT NULL, timestamp INT NOT NULL, publicKey BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, signature BINARY(64) NOT NULL, generationSignature BINARY(64) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS companies (id VARCHAR(20) PRIMARY KEY, transactionId VARCHAR(20) NOT NULL, address VARCHAR(21), name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey BINARY(32) NOT NULL, signature BINARY(32) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS companyconfirmations (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, companyId VARCHAR(20) NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature BINARY(64) NOT NULL, FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS peers (ip INTEGER NOT NULL, port TINYINT NOT NULL, state TINYINT NOT NULL, os VARCHAR(64), sharePort TINYINT NOT NULL, version VARCHAR(11), clock INT)",
		"CREATE UNIQUE INDEX IF NOT EXISTS peers_unique ON peers(ip, port)",
		"CREATE UNIQUE INDEX IF NOT EXISTS blocks_height ON blocks(height)",
		"CREATE INDEX IF NOT EXISTS blocks_generator_public_key ON blocks(generatorPublicKey)",
		"CREATE INDEX IF NOT EXISTS trs_block_id ON trs (blockId)",
		"CREATE INDEX IF NOT EXISTS trs_sender_id ON trs(senderId)",
		"CREATE INDEX IF NOT EXISTS trs_recipient_id ON trs(recipientId)",
		"CREATE INDEX IF NOT EXISTS requests_block_id ON requests (blockId);",
		"CREATE INDEX IF NOT EXISTS signatures_trs_id ON signatures(transactionId)",
		"CREATE INDEX IF NOT EXISTS signatures_generator_public_key ON signatures(generatorPublicKey)",
		"CREATE INDEX IF NOT EXISTS companies_trs_id ON companies(transactionId)",
		"CREATE INDEX IF NOT EXISTS companyconfirmations_block_id ON companyconfirmations(blockId)",
		"CREATE INDEX IF NOT EXISTS companyconfirmations_company_id ON companyconfirmations(companyId)",
		"PRAGMA foreign_keys = ON",
		"UPDATE peers SET state = 1, clock = null where state != 0"
	];

	async.eachSeries(sql, function (command, cb) {
		db.query(command, function (err, res) {
			console.log("Result of query: ", err, res);
			cb(err, res);
		});
	}, function (err) {
		cb(err, db);
	}.bind(this));
}