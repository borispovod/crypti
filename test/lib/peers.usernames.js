var node = require('./../variables.js'),
	crypto = require('crypto');

var account = node.randomAccount();
var account2 = node.randomAccount();

describe.skip("Peers usernames", function () {
	it("Register username on new account and then try to register another username. Should return not ok", function (done) {
		var transaction = node.crypti.username.createUsername(node.peers_config.account, node.randomDelegateName());
		node.peer.post('/transactions')
			.set('Accept', 'application/json')
			.send({
				transaction: transaction
			})
			.expect('Content-Type', /json/)
			.expect(200)
			.end(function (err, res) {
				node.expect(res.body).to.have.property("success").to.be.true;
				transaction = node.crypti.username.createUsername(node.peers_config.account, node.randomAccount());

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

	it("Register delegate and then username. Should return not ok", function (done) {
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


	it("Register username and then register delegate. Should return not ok", function (done) {
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
});