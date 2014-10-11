var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    Account = require("../account").account,
    Forger = require("../forger").forger,
    transaction = require("../transactions").transaction,
    utils = require("../utils.js"),
    constants = require('../Constants.js'),
    _ = require('underscore');

module.exports = function (app) {
    app.post("/api/unlock", app.basicAuth, function (req, res) {
        try {
            var secretPharse = req.body.secret || "",
                startForging = false;

            if (startForging == "true") {
                startForging = true;
            } else {
                startForging = false;
            }

            if (secretPharse.length == 0) {
                return res.json({ success: false, error: "SecretPhrase not provided", status: "PROVIDE_SECRET_PHRASE" })
            }

            var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
            console.log(hash.toString('hex'));
            var keypair = ed.MakeKeypair(hash);

            console.log(keypair.publicKey.toString('hex'));

            var publicKeyHash = crypto.createHash('sha256').update(keypair.publicKey).digest();
            var temp = new Buffer(8);
            for (var i = 0; i < 8; i++) {
                temp[i] = publicKeyHash[7 - i];
            }

            console.log(temp.toString('hex'));

            var address = bignum.fromBuffer(temp).toString() + "C";

            var account = app.accountprocessor.getAccountById(address);

            if (!account) {
                account = new Account(address);
                account.setApp(app);
                app.accountprocessor.addAccount(account);
            }

            if (!account.app) {
                account.setApp(app);
            }

            account.publickey = keypair.publicKey;

            if (app.signatureprocessor.getSignatureByAddress(account.address)) {
                account.secondPassphrase = true;
            } else {
                account.secondPassphrase = false;
            }

            var unconfirmedPassphrase = false;

            if (app.signatureprocessor.getUnconfirmedSignatureByAddress(account.address)) {
                unconfirmedPassphrase = true;
            } else {
                unconfirmedPassphrase = false;
            }

            if (startForging) {
                if (account.getEffectiveBalance() > 0) {
                    app.logger.info("Start forging: " + address);
                    var forger = new Forger(address, secretPharse);
                    forger.setApp(app);
                    var result = app.forgerprocessor.startForger(forger);

                    if (result) {
                        app.logger.info("Forger started: " + address);
                        res.json({ success: true, unconfirmedPassphrase: unconfirmedPassphrase, secondPassphrase: account.secondPassphrase, address: address, publickey: account.publickey.toString('hex'), balance: account.balance, unconfirmedBalance: account.unconfirmedBalance, effectiveBalance: account.getEffectiveBalance(), forging: { success: true } });
                    } else {
                        app.logger.info("Forger can't start, it's already working: " + address);
                        res.json({ success: true, unconfirmedPassphrase: unconfirmedPassphrase, status: "OK", secondPassphrase: account.secondPassphrase, address: address, publickey: account.publickey.toString('hex'), balance: account.balance, unconfirmedBalance: account.unconfirmedBalance, effectiveBalance: account.getEffectiveBalance(), forging: { error: "Forger can't start, it's already working: " + address, success: false } });

                    }
                } else {
                    app.logger.info("Can't start forging, effective balance equal to 0: " + address);
                    res.json({ success: true, unconfirmedPassphrase: unconfirmedPassphrase, status: "OK", secondPassphrase: account.secondPassphrase, address: address, publickey: account.publickey.toString('hex'), balance: account.balance, unconfirmedBalance: account.unconfirmedBalance, effectiveBalance: account.getEffectiveBalance(), forging: { error: "Can't start forging, effective balance equal to 0: " + address, success: false } });
                }
            } else {
                var info = { success: true, unconfirmedPassphrase: unconfirmedPassphrase, status: "OK", secondPassphrase: account.secondPassphrase, address: address, publickey: account.publickey.toString('hex'), balance: account.balance, unconfirmedBalance: account.unconfirmedBalance, effectiveBalance: account.getEffectiveBalance() };

                if (app.forgerprocessor.getForgers(account.address)) {
                    info.forging = true;
                } else {
                    info.forging = false;
                }

                res.json(info);
            }
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get("/api/getAccountWeight", app.basicAuth, function (req, res) {
        var accountId = req.query.accountId;

        if (!accountId) {
            return res.json({ success : false, error : "Provide account id", status : "ACCOUNT_ID_INVALID" });
        }

        var account = app.accountprocessor.getAccountById(accountId);

        if (!account) {
            return res.json({ success : false , error : "Account not found", status : "ACCOUNT_NOT_FOUND"});
        }

        return res.json({ success : true, account : accountId, weight : account.weight.toString() });
    });

    app.get("/api/getTopAccounts", function (req, res) {
        try {
            var accounts = _.map(app.accountprocessor.accounts, function (v) { return v; });
            accounts.sort(function compare(a,b) {
                    if (a.balance > b.balance)
                        return -1;
                    if (a.balance < b.balance)
                        return 1;
                    return 0;
            });

            var toShow = 20;
            if (accounts.length < toShow) {
                toShow = accounts.length;
            }

            accounts = accounts.slice(0, toShow);

            return res.json({ success : true, accounts : accounts });
        } catch (e) {
            console.log(e);
            return res.json({ success : false, accounts : [] });
        }
    });

    app.get("/api/getBalance", app.basicAuth, function (req, res) {
        try {
            var address = req.query.address || "";

            if (address.length == 0) {
                return res.json({ success: false, error: "Provide address", status: "PROVIDE_ADDRESS" });
            }

            var unconfirmedPassphrase = false;

            if (app.signatureprocessor.getUnconfirmedSignatureByAddress(address)) {
                unconfirmedPassphrase = true;
            } else {
                unconfirmedPassphrase = false;
            }

            var account = app.accountprocessor.getAccountById(address);

            var info = {};

            if (!account) {
                info.balance = 0;
                info.unconfirmedBalance = 0;
                info.effectiveBalance = 0;
                info.status = "ACCOUNT_NOT_FOUND";
                info.sucess = false;
            } else {
                if (app.signatureprocessor.getSignatureByAddress(account.address)) {
                    account.secondPassphrase = true;
                } else {
                    account.secondPassphrase = false;
                }

                info = { success: true, unconfirmedPassphrase: unconfirmedPassphrase, status: "OK", secondPassphrase: account.secondPassphrase, balance: account.balance, unconfirmedBalance: account.unconfirmedBalance, effectiveBalance: account.getEffectiveBalance() };
            }

            return res.json(info);
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });


    app.get("/api/getPublicKey", app.basicAuth, function (req, res) {
        try {
            var secretPharse = req.query.secret || "";

            if (secretPharse.length == 0) {
                return res.json({ success: false, error: "SecretPhrase not provided", status: "SECRET_PHRASE_NOT_PROVIDED" });
            }

            var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
            var keypair = ed.MakeKeypair(hash);

            res.json({ success: true, publicKey: keypair.publicKey.toString('hex'), status: "OK" });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get("/api/getAddress", app.basicAuth, function (req, res) {
        try {
            var secretPharse = req.query.secret || "";

            if (secretPharse.length == 0) {
                return res.json({ success: false, error: "SecretPhrase not provided", status: "PROVIDE_SECRET_PHRASE" })
            }

            var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
            var keypair = ed.MakeKeypair(hash);

            var publicKeyHash = crypto.createHash('sha256').update(keypair.publicKey).digest();
            var temp = new Buffer(8);
            for (var i = 0; i < 8; i++) {
                temp[i] = publicKeyHash[7 - i];
            }

            var address = bignum.fromBuffer(temp).toString() + "C";
            res.json({ success: true, address: address, status: "OK" });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get('/api/getAddressByPublicKey', app.basicAuth, function (req, res) {
        try {
            var publicKey = req.query.publicKey || "";

            if (publicKey.length == 0) {
                return res.json({ success: false, error: "Provide public key", status: "PROVIDE_PUBLIC_KEY" });
            }

            var publicKey = new Buffer(publicKey, 'hex');
            var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
            var temp = new Buffer(8);
            for (var i = 0; i < 8; i++) {
                temp[i] = publicKeyHash[7 - i];
            }

            var address = bignum.fromBuffer(temp).toString() + "C";
            res.json({ success: true, address: address, status: "OK" });
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.all("/api/addPassphrase", app.basicAuth, function (req, res) {
        try {
            var secretPhrase = req.query.secret || req.body.secret || null,
                newPhrase = req.query.secondSecret || req.body.secondSecret || null,
                accountAddress = req.query.accountAddress || req.body.accountAddress || null;

            if (!secretPhrase || !newPhrase) {
                return res.json({ success: false, error: "Provide your secret phrase, your new second secret phrase", status: "PROVIDE_SECRET_PHRASE_AND_NEW_PHRASE" });
            }

            var hash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
            var keypair = ed.MakeKeypair(hash);

            if (accountAddress) {
                var address = app.accountprocessor.getAddressByPublicKey(keypair.publicKey);
                if (accountAddress != address) {
                    return res.json({ success: false, error: "Invalid passphrase, check your passphrase please", status: "INVALID_SECRET_PASSPHRASE" });
                }
            }

            var fee = 100 * constants.numberLength;
            var totalAmount = 0 + fee;

            var sender = app.accountprocessor.getAccountByPublicKey(keypair.publicKey);

            if (!sender) {
                return res.json({ success: false, error: "Sender account not found", status: "ACCOUNT_NOT_FOUND" });
            } else {
                if (totalAmount > sender.unconfirmedBalance) {
                    return res.json({ success: false, error: "Not enough amount", status: "NOT_ENOUGH_BALANCE" });
                } else {
                    var t = new transaction(2, null, utils.getEpochTime(new Date().getTime()), keypair.publicKey, null, 0);
                    t.asset = app.signatureprocessor.generateNewSignature(utils.getEpochTime(new Date().getTime()), secretPhrase, newPhrase);
                    t.sign(secretPhrase);

                    var r = app.transactionprocessor.processTransaction(t, true);
                    if (r) {
                        return res.json({ success: true, transactionId: t.getId(), status: "OK" });
                    } else {
                        return res.json({ success: false, error: "Second passphrase already added", status: "SECOND_PASSPHRASE_ALREADY_ADDED" });
                    }
                }
            }
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.post("/api/sendFunds", app.basicAuth, function (req, res) {
        try {
            var secretPharse = req.body.secret,
                amount = req.body.amount,
                recipient = req.body.recipient,
                accountAddress = req.body.accountAddress,
                secondPhrase = req.body.secondPhrase || null,
                amountIsInteger = req.body.amountIsInteger || false;

            if (amountIsInteger == false || amountIsInteger == "false") {
                amount *= constants.numberLength;
            }

            var fee = parseInt(amount / 100 * app.blockchain.fee);

            if (fee == 0) {
                fee = 1;
            }

            if (isNaN(amount) || isNaN(fee)) {
                return res.json({ success: false, error: "Invalid amount or fee", status: "INVALID_AMOUNT_OR_FEE" });
            }

            if (!secretPharse) {
                return res.json({ success: false, error: "Provide secretPharse", status: "PROVIDE_SECRET_PHRASE" });
            }

            if (!amount) {
                return res.json({ success: false, error: "Provide amount", status: "PROVIDE_AMOUNT" });
            }

            if (!recipient) {
                return res.json({ success: false, error: "Provide recipient", status: "PROVIDE_RECIPIENT" });
            }

            if (!fee) {
                return res.json({ success: false, error: "Provide fee", status: "PROVIDE_FEE" });
            }

            if (amount <= 0 || amount >= 100 * 1000 * 1000 * constants.numberLength) {
                return res.json({ success: false, error: "Amount must be middle 0 or 99999999", status: "AMOUNT_INVALID" });
            }

            if (fee <= 0 || fee >= 100 * 1000 * 1000 * constants.numberLength) {
                return res.json({ success: false, error: "Fee must be middle 0 or 99999999", status: "FEE_INVALID" });
            }

            var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
            var keypair = ed.MakeKeypair(hash);

            if (accountAddress) {
                var address = app.accountprocessor.getAddressByPublicKey(keypair.publicKey);
                if (accountAddress != address) {
                    return res.json({ success: false, error: "Invalid passphrase, check your passphrase please", status: "INVALID_PASSPHRASE" });
                }
            }

            var sender = app.accountprocessor.getAccountByPublicKey(keypair.publicKey);

            if (!sender) {
                return res.json({ success: false, error: "Sender account not found", status: "SENDER_ACCOUNT_NOT_FOUND" });
            } else {
                if (amount + fee > sender.unconfirmedBalance) {
                    return res.json({ success: false, fee: fee, error: "Not enough amount", status: "NOT_ENOUGH_AMOUNT" });
                } else {
                    var type = 0;

                    if (recipient[recipient.length - 1] == "D") {
                        type = 1;
                    }

                    if (type == 1) {
                        if (!app.companyprocessor.addresses[recipient]) {
                            return res.json({ success: false, error: "Invalid merchant address, check it again please", status: "INVALID_MERCHANT_ADDRESS" });
                        }
                    }

                    // create transaction and send to peers
                    var t = new transaction(type, null, utils.getEpochTime(new Date().getTime()), keypair.publicKey, recipient, amount, null);
                    t.sign(secretPharse);

                    var signature = app.signatureprocessor.getSignatureByAddress(sender.address);

                    if (signature) {
                        if (!secondPhrase) {
                            return res.json({ success: false, error: "Provide second secret phrase", status: "PROVIDE_SECOND_PASSPHRASE" });
                        }

                        var secondHash = crypto.createHash('sha256').update(secondPhrase, 'utf8').digest();
                        var secondKeypair = ed.MakeKeypair(secondHash);

                        if (signature.publicKey.toString('hex') != secondKeypair.publicKey.toString('hex')) {
                            return res.json({ success: false, error: "Second passphrase not valid", status: "INVALID_SECOND_PASSPHRASE" });
                        }

                        t.signSignatureGeneration(secondPhrase);
                    }

                    var r = app.transactionprocessor.processTransaction(t, true);

                    if (r) {
                        return res.json({ success: true, transactionId: t.getId(), fee: fee });
                    } else {
                        return res.json({ success: false, transactionId: t.getId(), fee: fee, error: "Transaction can't be processed, see logs", status: "TRANSACTION_CANT_BE_PROCESSED" });
                    }
                }
            }
        } catch (e) {
            app.logger.error("Exception, notify developers: ");
            app.logger.error(e);
            return res.json({ success : false, error : "Exception", status : "EXCEPTION" });
        }
    });

    app.get("/api/getFee", app.basicAuth, function (req, res) {
        return res.json ({ success : true, fee : app.blockchain.fee, status : "OK" });
    });
}
