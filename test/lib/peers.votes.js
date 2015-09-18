var node = require('./../variables.js'),
	crypto = require('crypto');

var account = node.randomAccount();

describe("Peers votes", function () {
	it("Double vote for delegate. Should be not ok", function (done) {
		var transaction = node.crypti.vote.createVote(node.peers_config.account, ["+badf44a77df894ccad87fa62bac892e63e5e39fd972f6a3e6e850ed1a1708e98"]);
		node.peer.post('/transactions')
			.set('Accept', 'application/json')
			.set('version',node.version)
			.set('share-port',1)
			.set('port',node.config.port)
			.send({
				transaction: transaction
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				//console.log(res.body);
				node.expect(res.body).to.have.property("success").to.be.false;
				done();
			});
	});

	it("Remove votes from delegate. Should be ok", function (done) {
		var transaction = node.crypti.vote.createVote(node.peers_config.account, ["-badf44a77df894ccad87fa62bac892e63e5e39fd972f6a3e6e850ed1a1708e98"]);
		node.peer.post('/transactions')
			.set('Accept', 'application/json')
			.set('version',node.version)
			.set('share-port',1)
			.set('port',node.config.port)
			.send({
				transaction: transaction
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				//console.log(res.body);
				node.expect(res.body).to.have.property("success").to.be.true;
				done();
			});
	});

	it("Remove votes from delegate and then vote again. Should be not ok", function (done) {
		var transaction = node.crypti.vote.createVote(node.peers_config.account, ["-9062a3b2d585be13b66e705af3f40657a97d0e4a27ec56664e05cdb5c953b0f6"]);
		node.peer.post('/transactions')
			.set('Accept', 'application/json')
			.set('version',node.version)
			.set('share-port',1)
			.set('port',node.config.port)
			.send({
				transaction: transaction
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				node.expect(res.body).to.have.property("success").to.be.true;

				var transaction2 = node.crypti.vote.createVote(node.peers_config.account, ["+9062a3b2d585be13b66e705af3f40657a97d0e4a27ec56664e05cdb5c953b0f6"]);
				node.peer.post('/transactions')
					.set('Accept', 'application/json')
					.set('version',node.version)
					.set('share-port',1)
					.set('port',node.config.port)
					.send({
						transaction: transaction2
					})
					.expect('Content-Type', /json/)
					.expect(200)
					.end(function (err, res) {
						//console.log(res.body);
						node.expect(res.body).to.have.property("success").to.be.false;
						done();
					});
			});
	});

	// not right test, because sometimes new block came and we don't have time to vote
	it("Create new delegate. Should return be ok.", function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.set('version',node.version)
			.set('share-port',1)
			.set('port',node.config.port)
			.send({
				secret: account.password
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				account.address = res.body.account.address;
				account.publicKey = res.body.account.publicKey;
				node.api.put('/transactions')
					.set('Accept', 'application/json')
					.set('version',node.version)
					.set('share-port',1)
					.set('port',node.config.port)
					.send({
						secret: node.peers_config.account,
						amount: 100000000000,
						recipientId: account.address
					})
					.expect('Content-Type', /json/)
					.expect(200)
					.end(function (err, res) {
						node.onNewBlock(function (err) {
							node.expect(err).to.be.not.ok;
							account.username = node.randomDelegateName();
							var transaction = node.crypti.delegate.createDelegate(account.password, account.username);
							node.peer.post('/transactions')
								.set('Accept', 'application/json')
								.set('version',node.version)
								.set('share-port',1)
								.set('port',node.config.port)
								.send({
									transaction: transaction
								})
								.expect('Content-Type', /json/)
								.expect(200)
								.end(function (err, res) {
									node.expect(res.body).to.have.property("success").to.be.true;
									done();
								});
						}, 10000);
					});
			});
	});

	it("Vote for created delegate. Should return not ok", function (done) {
		var transaction = node.crypti.vote.createVote(node.peers_config.account, ["+" + account.publicKey]);
		node.onNewBlock(function (err) {
			node.expect(err).to.be.not.ok;
			node.peer.post('/transactions')
				.set('Accept', 'application/json')
				.set('version',node.version)
				.set('share-port',1)
				.set('port',node.config.port)
				.send({
					transaction: transaction
				})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					node.expect(res.body).to.have.property("success").to.be.true;
					done();
				});
		}, 10000);
	});
});