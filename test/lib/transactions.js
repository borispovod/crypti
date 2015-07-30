/**
 * Ask Sebastian if you have any questions. Last Edit: 24/06/2015
 */

// Requires and node configuration
var node = require('./../variables.js');

// Account info for a RANDOM account (which we create later) - 0 XCR amount | Will act as delegate
var Account1 = node.randomTxAccount();
var Account2 = node.randomTxAccount();
var Account3 = node.randomTxAccount();
var Uaccount = node.randomAccount();

var transactionCount = 0;
var transactionList = [];
var offsetTimestamp = 0;

// Used for calculating amounts
var expectedFee = 0;
var totalTxFee = 0;

// Used for test labeling
var test = 0;

// Print data to console
console.log("Starting transactions-test suite");
console.log("Password for Account 1 is: " + Account1.password);
console.log("Password for Account 2 is: " + Account2.password);

// Starting tests //

describe('Transactions', function() {

    before(function (done) {
        /*
         function openAccount(account) {
         console.log('Opening Account with password: ' + account.password);
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
         node.expect(res.body).to.have.property("success").to.be.true;
         account.address = res.body.account.address;
         account.publicKey = res.body.account.publicKey;
         account.balance = res.body.account.balance;
         });
         }

         openAccount(Account1);
         openAccount(Account2);
         */
        /*
         function sendXCR(account) {
         console.log("PRINTING ACCOUNT:");
         console.log(account);
         console.log('We send the XCR from foundation account to account. Recipient is: ' + account.address);
         setTimeout(function () {
         randomXCR = (Math.random() * 1000000000000).toFixed(0);
         expectedFee = (randomXCR * node.transactionFee).toFixed(0);
         node.api.put('/transactions')
         .set('Accept', 'application/json')
         .send({
         secret: node.Faccount.password,
         amount: randomXCR,
         recipientId: account.address
         })
         .expect('Content-Type', /json/)
         .expect(200)
         .end(function (err, res) {
         console.log(res.body);
         console.log('Sent to ' + account.address + ' ' + (randomXCR / node.normalizer) + ' XCR');
         console.log('Expected fee (paid by sender): ' + expectedFee / node.normalizer + ' XCR');
         node.expect(res.body).to.have.property("success").to.be.true;
         if (res.body.success == true) {
         account.transactions.push(transactionCount);
         transactionCount += 1;
         totalTxFee += (expectedFee / node.normalizer);
         account.balance += randomXCR;
         transactionList[transactionCount - 1] = {
         'sender': node.Faccount.address,
         'recipient': account.address,
         'brutoSent': (randomXCR + expectedFee) / node.normalizer,
         'fee': expectedFee / node.normalizer,
         'nettoSent': randomXCR / node.normalizer,
         'txId': res.body.transactionId
         }
         }
         // console.log("Tx " + JSON.stringify(transactionList[transactionCount-1]));
         // console.log("Account: " + JSON.stringify(account));
         // console.log("Total Tx Fee: " + totalTxFee);
         });
         }, 2000);
         }

         sendXCR(Account1);
         sendXCR(Account2);
         done();
         */
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
                secret: Account3.password,
                secondSecret: Account3.secondPassword
            })
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (err, res) {
                console.log(res.body);
                console.log('Opening Account 3 with password: ' + Account3.password);
                node.expect(res.body).to.have.property("success").to.be.true;
                if (res.body.success == true && res.body.account != null) {
                    Account3.address = res.body.account.address;
                    Account3.publicKey = res.body.account.publicKey;
                    Account3.balance = res.body.account.balance;
                }
                else{
                    console.log('Unable to open account3, tests will fail');
                    console.log('Data sent: secret: ' + Account3.password + ' , secondSecret: ' + Account3.secondPassword );
                    node.expect("TEST").to.equal("FAILED");
                }
                done();
            });
    });

    before(function (done) {
        // SEND XCR TO ACCOUNT 1 ADDRESS
        setTimeout(function() {
            randomXCR = node.randomizeXCR();
            expectedFee = node.expectedFee(randomXCR);
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
                    if (res.body.success == true && res.body.transactionId != null) {
                        console.log('Sent to ' + Account1.address + ' ' + (randomXCR / node.normalizer) + ' XCR');
                        console.log('Expected fee (paid by sender): ' + expectedFee / node.normalizer + ' XCR');
                        Account1.transactions.push(transactionCount);
                        transactionCount += 1;
                        totalTxFee += (expectedFee / node.normalizer);
                        Account1.balance += randomXCR;
                        transactionList[transactionCount - 1] = {
                            'sender': node.Faccount.address,
                            'recipient': Account1.address,
                            'brutoSent': (randomXCR + expectedFee) / node.normalizer,
                            'fee': expectedFee / node.normalizer,
                            'nettoSent': randomXCR / node.normalizer,
                            'txId': res.body.transactionId,
                            'type':node.TxTypes.SEND
                        }
                    }
                    else{
                        console.log("Sending XCR to Account1 failed.");
                        console.log("Sent: secret: " + node.Faccount.password + ", amount: " + randomXCR + ", recipientId: " + Account1.address );
                        node.expect("TEST").to.equal("FAILED");
                    }
                    done();
                    /*
                     console.log("Tx " + JSON.stringify(transactionList[transactionCount-1]));
                     console.log("Account: " + JSON.stringify(account));
                     console.log("Total Tx Fee: " + totalTxFee);
                     */
                });
        },2000);
    });

    before(function (done) {
        // SEND XCR TO ACCOUNT 2 ADDRESS
        setTimeout(function() {
            randomXCR = node.randomizeXCR();
            expectedFee = node.expectedFee(randomXCR);
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
                    console.log('We send the XCR from foundation account to account. Recipient is: ' + Account2.address);
                    console.log('Sent to ' + Account2.address + ' ' + (randomXCR / node.normalizer) + ' XCR');
                    console.log('Expected fee (paid by sender): ' + expectedFee / node.normalizer + ' XCR');
                    node.expect(res.body).to.have.property("success").to.be.true;
                    if (res.body.success == true && res.body.transactionId != null) {
                        Account2.transactions.push(transactionCount);
                        transactionCount += 1;
                        totalTxFee += (expectedFee / node.normalizer);
                        Account2.balance += randomXCR;
                        transactionList[transactionCount - 1] = {
                            'sender': node.Faccount.address,
                            'recipient': Account2.address,
                            'brutoSent': (randomXCR + expectedFee) / node.normalizer,
                            'fee': expectedFee / node.normalizer,
                            'nettoSent': randomXCR / node.normalizer,
                            'txId': res.body.transactionId,
                            'type':node.TxTypes.SEND
                        }
                    }
                    else{
                        console.log("Sending XCR to Account2 failed.");
                        console.log("Sent: secret: " + node.Faccount.password + ", amount: " + randomXCR + ", recipientId: " + Account2.address );
                        node.expect("TEST").to.equal("FAILED");
                    }
                    done();
                    /*
                     console.log("Tx " + JSON.stringify(transactionList[transactionCount-1]));
                     console.log("Account: " + JSON.stringify(account));
                     console.log("Total Tx Fee: " + totalTxFee);
                     */
                });
        },2000);
    });

    before(function (done) {

        // Wait for new block to ensure all data has been recieved
        node.onNewBlock(function(err) {
			node.expect(err).to.be.not.ok;
            console.log("ACCOUNT 1:" + Account1);
            console.log("ACCOUNT 2:" + Account2);
            done();
        });
    });

        describe('/transactions', function () {
            test = test + 1;
            it(test + '. Attempting to get transactions list. Expecting success', function (done) {
                var senderId = node.Faccount.address, blockId = '', recipientId = Account1.address, limit = 10, offset = 0, orderBy = 't_amount:asc';

                node.api.get('/transactions?blockId=' + blockId + '&senderId=' + senderId + '&recipientId=' + recipientId + '&limit=' + limit + '&offset=' + offset + '&orderBy=' + orderBy)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.true;
                        node.expect(res.body).to.have.property("transactions").that.is.an('array');
                        node.expect(res.body.transactions).to.have.length.within(transactionCount, limit);
                        if (res.body.transactions.length > 0){
                            for (var i=0; i < res.body.transactions.length; i++){
                                if (res.body.transactions[i+1] != null){
                                    node.expect(res.body.transactions[i].amount).to.be.at.most(res.body.transactions[i+1].amount);
                                }
                            }
                        }
                        else{
                            console.log("Request failed. Expected success");
                            node.expect("TEST").to.equal("FAILED");
                        }
                        done();
                    });
            });

            test = test + 1;
            it(test + '. Attempting to get transactions list. Invalid limit. Expecting error', function (done) {
                var senderId = node.Faccount.address, blockId = '', recipientId = Account1.address, limit = 999999, offset = 0, orderBy = 't_amount:asc';

                node.api.get('/transactions?blockId=' + blockId + '&senderId=' + senderId + '&recipientId=' + recipientId + '&limit=' + limit + '&offset=' + offset + '&orderBy=' + orderBy)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            });

            test = test + 1;
            it(test + '. Attempting to get transactions list. Order by timestamp. Expecting success', function (done) {
                var senderId = '', blockId = '', recipientId = '', limit = 100, offset = 0, orderBy = 't_timestamp:asc';

                node.onNewBlock(function(err){
                    node.api.get('/transactions?blockId=' + blockId + '&recipientId=' + recipientId + '&limit=' + limit + '&offset=' + offset + '&orderBy=' + orderBy)
                        .set('Accept', 'application/json')
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            node.expect(res.body).to.have.property("transactions").that.is.an('array');
                            node.expect(res.body.transactions).to.have.length.within(transactionCount, limit);
                            if (res.body.transactions.length > 0) {
                                var flag = 0;
                                for (var i = 0; i < res.body.transactions.length; i++) {
                                    if (res.body.transactions[i + 1] != null) {
                                        node.expect(res.body.transactions[i].timestamp).to.be.at.most(res.body.transactions[i + 1].timestamp);
                                        if (flag == 0) {
                                            offsetTimestamp = res.body.transactions[i + 1].timestamp;
                                            flag = 1;
                                        }
                                    }
                                }
                            }
                            else{
                                console.log("Request failed. Expected success");
                                node.expect("TEST").to.equal("FAILED");
                            }
                            done();
                        });
                });
            });

            test = test + 1;
            it(test + '. Attempting to get transactions list. Using Offset. Expecting success', function (done) {
                var senderId = '', blockId = '', recipientId = '', limit = 100, offset = 1, orderBy = 't_timestamp:asc';
                node.onNewBlock(function(err) {
                    node.api.get('/transactions?blockId=' + blockId + '&recipientId=' + recipientId + '&limit=' + limit + '&offset=' + offset + '&orderBy=' + orderBy)
                        .set('Accept', 'application/json')
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            node.expect(res.body).to.have.property("transactions").that.is.an('array');
                            node.expect(res.body.transactions).to.have.length.within(transactionCount, limit);
                            if (res.body.transactions.length > 0) {
                                node.expect(res.body.transactions[0].timestamp).to.be.equal(offsetTimestamp);
                            }
                            done();
                        });
                });
            });

            test = test + 1;
            it(test + '. Attempting to get transactions list. Using Offset as TEXT. Expecting error', function (done) {
                var senderId = '', blockId = '', recipientId = '', limit = 100, offset = 'ONE', orderBy = 't_timestamp:asc';
                node.api.get('/transactions?blockId=' + blockId + '&recipientId=' + recipientId + '&limit=' + limit + '&offset=' + offset + '&orderBy=' + orderBy)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                   });
            });

            test = test + 1;
            it(test + '. Attempting to get transactions list. No limit. Expecting success', function (done) {
                var senderId = node.Faccount.address, blockId = '', recipientId = Account1.address, offset = 0, orderBy = 't_amount:desc';

                node.api.get('/transactions?blockId=' + blockId + '&senderId=' + senderId + '&recipientId=' + recipientId + '&offset=' + offset + '&orderBy=' + orderBy)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.true;
                        node.expect(res.body).to.have.property("transactions").that.is.an('array');
                        if (res.body.transactions.length > 0){
                            for (var i = 0; i < res.body.transactions.length; i++){
                                if (res.body.transactions[i+1] != null){
                                    node.expect(res.body.transactions[i].amount).to.be.at.least(res.body.transactions[i+1].amount);
                                }
                            }
                        }
                        done();
                    });
            });

            test = test + 1;
            it(test + '. Attempting to get transactions list. Sending INVALID FIELDS. Expecting error', function (done) {
                var senderId = "notAReadAddress", blockId = 'about5', recipientId = 'XCRLIOnair3', limit = 'aLOT', offset = 'Boris', orderBy = 't_blockId:asc';

                node.api.get('/transactions?blockId=' + blockId + '&senderId=' + senderId + '&recipientId=' + recipientId + '&limit=' + limit + '&offset=' + offset + '&orderBy=' + orderBy)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            });

            test = test + 1;
            it(test + '. Attempting to get transactions list. Sending PARTIAL INVALID FIELDS. Expecting error', function (done) {
                var senderId = "notAReadAddress", blockId = 'about5', recipientId = Account1.address, limit = 'aLOT', offset = 'Boris', orderBy = 't_blockId:asc';
                node.onNewBlock(function(err){
					node.expect(err).to.be.not.ok;
					node.api.get('/transactions?blockId=' + blockId + '&senderId=' + senderId + '&recipientId=' + recipientId + '&limit=' + limit + '&offset=' + offset + '&orderBy=' + orderBy)
						.set('Accept', 'application/json')
						.expect('Content-Type', /json/)
						.expect(200)
						.end(function (err, res) {
							console.log(res.body);
							node.expect(res.body).to.have.property("success").to.be.false;
							node.expect(res.body).to.have.property("error");
							/*
							node.expect(res.body.count).to.equal(1);
							node.expect(res.body.transactions[0].senderId).to.equal(node.Faccount.address);
							node.expect(res.body.transactions[0].senderPublicKey).to.equal(node.Faccount.publicKey);
							node.expect(res.body.transactions[0].recipientId).to.equal(Account1.address);
							node.expect(res.body.transactions[0].amount).to.equal(Account1.balance);
							*/
							done();
						});
                });
            });

            test += 1;
            it(test + '. We send XCR from Account 1 (' + Account1.password + ') to Account 2 (' + Account2.address + ') - valid data. We expect success',function(done){
                node.onNewBlock(function(err) {
					node.expect(err).to.be.not.ok;
                    amountToSend = 100000000;
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            amount: amountToSend,
                            recipientId: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            node.expect(res.body).to.have.property("transactionId");
                            if (res.body.success == true && res.body.transactionId != null){
                                expectedFee = node.expectedFee(amountToSend);
                                Account1.balance -= (amountToSend + expectedFee);
                                Account2.balance += amountToSend;
                                Account1.transactions.push(transactionCount);
                                transactionList[transactionCount] = {
                                    'sender': Account1.address,
                                    'recipient': Account2.address,
                                    'brutoSent': (amountToSend + expectedFee) / node.normalizer,
                                    'fee': expectedFee / node.normalizer,
                                    'nettoSent': amountToSend / node.normalizer,
                                    'txId': res.body.transactionId,
                                    'type': node.TxTypes.SEND
                                }
                                transactionCount += 1;
                            }
                            else{
                                console.log("Failed Tx or transactionId is null");
                                console.log("Sent: secret: " + Account1.password + ", amount: " + amountToSend + ", recipientId: " + Account2.address);
                                node.expect("TEST").to.equal("FAILED");
                            }
                            done();
                        });
                });
            });

            test += 1;
            it(test + '. We attempt to GET the UNCONFIRMED TX. We expect success',function(done){
                node.api.get('/transactions/unconfirmed/get?id=' + transactionList[transactionCount-1].txId)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success"); //.to.be.true;
                        if (res.body.success == true){
                            if (res.body.transaction != null){
                                node.expect(res.body.transaction.id).to.equal(transactionList[transactionCount-1].txId);
                            }
                        }
                        else{
                            console.log("Transaction already processed");
                            node.expect(res.body).to.have.property("error");
                        }
                        /*
                        node.expect(res.body).to.have.property("transaction").that.is.an('object');
                        node.expect(res.body.transaction).to.have.property("type").to.equal(node.TxTypes.SEND);
                        node.expect(res.body.transaction).to.have.property("id").to.equal(transactionList[transactionCount-1].txId);
                        node.expect(res.body.transaction).to.have.property("amount").to.equal((transactionList[transactionCount-1].nettoSent * node.normalizer));*/
                        done();
                    });
            });

            test += 1;
            it(test + '. We try to send NEGATIVE XCR VALUE from Account 1 to Account 2. We expect error',function(done){
                    amountToSend = -100000000;
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            amount: amountToSend,
                            recipientId: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
            });

            test += 1;
            it(test + '. We try to send INVALID XCR VALUE from Account 1 to Account 2. We expect error',function(done){
                amountToSend = 1.2;
                node.api.put('/transactions')
                    .set('Accept', 'application/json')
                    .send({
                        secret: Account1.password,
                        amount: amountToSend,
                        recipientId: Account2.address
                    })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            });

            test += 1;
            it(test + '. We try to send 100% XCR as amout from Account 1 to Account 2. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            amount: Account1.balance,
                            recipientId: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to send 0 XCR from Account 1 to Account 2. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            amount: 0,
                            recipientId: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to send VERY LARGE XCR NUMBER from Account 1 to Account 2. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            amount: 1298231812939123812939123912939123912931823912931823912903182309123912830123981283012931283910231203,
                            recipientId: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to send VERY LARGE NEGATIVE XCR NUMBER of XCR from Account 1 to Account 2. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            amount: -1298231812939123812939123912939123912931823912931823912903182309123912830123981283012931283910231203,
                            recipientId: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to send VERY SMALL XCR NUMBER (0.00000001) from Account 1 to Account 2. We get success',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            amount: 1,
                            recipientId: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
							node.expect(res.body).to.have.property("transactionId");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to send VERY SMALL NEGATIVE XCR NUMBER (0.00000001) from Account 1 to Account 2. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            amount: -1,
                            recipientId: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to send XCR WITHOUT PASSWORD. We expect error',function(done){
                amountToSend = 100000000;
                node.api.put('/transactions')
                    .set('Accept', 'application/json')
                    .send({
                        amount: amountToSend,
                        recipientId: Account2.address
                    })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            });

            test += 1;
            it(test + '. We try to send XCR WITHOUT RECIPIENT. We expect error',function(done){
                amountToSend = 100000000;
                node.api.put('/transactions')
                    .set('Accept', 'application/json')
                    .send({
                        secret: Account1.password,
                        amount: amountToSend
                    })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            });

            test += 1;
            it(test + '. We attempt to GET TX by ID. We expect success',function(done){
                var transactionInCheck = transactionList[0];
                node.api.get('/transactions/get?id='+transactionInCheck.txId)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.true;
                        node.expect(res.body).to.have.property("transaction").that.is.an('object');
                        if (res.body.success == true && res.body.transaction.id != null){
                            node.expect(res.body.transaction.id).to.equal(transactionInCheck.txId);
                            node.expect(res.body.transaction.amount / node.normalizer).to.equal(transactionInCheck.nettoSent);
                            node.expect(res.body.transaction.fee / node.normalizer).to.equal(transactionInCheck.fee);
                            node.expect(res.body.transaction.recipientId).to.equal(transactionInCheck.recipient);
                            node.expect(res.body.transaction.senderId).to.equal(transactionInCheck.sender);
                            node.expect(res.body.transaction.type).to.equal(transactionInCheck.type);
                        }
                        else{
                            console.log("Transaction failed or transaction list is null");
                            node.expect("TEST").to.equal("FAILED");
                        }
                        done();
                    });
            });

            test += 1;
            it(test + '. We attempt to GET TX by ID but send INVALID ID. We expect error',function(done){
                node.api.get('/transactions/get?id=NotTxId')
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            });

            test += 1;
            it(test + '. We attempt to GET TX by TYPE. We expect success',function(done){
                node.api.get('/transactions?type=' + node.TxTypes.SEND)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.true;
                        if (res.body.success == true && res.body.transactions != null){
                            for (var i=0; i < res.body.transactions.length; i++){
                                if (res.body.transactions[i] != null){
                                    node.expect(res.body.transactions[i].type).to.equal(node.TxTypes.SEND);
                                }
                            }
                        }
                        else{
                            console.log("Request failed or transaction list is null");
                            node.expect("TEST").to.equal("FAILED");
                        }
                        done();
                    });
            });

            test += 1;
            it(test + '. We attempt to GET ALL UNCONFIRMED TX. We expect success',function(done){
                node.api.get('/transactions/unconfirmed')
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.true;
                        node.expect(res.body).to.have.property("transactions").that.is.an('array');
                        done();
                    });
            });

            test += 1;
            it(test + '. We attempt to created 2nd password from account with 0 XCR. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                node.api.put('/signatures')
                    .set('Accept', 'application/json')
                    .send({
                        secret: Account3.password,
                        secondSecret: Account3.password
                    })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            }, 1000);
            });

            test += 1;
            it(test + '. We attempt to created 2nd password for Account 1, but sending INVALID SECRET. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                node.api.put('/signatures')
                    .set('Accept', 'application/json')
                    .send({
                        secret: "Account1.password",
                        secondSecret: Account1.password
                    })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            }, 1000);
            });

            test += 1;
            it(test + '. We attempt to created 2nd password for Account 1, but not sending 2nd pass. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                node.api.put('/signatures')
                    .set('Accept', 'application/json')
                    .send({
                        secret: Account1.password
                    })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.false;
                        node.expect(res.body).to.have.property("error");
                        done();
                    });
            }, 1000);
            });

            test += 1;
            it(test + '. We attempt to created 2nd password' + (Account1.secondPassword) + ' for Account 1. We expect success',function(done){
                this.timeout(5000);
                setTimeout(function(){
                node.api.put('/signatures')
                    .set('Accept', 'application/json')
                    .send({
                        secret: Account1.password,
                        secondSecret: Account1.secondPassword
                    })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.true;
                        node.expect(res.body).to.have.property("transaction").that.is.an('object');
                        if (res.body.success == true && res.body.transaction != null){
                            node.expect(res.body.transaction).to.have.property("type").to.equal(node.TxTypes.SIGNATURE);
                            node.expect(res.body.transaction).to.have.property("senderPublicKey").to.equal(Account1.publicKey);
                            node.expect(res.body.transaction).to.have.property("senderId").to.equal(Account1.address);
                            node.expect(res.body.transaction).to.have.property("fee").to.equal(node.Fees.secondPasswordFee);
                            Account1.transactions.push(transactionCount);
                            transactionCount += 1;
                            Account1.balance -= node.Fees.secondPasswordFee;
                            transactionList[transactionCount - 1] = {
                                'sender': Account1.address,
                                'recipient': 'SYSTEM',
                                'brutoSent': 0,
                                'fee': node.Fees.secondPasswordFee,
                                'nettoSent': 0,
                                'txId': res.body.transaction.id,
                                'type':node.TxTypes.SIGNATURE
                            }
                        }
                        else {
                            console.log("Transaction failed or transaction object is null");
                            console.log("Sent: secret: " + Account1.password + ", secondSecret: " + Account1.secondPassword);
                            node.expect("TEST").to.equal("FAILED");
                        }
                        done();
                    });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to send XCR WITHOUT SECOND PASSWORD. We expect error',function(done){
                amountToSend = 100000000;
                node.onNewBlock(function(err){
					node.expect(err).to.be.not.ok;

					node.api.put('/transactions')
						.set('Accept', 'application/json')
						.send({
							secret: Account1.password,
							recipientId: Account2.address,
							amount: amountToSend
						})
						.expect('Content-Type', /json/)
						.expect(200)
						.end(function (err, res) {
							console.log(res.body);
							node.expect(res.body).to.have.property("success").to.be.false;
							node.expect(res.body).to.have.property("error");
							done();
						});
                });
            });

            test += 1;
            it(test + '. We try to send XCR WITH SECOND PASSWORD but NO SECRET. We expect error',function(done){
                amountToSend = 100000000;
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secondSecret: Account1.secondPassword,
                            recipientId: Account2.address,
                            amount: amountToSend
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to REGISTER USERNAME, no secret. We expect error',function(done){
                amountToSend = 100000000;
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secondSecret: Account1.secondPassword,
                            username: Account1.username
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to REGISTER USERNAME, no second secret. We expect error',function(done){
                amountToSend = 100000000;
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            username: Account1.username
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to REGISTER USERNAME, no username. We expect error',function(done){
                amountToSend = 100000000;
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            secondSecret: Account1.secondPassword
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to REGISTER USERNAME, VERY LONG username. We expect error',function(done){
                amountToSend = 100000000;
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            secondSecret: Account1.secondPassword,
                            username: "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to REGISTER USERNAME, WITH INVALID CHARACTERS. We expect error',function(done){
                amountToSend = 100000000;
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            secondSecret: Account1.secondPassword,
                            username: "~!@#$%^&*()_+,./?|"
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to REGISTER USERNAME. Valid data. We expect success',function(done){
				console.log(Account1);
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            secondSecret: Account1.secondPassword,
                            username: Account1.username
                       })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            if (res.body.success == true && res.body.transaction != null){
                                Account1.transactions.push(transactionCount);
                                transactionCount += 1;
                                Account1.balance -= node.Fees.usernameFee;
                                transactionList[transactionCount - 1] = {
                                    'sender': Account1.address,
                                    'recipient': 'SYSTEM',
                                    'brutoSent': 0,
                                    'fee': node.Fees.usernameFee,
                                    'nettoSent': 0,
                                    'txId': res.body.transaction.id,
                                    'type':node.TxTypes.SIGNATURE
                                }
                            }
                            else {
                                console.log("Transaction failed or transaction object is null");
                                console.log("Sent: secret: " + Account1.secret + ", secondSecret: " + Account1.secondPassword + ", username: " + Account1.username);
                                node.expect("TEST").to.equal("FAILED");
                            }
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We try to REGISTER USERNAME with capital letter. We expect success',function(done){
                console.log(Account2);
                var capitalUsername = node.randomCapitalUsername();
                node.onNewBlock(function(err) {
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account2.password,
                            secondSecret: Account2.secondPassword,
                            username: capitalUsername
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            if (res.body.success == true && res.body.transaction != null){
                                Account2.transactions.push(transactionCount);
                                transactionCount += 1;
                                Account2.balance -= node.Fees.usernameFee;
                                Account2.username = capitalUsername;
                                transactionList[transactionCount - 1] = {
                                    'sender': Account2.address,
                                    'recipient': 'SYSTEM',
                                    'brutoSent': 0,
                                    'fee': node.Fees.usernameFee,
                                    'nettoSent': 0,
                                    'txId': res.body.transaction.id,
                                    'type':node.TxTypes.SIGNATURE
                                }
                            }
                            else {
                                console.log("Transaction failed or transaction object is null");
                                console.log("Sent: secret: " + Account2.secret + ", secondSecret: " + Account2.secondPassword + ", username: " + capitalUsername);
                                node.expect("TEST").to.equal("FAILED");
                            }
                            done();
                        });
                });
            });

            test += 1;
            it(test + '. We try to REGISTER SAME USERNAME FROM DIFFERENT ACCOUNT. We expect error',function(done){
                node.onNewBlock(function(err) {
					node.expect(err).to.be.not.ok;
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account2.password,
                            secondSecret: Account2.secondPassword,
                            username: Account1.username
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                });
            });

            test += 1;
            it(test + '. We try to REGISTER SAME USERNAME FROM FROM SAME ACCOUNT. We expect error',function(done){
                node.onNewBlock(function(err){
                    node.api.put('/accounts/username')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            secondSecret: Account1.secondPassword,
                            username: Account1.username
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                });
            });

            test += 1;
            it(test + '. We try to SEND XCR to USERNAME. We expect success',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    amountToSend = 100000000;
                    node.api.put('/transactions')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account2.password,
                            secondSecret: Account2.secondSecret,
                            amount: amountToSend,
                            recipientId: Account1.username
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            node.expect(res.body).to.have.property("transactionId");
                            if (res.body.success == true && res.body.transactionId != null){
                                expectedFee = node.expectedFee(amountToSend);
                                Account2.balance -= (amountToSend + expectedFee);
                                Account1.balance += amountToSend;
                                Account2.transactions.push(transactionCount);
                                transactionList[transactionCount] = {
                                    'sender': Account2.address,
                                    'recipient': Account1.address,
                                    'brutoSent': (amountToSend + expectedFee) / node.normalizer,
                                    'fee': expectedFee / node.normalizer,
                                    'nettoSent': amountToSend / node.normalizer,
                                    'txId': res.body.transactionId,
                                    'type': node.TxTypes.SEND
                                }
                                transactionCount += 1;
                            }
                            else {
                                console.log("Transaction failed or transactionId is null");
                                console.log("Sent: secret: " + Account2.password + ", secondSecret: " + Account2.secondPassword
                                + ", amount: " + amountToSend + ", recipientId: " + Account1.username);
                                node.expect("TEST").to.equal("FAILED");
                            }
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We attempt to register as delegate without sending 2nd password. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/delegates')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            username: Account1.delegateName
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We attempt to add self as contact. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/contacts')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            secondSecret: Account1.secondPassword,
                            following: Account1.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We attempt to add Account 2 as contact. No password. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/contacts')
                        .set('Accept', 'application/json')
                        .send({
                            following: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We attempt to add contact. We do not send contact address. We expect error',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/contacts')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            secondSecret: Account1.secondPassword
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            node.expect(res.body).to.have.property("error");
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. We attempt to add Account 2 as contact. We expect failure because Account 2 has 0 XCR',function(done){
                this.timeout(5000);
                setTimeout(function(){
                    node.api.put('/contacts')
                        .set('Accept', 'application/json')
                        .send({
                            secret: Account1.password,
                            secondSecret: Account1.secondPassword,
                            following: Account2.address
                        })
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.false;
                            done();
                        });
                }, 1000);
            });

            test += 1;
            it(test + '. Get contacts by publicKey. We expect success',function(done){
                node.onNewBlock(function(err) {
                    node.api.get('/contacts/?publicKey=' + Account1.publicKey)
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            done();
                        });
                });
            });

            test += 1;
            it(test + '. Get account by username. We expect success',function(done){
                node.onNewBlock(function(err) {
                    node.api.get('/accounts/username/get?username=' + Account1.username)
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            if (res.body.success == true && res.body.account != null){
                                node.expect(res.body).to.have.property("account");
                                node.expect(res.body.account.address).to.equal(Account1.address);
                                node.expect(res.body.account.username).to.equal(Account1.username);
                            }
                            else {
                                console.log("Transaction failed or account object is null");
                                console.log("Sent: username= " + Account1.username);
                                node.expect("TEST").to.equal("FAILED");
                            }
                            done();
                        });
                });
            });

            test += 1;
            it(test + '. Get account by username (capital letter). We expect success',function(done){
                node.onNewBlock(function(err) {
                    node.api.get('/accounts/username/get?username=' + Account2.username)
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log("Sent: /accounts/username?get?username=" + Account2.username);
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success").to.be.true;
                            done();
                        });
                });
            });

            test += 1;
            it(test + '. Get account by username. We send INTEGER instead of string.',function(done){
                node.onNewBlock(function(err) {
                    var usernameInt = 1234;
                    node.api.get('/accounts/username/get?username=' + usernameInt)
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (err, res) {
                            console.log(res.body);
                            node.expect(res.body).to.have.property("success");
                            done();
                        });
                });
            });
        });

    describe('Register username AFTER delegate',function() {

        before(function (done) {
            // OPEN UACCOUNT
            console.log("Opening UACCOUNT. PWD: " + Uaccount.password);
            node.api.post('/accounts/open')
                .set('Accept', 'application/json')
                .send({
                    secret: Uaccount.password
                })
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res) {
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    if (res.body.success == true && res.body.account != null){
                        Uaccount.address = res.body.account.address;
                    }
                    else{
                        console.log("Open account failed or account object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        before(function (done) {
            // SEND XCR TO UAccount ADDRESS
            var randomXCR = node.randomizeXCR();
            console.log("Sending XCR to UACCOUNT. Address: " + Uaccount.address);
            node.api.put('/transactions')
                .set('Accept', 'application/json')
                .send({
                    secret: node.Faccount.password,
                    amount: randomXCR,
                    recipientId: Uaccount.address
                })
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res) {
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    done();
                });
        });

        before(function (done) {
            // REGISTER DELEGATE
            node.onNewBlock(function(err) {
                node.api.put('/delegates')
                    .set('Accept', 'application/json')
                    .send({
                        secret: Uaccount.password,
                        username: Uaccount.delegateName
                    })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res) {
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.true;
                        node.expect(res.body).to.have.property("transaction").that.is.an('object');
                        done();
                    });
            });
        });

        test += 1;
        it(test + '. We attempt to register as username from account that is delegate: Account: ' + Uaccount.password + '. We expect success',function(done){
            // REGISTER USERNAME
            console.log(Uaccount);
            node.onNewBlock(function(err) {
                node.api.put('/accounts/username')
                    .set('Accept', 'application/json')
                    .send({
                        secret: Uaccount.password,
                        username: Uaccount.username
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