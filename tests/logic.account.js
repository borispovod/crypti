var async = require('async');
var Account = require('../logic/account.js');
var dbLite = require('../helpers/dbLite.js');

RequestSanitizer = require('../helpers/request-sanitizer.js');

var report = RequestSanitizer.validate({publicKey: ""}, {
	object: true,
	properties: {publicKey: 'int!'}
});

return console.log(report);

async.auto({
	dbLite: function (cb) {
		dbLite.connect("./blockchain.db", cb);
	},
	account: ["dbLite", function (cb, scope) {
		var account = new Account(scope.dbLite, cb);
	}],
	getnull: ["account", function (cb, scope) {
		scope.account.get({address: "123c"}, cb);
	}],
	addaccount: ["account", "getnull", function (cb, scope) {
		scope.account.set("123c", {address: "123c"}, cb);
	}]
}, function (err, scope) {
	//console.log(err, scope);
});