var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    Account = require("../account").account,
    Forger = require("../forger").forger,
    transaction = require("../transactions").transaction,
    utils = require("../utils.js"),
    constants = require('../Constants.js');

module.exports = function (app) {
    app.post("/api/unlock", function (req, res) {
        var secretPharse = req.body.secret || "",
            startForging = false;

        if (startForging == "true") {
            startForging = true;
        } else {
            startForging = false;
        }

        if (secretPharse.length == 0) {
            return res.json({ success : false, error : "SecretPhrase not provided", statusCode : "PROVIDE_SECRET_PHRASE" })
        }

        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        var publicKeyHash = crypto.createHash('sha256').update(keypair.publicKey).digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = publicKeyHash[7-i];
        }

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

        if (app.signatureprocessor.getSignatureByAddress(account.address) || app.signatureprocessor.getUnconfirmedSignatureByAddress(account.address)) {
            account.secondPassphrase = true;
        } else {
            account.secondPassphrase = false;
        }

        //app.logger.info("Account unlocked: " + address);

        if (startForging) {
            if (account.getEffectiveBalance() > 0) {
                app.logger.info("Start forging: " + address);
                var forger = new Forger(address, secretPharse);
                forger.setApp(app);
                var result = app.forgerprocessor.startForger(forger);

                if (result) {
                    app.logger.info("Forger started: " + address);
                    res.json({ success : true, secondPassphrase : account.secondPassphrase, address : address, publickey : account.publickey.toString('hex'), balance : account.balance , unconfirmedBalance : account.unconfirmedBalance, effectiveBalance : account.getEffectiveBalance(), forging : { success : true } });
                } else {
                    app.logger.info("Forger can't start, it's already working: " + address);
                    res.json({ success : true, statusCode : "OK", secondPassphrase : account.secondPassphrase, address : address, publickey : account.publickey.toString('hex'), balance : account.balance, unconfirmedBalance : account.unconfirmedBalance, effectiveBalance : account.getEffectiveBalance(), forging : { error : "Forger can't start, it's already working: " + address, success : false } });

                }
            } else {
                app.logger.info("Can't start forging, effective balance equal to 0: " + address);
                res.json({ success : true, statusCode : "OK", secondPassphrase : account.secondPassphrase, address : address, publickey : account.publickey.toString('hex'), balance : account.balance , unconfirmedBalance : account.unconfirmedBalance , effectiveBalance : account.getEffectiveBalance() , forging : { error : "Can't start forging, effective balance equal to 0: " + address, success : false } });
            }
        } else {
            var info = { success : true, statusCode : "OK", secondPassphrase : account.secondPassphrase, address : address, publickey : account.publickey.toString('hex'), balance : account.balance , unconfirmedBalance : account.unconfirmedBalance , effectiveBalance : account.getEffectiveBalance() };

            if (app.forgerprocessor.getForgers(account.address)) {
                info.forging = true;
            } else {
                info.forging = false;
            }

            res.json(info);
        }
    });

    app.get("/api/getBalance", function (req, res) {
        var address = req.query.address || "";

        if (address.length == 0) {
            return res.json({ success : false, error : "Provide address", statusCode : "PROVIDE_ADDRESS" });
        }

        var account = app.accountprocessor.getAccountById(address);

        var info = {};

        if (!account) {
            info.balance = 0;
            info.unconfirmedBalance = 0;
            info.effectiveBalance = 0;
            info.statusCode = "ACCOUNT_NOT_FOUND";
            info.sucess = false;
        } else {
            if (app.signatureprocessor.getSignatureByAddress(account.address)) {
                account.secondPassphrase = true;
            } else {
                account.secondPassphrase = false;
            }

            info = { success : true, statusCode : "OK", secondPassphrase : account.secondPassphrase, balance : account.balance , unconfirmedBalance : account.unconfirmedBalance, effectiveBalance : account.getEffectiveBalance() };
        }

        return res.json(info);
    });

    app.get("/api/getPublicKey", function (req, res) {
        var secretPharse = req.query.secret || "";

        if (secretPharse.length == 0) {
            return res.json({ success : false, error : "SecretPhrase not provided", status : "SECRET_PHRASE_NOT_PROVIDED" });
        }

        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        res.json({ success : true, publicKey : keypair.publicKey.toString('hex'), status : "OK" });
    });

    app.get("/api/getAddress", function (req, res) {
        var secretPharse = req.query.secret || "";

        if (secretPharse.length == 0) {
            return res.json({ success : false, error : "SecretPhrase not provided", status : "PROVIDE_SECRET_PHRASE" })
        }

        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        var publicKeyHash = crypto.createHash('sha256').update(keypair.publicKey).digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = publicKeyHash[7-i];
        }

        var address = bignum.fromBuffer(temp).toString() + "C";
        res.json({ success : true, address : address, status : "OK" });
    });

    app.all("/api/addPassphrase", function (req, res) {
        var secretPhrase = req.query.secret || req.body.secret || null,
            newPhrase = req.query.secondSecret || req.body.secondSecret || null,
            accountAddress = req.query.accountAddress || req.body.accountAddress || null;

        if (!secretPhrase || !newPhrase) {
            return res.json({ success : false, error : "Provide your secret phrase, your new second secret phrase", status : "PROVIDE_SECRET_PHRASE_AND_NEW_PHRASE" });
        }

        var hash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        if (accountAddress) {
            var address = app.accountprocessor.getAddressByPublicKey(keypair.publicKey);
            if (accountAddress != address) {
                return res.json({ success : false, error: "Invalid passphrase, check your passphrase please", status : "INVALID_SECRET_PASSPHRASE" });
            }
        }

        var fee = 100 * constants.numberLength;
        var totalAmount = 0 + fee;

        var sender = app.accountprocessor.getAccountByPublicKey(keypair.publicKey);

        if (!sender) {
            return res.json({ success : false, error: "Sender account not found", status : "ACCOUNT_NOT_FOUND" });
        } else {
            if (totalAmount > sender.unconfirmedBalance) {
                return res.json({ success: false, error: "Not enough amount", status : "NOT_ENOUGH_BALANCE" });
            } else {
                var t = new transaction(2, null, utils.getEpochTime(new Date().getTime()), keypair.publicKey, null, 0, app.blockchain.getLastBlock().getId(), null);
                t.asset = app.signatureprocessor.generateNewSignature(utils.getEpochTime(new Date().getTime()), secretPhrase, newPhrase);
                t.sign(secretPhrase);

                var r = app.transactionprocessor.processTransaction(t, true);
                if (r) {
                    return res.json({ success: true, transactionId: t.getId(), status : "OK" });
                } else {
                    return res.json({ success : false, error : "Second passphrase already added", status : "SECOND_PASSPHRASE_ALREADY_ADDED" });
                }
            }
        }
    });

    app.post("/api/sendFunds", function (req, res) {
        var secretPharse = req.body.secret,
            amount = req.body.amount * constants.numberLength,
            recipient = req.body.recipient,
            accountAddress = req.body.accountAddress,
            secondPhrase = req.body.secondPhrase || null;

        var fee = parseInt(amount / 100 * app.blockchain.fee);

        if (fee == 0) {
            fee = 1;
        }

        if (isNaN(amount) || isNaN(fee)) {
            return res.json({ success : false, error : "Invalid amount or fee", statusCode : "INVALID_AMOUNT_OR_FEE" });
        }

        if (!secretPharse) {
            return res.json({ success : false, error : "Provide secretPharse", statusCode : "PROVIDE_SECRET_PHRASE" });
        }

        if (!amount) {
            return res.json({ success : false, error: "Provide amount", statusCode : "PROVIDE_AMOUNT" });
        }

        if (!recipient) {
            return res.json({ success : false, error: "Provide recipient", statusCode : "PROVIDE_RECIPIENT" });
        }

        if (!fee) {
            return res.json({ success : false, error: "Provide fee", statusCode : "PROVIDE_FEE" });
        }

        if (amount <= 0 || amount >= 1000 * 1000 * 1000 * constants.numberLength) {
            return res.json({ success : false, error: "Amount must be middle 0 or 99999999", statusCode : "AMOUNT_INVALID" });
        }

        if (fee <= 0 || fee >= 1000 * 1000 * 1000 * constants.numberLength) {
            return res.json({ success : false, error: "Fee must be middle 0 or 99999999", statusCode : "FEE_INVALID" });
        }

        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        if (accountAddress) {
            var address = app.accountprocessor.getAddressByPublicKey(keypair.publicKey);
            if (accountAddress != address) {
                return res.json({ success : false, error: "Invalid passphrase, check your passphrase please", statusCode : "INVALID_PASSPHRASE" });
            }
        }

        var sender = app.accountprocessor.getAccountByPublicKey(keypair.publicKey);

        if (!sender) {
            return res.json({ success : false, error: "Sender account not found", statusCode : "SENDER_ACCOUNT_NOT_FOUND" });
        } else {
            if (amount + fee > sender.unconfirmedBalance) {
                return res.json({ success: false, fee : fee, error: "Not enough amount", statusCode : "NOT_ENOUGH_AMOUNT" });
            } else {
                var type = 0;

                if (recipient[recipient.length - 1] == "D") {
                    type = 1;
                }

                if (type == 1) {
                    if (!app.companyprocessor.addresses[recipient]) {
                        return res.json({ success : false, error : "Invalid merchant address, check it again please", statusCode : "INVALID_MERCHANT_ADDRESS" });
                    }
                }

                // create transaction and send to peers
                var t = new transaction(type, null, utils.getEpochTime(new Date().getTime()), keypair.publicKey, recipient, amount, app.blockchain.getLastBlock().getId(), null);
                t.sign(secretPharse);

                var signature = app.signatureprocessor.getSignatureByAddress(sender.address);

                if (signature) {
                    if (!secondPhrase) {
                        return res.json({ success : false, error : "Provide second secret phrase", statusCode : "PROVIDE_SECOND_PASSPHRASE" });
                    }

                    var secondHash = crypto.createHash('sha256').update(secondPhrase, 'utf8').digest();
                    var secondKeypair = ed.MakeKeypair(secondHash);

                    if (signature.publicKey.toString('hex') != secondKeypair.publicKey.toString('hex')) {
                        return res.json({ success : false, error : "Second passphrase not valid", statusCode : "INVALID_SECOND_PASSPHRASE" });
                    }

                    t.signSignatureGeneration(secondPhrase);
                }

                // send to peers

                // add
                var r = app.transactionprocessor.processTransaction(t, true);

                if (r) {
                    return res.json({ success: true, transactionId: t.getId(), fee : fee });
                } else {
                    return res.json({ success : false, transactionId: t.getId(), fee : fee, error : "Transaction can't be processed, see logs", statusCode : "TRANSACTION_CAN_BE_PROCESSED" });
                }
            }
        }
    });

    app.get("/api/getFee", function (req, res) {
        return res.json ({ success : true, fee : app.blockchain.fee, statusCode : "OK" });
    });
}
