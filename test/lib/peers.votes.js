var node = require('./../variables.js'),
	crypto = require('crypto');

var Account1 = node.randomAccount();
var Account2 = node.randomAccount();
var account = node.randomAccount();

describe("Peers votes", function () {

	// OPEN ACCOUNTS

	before(function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.send({
				secret: Account1.password,
				secondSecret: Account1.secondPassword
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				console.log(res.body);
				console.log('Opening Account 1 with password: ' + Account1.password);
				node.expect(res.body).to.have.property("success").to.be.true;
				if (res.body.success == true && res.body.account != null){
					Account1.address = res.body.account.address;
					Account1.publicKey = res.body.account.publicKey;
					Account1.balance = res.body.account.balance;
				}
				else {
					console.log('Unable to open account1, tests will fail');
					console.log('Data sent: secret: ' + Account1.password + ' , secondSecret: ' + Account1.secondPassword );
					node.expect("TEST").to.equal("FAILED");
				}
				done();
			});
	});

	before(function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.send({
				secret: Account2.password,
				secondSecret: Account2.secondPassword
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				console.log(res.body);
				console.log('Opening Account 2 with password: ' + Account2.password);
				node.expect(res.body).to.have.property("success").to.be.true;
				if (res.body.success == true && res.body.account != null) {
					Account2.address = res.body.account.address;
					Account2.publicKey = res.body.account.publicKey;
					Account2.balance = res.body.account.balance;
				}
				else{
					console.log('Unable to open account2, tests will fail');
					console.log('Data sent: secret: ' + Account2.password + ' , secondSecret: ' + Account2.secondPassword );
					node.expect("TEST").to.equal("FAILED");
				}
				done();
			});
	});

	before(function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.send({
				secret: account.password,
				secondSecret: account.secondPassword
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				console.log(res.body);
				console.log('Opening account  with password: ' + account.password);
				node.expect(res.body).to.have.property("success").to.be.true;
				if (res.body.success == true && res.body.account != null) {
					account.address = res.body.account.address;
					account.publicKey = res.body.account.publicKey;
					account.balance = res.body.account.balance;
				}
				else{
					console.log('Unable to open account, tests will fail');
					console.log('Data sent: secret: ' + account.password + ' , secondSecret: ' + account.secondPassword );
					node.expect("TEST").to.equal("FAILED");
				}
				done();
			});
	});

	before(function (done) {
		// SEND XCR TO ACCOUNT 1 ADDRESS
		node.onNewBlock(function(err) {
			randomXCR = node.randomizeXCR();
			node.api.put('/transactions')
				.set('Accept', 'application/json')
				.send({
					secret: node.Faccount.password,
					amount: randomXCR,
					recipientId: Account1.address
				})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					console.log(res.body);
					node.expect(res.body).to.have.property("success").to.be.true;
					done();
				});
		});
	});

	before(function (done) {
		// SEND XCR TO ACCOUNT 2 ADDRESS
		node.onNewBlock(function(err) {
			randomXCR = node.randomizeXCR();
			node.api.put('/transactions')
				.set('Accept', 'application/json')
				.send({
					secret: node.Faccount.password,
					amount: randomXCR,
					recipientId: Account2.address
				})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					console.log(res.body);
					node.expect(res.body).to.have.property("success").to.be.true;
					done();
				});
		});
	});

	it("Double vote for delegate. We expect error", function (done) {
		var transaction = node.crypti.vote.createVote(Account1.password, ["+badf44a77df894ccad87fa62bac892e63e5e39fd972f6a3e6e850ed1a1708e98"]);
		node.peer.post('/transactions')
			.set('Accept', 'application/json')
			.send({
				transaction: transaction
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				console.log(res.body);
				node.expect(res.body).to.have.property("success").to.be.true;
				node.onNewBlock(function (err) {
					node.peer.post('/transactions')
						.set('Accept', 'application/json')
						.send({
							transaction: transaction
						})
						.expect('Content-Type', /json/)
						.expect(200)
						.end(function (err, res) {
							console.log(res.body);
							node.expect(res.body).to.have.property("success").to.be.false;
							done();
						});
				});
			});
	});

	it("Remove votes from delegate. We expect success", function (done) {
		var transaction = node.crypti.vote.createVote(Account1.password, ["-badf44a77df894ccad87fa62bac892e63e5e39fd972f6a3e6e850ed1a1708e98"]);
		node.onNewBlock(function (err) {
			node.peer.post('/transactions')
				.set('Accept', 'application/json')
				.send({
					transaction: transaction
				})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					console.log(res.body);
					node.expect(res.body).to.have.property("success").to.be.true;
					done();
				});
		});
	});

	it("Remove votes from delegate AGAIN (no upVote). We expect error", function (done) {
		var transaction = node.crypti.vote.createVote(Account1.password, ["-badf44a77df894ccad87fa62bac892e63e5e39fd972f6a3e6e850ed1a1708e98"]);
		node.onNewBlock(function (err) {
			node.peer.post('/transactions')
				.set('Accept', 'application/json')
				.send({
					transaction: transaction
				})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					console.log(res.body);
					node.expect(res.body).to.have.property("success").to.be.false;
					done();
				});
		});
	});

	it("Votes for delegate (upvote) and then down vote again in same block. We expect error", function (done) {
		var transaction = node.crypti.vote.createVote(Account1.password, ["+9062a3b2d585be13b66e705af3f40657a97d0e4a27ec56664e05cdb5c953b0f6"]);
		node.onNewBlock(function (err) {
			node.peer.post('/transactions')
				.set('Accept', 'application/json')
				.send({
					transaction: transaction
				})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					node.expect(res.body).to.have.property("success").to.be.true;
					var transaction2 = node.crypti.vote.createVote(Account1.password, ["-9062a3b2d585be13b66e705af3f40657a97d0e4a27ec56664e05cdb5c953b0f6"]);
					node.peer.post('/transactions')
						.set('Accept', 'application/json')
						.send({
							transaction: transaction2
						})
						.expect('Content-Type', /json/)
						.expect(200)
						.end(function (err, res) {
							console.log(res.body);
							node.expect(res.body).to.have.property("success").to.be.false;
							done();
						});
				});
		});
	});

	// not right test, because sometimes new block came and we don't have time to vote
	it("Create new delegate. We expect success.", function (done) {
		node.onNewBlock(function (err) {
			var transaction = node.crypti.delegate.createDelegate(Account2.password, Account2.delegateName);
			node.peer.post('/transactions')
				.set('Accept', 'application/json')
				.send({
					transaction: transaction
				})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				console.log(res.body);
				node.expect(res.body).to.have.property("success").to.be.true;
				done();
			});
		});
	});

	it("Vote for created delegate. We expect error", function (done) {
		var transaction = node.crypti.vote.createVote(Account1.password, ["+" + Account2.publicKey]);
		node.onNewBlock(function (err) {
			node.expect(err).to.be.not.ok;
			node.peer.post('/transactions')
				.set('Accept', 'application/json')
				.send({
					transaction: transaction
				})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					console.log(res.body);
					node.expect(res.body).to.have.property("success").to.be.true;
					done();
				});
		});
	});
});