var crypti = require('./test/cryptijs');
var request = require('request');


var transaction = crypti.vote.createVote("ms02kfms02kfms02kf", [
	"+3150839c34c483122d0c292cbace8d37b14ed537448c95a52d7618cf401fdeaf"
]);

request({
	method: "POST",
	url: "http://localhost:8040/peer/transactions",
	json: true,
	body: {
		transaction: transaction
	}
}, function (err, resp, body) {
	console.log(err, resp, body);
})