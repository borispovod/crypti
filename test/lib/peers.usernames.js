var node = require('./../variables.js'),
	crypto = require('crypto');

var account = node.randomAccount();
var account1 = node.randomAccount();
var account2 = node.randomAccount();
var account3 = node.randomAccount();
var account4 = node.randomAccount();
var username = "";

describe("Peers usernames", function () {

	before(function (done) {
		// OPEN PEERS CONFIG ACCOUNT
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.send({
				secret: account1.password
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				console.log(res.body);
				node.expect(res.body).to.have.property("success").to.be.true;
				if (res.body.success == true && res.body.account != null){
					account1.address = res.body.account.address;
					node.api.put('/transactions')
						.set('Accept', 'application/json')
						.send({
							secret: node.peers_config.account,
							amount: 100000000000,
							recipientId: account1.address
						})
						.expect('Content-Type', /json/)
						.expect(200)
						.end(function (err, res) {
							node.expect(res.body).to.have.property("success").to.be.true;
							done();
						});
				}
				else{
					console.log("Was unable to open account. cannot continue specific test");
					node.expect(true).to.equal(false);
					done();
				}
			});
	});

	it("Register username on new account and then try to register another username. Should return not ok", function (done) {
		var transaction = node.crypti.username.createUsername(account1.password, node.randomDelegateName());
		node.onNewBlock(function (err) {
			node.peer.post('/transactions')
				.set('Accept', 'application/json')
				.send({
					transaction: transaction
				})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					console.log("Trying to register username on new account. Got reply:" + res.body);
					node.expect(res.body).to.have.property("success").to.be.true;
					transaction = node.crypti.username.createUsername(account1.password, node.randomDelegateName());
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
		});
	});

	it("Register delegate and then username (different name). Should return not ok", function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.send({
				secret: account.password
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				account.address = res.body.account.address;
				node.api.put('/transactions')
					.set('Accept', 'application/json')
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

							var transaction = node.crypti.delegate.createDelegate(account.password, node.randomDelegateName());
							node.peer.post('/transactions')
								.set('Accept', 'application/json')
								.send({
									transaction: transaction
								})
								.expect('Content-Type', /json/)
								.expect(200)
								.end(function (err, res) {
									node.expect(res.body).to.have.property("success").to.be.true;

									transaction = node.crypti.username.createUsername(account.password, node.randomDelegateName());

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
			});
	});

	it("Register username and then register delegate (different name). Should return not ok", function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.send({
				secret: account2.password
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				account2.address = res.body.account.address;
				node.api.put('/transactions')
					.set('Accept', 'application/json')
					.send({
						secret: node.peers_config.account,
						amount: 100000000000,
						recipientId: account2.address
					})
					.expect('Content-Type', /json/)
					.expect(200)
					.end(function (err, res) {
						node.onNewBlock(function (err) {
							node.expect(err).to.be.not.ok;

							var transaction = node.crypti.username.createUsername(account2.password, node.randomDelegateName());

							node.peer.post('/transactions')
								.set('Accept', 'application/json')
								.send({
									transaction: transaction
								})
								.expect('Content-Type', /json/)
								.expect(200)
								.end(function (err, res) {
									node.expect(res.body).to.have.property("success").to.be.true;

									transaction = node.crypti.delegate.createDelegate(account2.password, node.randomDelegateName());
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

						}, 10000);
					});
			});
	});

	it("Register username and then register delegate where delegate name is empty string. Should return not ok", function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.send({
				secret: account3.password
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				account3.address = res.body.account.address;
				node.api.put('/transactions')
					.set('Accept', 'application/json')
					.send({
						secret: node.peers_config.account,
						amount: 100000000000,
						recipientId: account3.address
					})
					.expect('Content-Type', /json/)
					.expect(200)
					.end(function (err, res) {
						node.onNewBlock(function (err) {
							node.expect(err).to.be.not.ok;

							var transaction = node.crypti.username.createUsername(account3.password, node.randomDelegateName());

							node.peer.post('/transactions')
								.set('Accept', 'application/json')
								.send({
									transaction: transaction
								})
								.expect('Content-Type', /json/)
								.expect(200)
								.end(function (err, res) {
									node.expect(res.body).to.have.property("success").to.be.true;

									transaction = node.crypti.delegate.createDelegate(account3.password, "");
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

						}, 10000);
					});
			});
	});

	it("Register username and then register delegate. Valid Syntax. Should return ok", function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.send({
				secret: account4.password
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				account4.address = res.body.account.address;
				node.api.put('/transactions')
					.set('Accept', 'application/json')
					.send({
						secret: node.peers_config.account,
						amount: 100000000000,
						recipientId: account4.address
					})
					.expect('Content-Type', /json/)
					.expect(200)
					.end(function (err, res) {
						node.onNewBlock(function (err) {
							node.expect(err).to.be.not.ok;
							username = node.randomDelegateName();
							var transaction = node.crypti.username.createUsername(account4.password, username);

							node.peer.post('/transactions')
								.set('Accept', 'application/json')
								.send({
									transaction: transaction
								})
								.expect('Content-Type', /json/)
								.expect(200)
								.end(function (err, res) {
									node.expect(res.body).to.have.property("success").to.be.true;
									node.onNewBlock(function (err) {
										transaction = node.crypti.delegate.createDelegate(account4.password, username);
										node.peer.post('/transactions')
											.set('Accept', 'application/json')
											.send({
												transaction: transaction
											})
											.expect('Content-Type', /json/)
											.expect(200)
											.end(function (err, res) {
												node.expect(res.body).to.have.property("success").to.be.true;
												done();
											});
									});
								});

						}, 10000);
					});
			});
	});
});