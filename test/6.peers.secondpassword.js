var node = require('./variables.js'),
	crypto = require('crypto');

var account = node.randomAccount();


describe("Peers second signature transactions", function () {
	it("Send second signature from account that doesn't have it. Should return not ok", function (done) {
		var transaction = node.crypti.transaction.createTransaction("1C", 1, node.peers_config.account, account.secondPassword);
		node.peer.post('/transactions')
			.set('Accept', 'application/json')
			.send({
				transaction: transaction
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				node.expect(res.body).to.have.property("success").to.be.false;
				done();
			});
	});

	it.skip("Second signature trash from account that doesn't have it. Should return not ok.", function (done) {

	});

	it.skip("Fund random account and enable second signature. Should return ok.", function (done) {

	});

	it.skip("", function (done) {

	});

	it.skip("", function (done) {

	});
});