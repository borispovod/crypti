var sqlite3 = require('sqlite3');

module.exports.connect = function (connectString, cb) {
	var db = new sqlite3.Database(connectString);

	db.serialize(function () {
		async.series([
			function (cb) {
				db.run("CREATE TABLE IF NOT EXISTS blocks (id BINARY(8) UNIQUE, version INT NOT NULL, timestamp INT NOT NULL, height INT NOT NULL, previousBlock BINARY(8), numberOfRequests INT NOT NULL, numberOfTransactions INT NOT NULL, numberOfConfirmations INT NOT NULL, totalAmount BIGINT NOT NULL, totalFee BIGINT NOT NULL, payloadLength INT NOT NULL, requestsLength INT NOT NULL, confirmationsLength INT NOT NULL, payloadHash BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, generationSignature BINARY(64) NOT NULL, blockSignature BINARY(64) NOT NULL, FOREIGN KEY (previousBlock) REFERENCES blocks(id))", cb);
			},
			function (cb) {
				db.run("CREATE TABLE IF NOT EXISTS trs (id BINARY(8) UNIQUE, blockId BINARY(8) NOT NULL, blockRowId INTEGER NOT NULL, type TINYINT NOT NULL, subtype TINYINT NOT NULL, timestamp INT NOT NULL, senderPublicKey BINARY(32) NOT NULL, sender BINARY(8) NOT NULL, recipientId BINARY(8) NOT NULL, amount BIGINT NOT NULL, fee BIGINT NOT NULL, signature BINARY(64) NOT NULL, signSignature BINARY(64), FOREIGN KEY(blockId) REFERENCES blocks(id), FOREIGN KEY(blockRowId) REFERENCES blocks(rowid) ON DELETE CASCADE)", cb);
			},
			function (cb) {
				db.run("CREATE TABLE IF NOT EXISTS requests (id BINARY(8) UNIQUE, blockId BINARY(8) NOT NULL, blockRowId INTEGER NOT NULL, address BINARY(8) NOT NULL, FOREIGN KEY(blockId) REFERENCES blocks(id), FOREIGN KEY(blockRowId) REFERENCES blocks(rowid) ON DELETE CASCADE)", cb);
			},
			function (cb) {
				db.run("CREATE TABLE IF NOT EXISTS signatures (id BINARY(8) UNIQUE, transactionId BINARY(8) NOT NULL, transactionRowId INTEGER NOT NULL, timestamp INT NOT NULL, publicKey BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, signature BINARY(64) NOT NULL, generationSignature BINARY(64) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id), FOREIGN KEY(transactionRowId) REFERENCES trs(rowid) ON DELETE CASCADE)", cb);
			},
			function (cb) {
				db.run("CREATE TABLE IF NOT EXISTS companies (id BINARY(8) UNIQUE, transactionId BINARY(8) NOT NULL, transactionRowId INTEGER NOT NULL, name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey BINARY(32) NOT NULL, signature BINARY(32) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id), FOREIGN KEY(transactionRowId) REFERENCES trs(rowid) ON DELETE CASCADE)", cb)
			},
			function (cb) {
				db.run("CREATE TABLE IF NOT EXISTS companyconfirmations (id BINARY(8) UNIQUE, blockId BINARY(8) NOT NULL, blockRowId INTEGER NOT NULL, companyId BINARY(8) NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature BINARY(64) NOT NULL, FOREIGN KEY(blockId) REFERENCES blocks(id), FOREIGN KEY(blockRowId) REFERENCES blocks(rowid) ON DELETE CASCADE)", cb);
			},
			function (cb) {
				db.run("CREATE INDEX IF NOT EXISTS block_row_trs_id ON trs (blockRowId)", cb);
			},
			function (cb) {
				db.run("CREATE INDEX IF NOT EXISTS block_row_requests_id ON requests(blockRowId)", cb);
			},
			function (cb) {
				db.run("CREATE INDEX IF NOT EXISTS transaction_row_signatures_id ON signatures(transactionRowId)", cb);
			},
			function (cb) {
				db.run("CREATE INDEX IF NOT EXISTS transaction_row_companies_id ON companies(transactionRowId)", cb);
			},
			function (cb) {
				db.run("CREATE INDEX IF NOT EXISTS block_row_confirmations_id ON companyconfirmations(blockId)", cb);
			},
			function (cb) {
				db.run("CREATE INDEX IF NOT EXISTS block_height ON blocks(height)", cb);
			}
		], function (err) {
			cb(err, db);
		});
	});
}