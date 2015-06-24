var async = require('async');
var Account = require('../logic/account.js');
var dbLite = require('../helpers/dbLite.js');

//RequestSanitizer = require('../helpers/request-sanitizer.js');
//
//var report = RequestSanitizer.validate({address: "123c", publicKey: "ff"}, {
//	object: true,
//	properties: {publicKey: 'hex!'}
//});
//
//return console.log(report);


async.auto({
	dbLite: function (cb) {
		dbLite.connect("./blockchain.db", cb);
	},
	account: ["dbLite", function (cb, scope) {
		var account = new Account(scope, cb);
	}],
	getnull: ["account", function (cb, scope) {
		console.log("getnull")
		scope.account.get({address: "123c"}, cb);
	}],
	addaccount: ["getnull", function (cb, scope) {
		console.log("addaccount")
		scope.account.set("123c", {publicKey: "ff"}, cb);
	}],
	mergeaccount: ["addaccount", function (cb, scope) {
		console.log("mergeaccount")
		debugger;
		scope.account.merge("123c", {balance: -5, delegates: "+1c,+2c,-3c,-4c", contacts: "-1c,-2c,+3c,+4c"}, cb);
	}]
	//getaccount: ["account", "mergeaccount", function (cb, scope) {
	//	scope.account.get({address: "123c"}, cb);
	//}]
}, function (err, scope) {
	console.log(err, scope);
});