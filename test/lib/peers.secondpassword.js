var node = require('./../variables.js'),
	crypto = require('crypto');

var account = node.randomAccount();
var account2 = node.randomAccount();
var account3 = node.randomAccount();

describe("Peers second signature transactions", function () {
	it("Send second signature from account that doesn't have it. Should return not ok", function (done) {
		var transaction = node.crypti.transaction.createTransaction("1C", 1, node.peers_config.account, account.secondPassword);
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

	it("Send second signature from account that have no funds. Should return not ok", function (done) {
		var transaction = node.crypti.signature.createSignature(node.randomPassword(), node.randomPassword());
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

	it("Fund random account and enable second signature. Should return ok.", function (done) {
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
						//console.log(res.body);
						node.expect(res.body).to.have.property("success").to.be.true;

						node.onNewBlock(function (err) {
							node.expect(err).to.be.not.ok;
							var transaction = node.crypti.signature.createSignature(account.password, account.secondPassword);
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
									console.log(transaction.recipientId);
									console.log(account.address);
									node.expect(res.body).to.have.property("success").to.be.true;
									node.onNewBlock(done);
								});
						});
					});
			});
	});

	it("Test transaction with second signature. Should return ok", function (done) {
		var transaction = node.crypti.transaction.createTransaction("1C", 1, account.password, account.secondPassword);
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

	it("Test transaction without second signature. Should return not ok", function (done) {
		var transaction = node.crypti.transaction.createTransaction("1C", 1, account.password);
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

	it("Test transaction with fake second signature. Should return not ok", function (done) {
		var transaction = node.crypti.transaction.createTransaction("1C", 1, account.password, account.secondPassword);
		transaction.signSignature = crypto.randomBytes(64).toString('hex');
		transaction.id = node.crypti.crypto.getId(transaction);
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

	it("Create new account with second signature and send transaction without second signature. Should return not ok", function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.set('version',node.version)
			.set('share-port',1)
			.set('port',node.config.port)
			.send({
				secret: account2.password
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				//console.log(res.body);
				node.expect(res.body).to.have.property('success').to.be.true;
				account2.address = res.body.account.address;
				node.api.put('/transactions')
					.set('Accept', 'application/json')
					.set('version',node.version)
					.set('share-port',1)
					.set('port',node.config.port)
					.send({
						secret: node.peers_config.account,
						amount: 100000000000,
						recipientId: account2.address
					})
					.expect('Content-Type', /json/)
					.expect(200)
					.end(function (err, res) {
						//console.log(res.body);
						node.expect(res.body).to.have.property('success').to.be.true;
						node.onNewBlock(function (err) {
							node.expect(err).to.be.not.ok;
							var transaction = node.crypti.signature.createSignature(account2.password, account2.secondPassword);
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
									var sendTransaction = node.crypti.transaction.createTransaction("1C", 1, account.password);
									node.peer.post('/transactions')
										.set('Accept', 'application/json')
										.set('version',node.version)
										.set('share-port',1)
										.set('port',node.config.port)
										.send({
											transaction: sendTransaction
										})
										.expect('Content-Type', /json/)
										.expect(200)
										.end(function (err, res) {
											//console.log(res.body);
											node.expect(res.body).to.have.property('success').to.be.false;
											done();
										});
								});
						});
					});
			});
	});

	it("Create transaction from account and then send second signature to enable", function (done) {
		node.api.post('/accounts/open')
			.set('Accept', 'application/json')
			.set('version',node.version)
			.set('share-port',1)
			.set('port',node.config.port)
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

							var sendTransaction = node.crypti.transaction.createTransaction("1C", 1, account3.password);
							node.peer.post('/transactions')
								.set('Accept', 'application/json')
								.set('version',node.version)
								.set('share-port',1)
								.set('port',node.config.port)
								.send({
									transaction: sendTransaction
								})
								.expect('Content-Type', /json/)
								.expect(200)
								.end(function (err, res) {
									node.expect(res.body).to.have.property('success').to.be.true;

									var transaction = node.crypti.signature.createSignature(account3.password, account3.secondPassword);
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
											node.expect(res.body).to.have.property('success').to.be.true;

											node.onNewBlock(function (err) {
												node.expect(err).to.be.not.ok;

												node.api.get('/transactions/get?id=' + sendTransaction.id)
													.set('Accept', 'application/json')
													.set('version',node.version)
													.set('share-port',1)
													.set('port',node.config.port)
													.expect('Content-Type', /json/)
													.expect(200)
													.end(function (err, res) {
														node.expect(res.body).to.have.property('success').to.be.true;
														node.expect(res.body).to.have.property('transaction');

														node.api.get('/transactions/get?id=' + transaction.id)
															.set('Accept', 'application/json')
															.set('version',node.version)
															.set('share-port',1)
															.set('port',node.config.port)
															.expect('Content-Type', /json/)
															.expect(200)
															.end(function (err, res) {
																node.expect(res.body).to.have.property('success').to.be.true;
																node.expect(res.body).to.have.property('transaction');

																done();
															});
													});
											}, 10000);
										});
								});
						});
					});
			});
	});
});