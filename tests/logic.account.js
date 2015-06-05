var Account = require('../logic/account.js');
var dbLite = require('../helpers/dbLite.js');

dbLite.connect("./blockchain.db", function (err, db) {
	var account = new Account();

	account.get({address: "123c"});

	account.set("123c", {"publicKey": "0xff"});

	account.set("123c", {"balance": 1000});

	account.get({address: "123c"});

	account.remove("123c");

	account.get({address: "123c"});
});