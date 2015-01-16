var sqlite3 = require('sqlite3'),
	transactionsDb = require("sqlite3-transactions").TransactionDatabase,
	async = require('async');

module.exports.connect = function (connectString, cb) {
	var db = new transactionsDb(new sqlite3.Database(connectString));

	// varchar(20) for ids, varchar(21) for addresses

}