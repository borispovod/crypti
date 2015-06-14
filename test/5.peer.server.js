var express = require('express');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var node = require('./variables.js');

var app = express();
app.use(bodyParser.urlencoded({extended: true, parameterLimit: 5000}));
app.use(bodyParser.json());
app.use(methodOverride());

var port = node.config.peers.list[0].port;

describe("Peer server", function () {
	before(function () {
		app.listen(port, function (err) {
			if (err) {
				console.error(err);
			}
		});
	});

	it("send amount transaction, should send object", function (done) {
		app.post('/peer/transactions', function (req, res) {
			node.expect(req.body).to.have.property("transaction");
			done();
		});

		var transaction = node.crypti.transaction.createTransaction("1C", 1, node.peers_config.account);
		node.peer.post('/transactions')
			.set('Accept', 'application/json')
			.send({
				transaction: transaction
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				console.log(res.body);
			});
	});
});