var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    Account = require("../account").account,
    Forger = require("../forger").forger,
    transaction = require("../transactions").transaction,
    utils = require("../utils.js");

module.exports = function (app) {
    app.get("/api/unlock", function (req, res) {
        var secretPharse = req.query.secretPhrase || "",
            startForging = req.query.startForging;

        if (startForging == "true") {
            startForging = true;
        } else {
            startForging = false;
        }

        if (secretPharse.length == 0) {
            return res.json({ success : false, error : "SecretPhrase not provided" })
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

        app.logger.info("Account unlocked: " + address);

        if (startForging) {
            if (account.getEffectiveBalance() > 0) {
                app.logger.info("Start forging: " + address);
                var forger = new Forger(address, secretPharse);
                forger.setApp(app);
                var result = app.forgerprocessor.startForger(forger);

                if (result) {
                    app.logger.info("Forger started: " + address);
                    res.json({ success : true, address : address, publickey : account.publickey.toString('hex'), balance : account.balance, unconfirmedBalance : account.unconfirmedBalance, effectiveBalance : account.getEffectiveBalance(), forging : { success : true } });
                } else {
                    app.logger.info("Forger can't start, it's already working: " + address);
                    res.json({ success : true, address : address, publickey : account.publickey.toString('hex'), balance : account.balance, unconfirmedBalance : account.unconfirmedBalance, effectiveBalance : account.getEffectiveBalance(), forging : { error : "Forger can't start, it's already working: " + address, success : false } });

                }
            } else {
                app.logger.info("Can't start forging, effective balance equal to 0: " + address);
                res.json({ success : true, address : address, publickey : account.publickey.toString('hex'), balance : account.balance, unconfirmedBalance : account.unconfirmedBalance, effectiveBalance : account.getEffectiveBalance(), forging : { error : "Can't start forging, effective balance equal to 0: " + address, success : false } });
            }
        } else {
            var info = { success : true, address : address, publickey : account.publickey.toString('hex'), balance : account.balance, unconfirmedBalance : account.unconfirmedBalance, effectiveBalance : account.getEffectiveBalance() };

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
            return res.json({ success : false, error : "Provide address" });
        }

        var account = app.accountprocessor.getAccountById(address);
        var info = {};

        if (!account) {
            info.balance = 0;
            info.unconfirmedBalance = 0;
            info.effectiveBalance = 0;
        } else {
            info = { success : true, balance : account.balance, unconfirmedBalance : account.unconfirmedBalance, effectiveBalance : account.getEffectiveBalance() };
        }

        return res.json(info);
    });

    app.get("/api/getPublicKey", function (req, res) {
        var secretPharse = req.query.secretPharse || "";

        if (secretPharse.length == 0) {
            return res.json({ success : false, error : "SecretPharse not provided" })
        }

        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        res.json({ success : true, publicKey : keypair.publicKey.toString('hex') });
    });

    app.get("/api/getAddress", function (req, res) {
        var secretPharse = req.query.secretPharse || "";
        var accountAddress = req.query.accountAddress || "";

        if (secretPharse.length == 0) {
            return res.json({ success : false, error : "SecretPharse not provided" })
        }

        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        var publicKeyHash = crypto.createHash('sha256').update(keypair.publicKey).digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = publicKeyHash[7-i];
        }

        var address = bignum.fromBuffer(temp).toString() + "C";
        res.json({ success : true, address : address });
    });

    app.get("/api/deadline", function (req, res) {
        var account = req.query.account || "";
        if (account.length == 0) {
            return res.json({ success : false, error: "Provide account" });
        }

        var forger = app.forgerprocessor.getForgers(account);

        if (!forger) {
            return res.json({ success : false, error : "Account " + account + " not foring." });
        } else {
            return res.json({ success : true, deadline : forger.deadline });
        }
    });


    app.get("/api/startForging", function (req, res) {
        var secretPharse = req.query.secretPharse || "",
            publicKey = req.query.publicKey || "";

        if (secretPharse.length == 0) {
            return res.json({ success : false, error : "SecretPharse not provided" })
        }

        var account = app.accountprocessor.getAccountByPublicKey(new Buffer(publicKey, 'hex'));

        if (!account) {
            return res.json({ success : false, error : "Account not found" });
        }

        if (app.forgerprocessor.getForgers(account.address)) {
            return res.json({ success : false, error : "Account already forging" });
        } else {
            if (account.getEffectiveBalance() > 0) {
                app.logger.info("Start forging: " + account.address);
                var forger = new Forger(account.address, secretPharse);
                forger.setApp(app);
                var result = app.forgerprocessor.startForger(forger);

                if (result) {
                    app.logger.info("Forger started: " + account.address);
                    return res.json({ success : true });
                } else {
                    app.logger.info("Forger can't start, something wrong: " + account.address);
                    return res.json({ success : false, error : "Forger can't start, something wrong: " + account.address });
                }
            } else {
                app.logger.info("Can't start forging, effective balance equal to 0: " + account.address );
                return res.json({ success : false, error : "Can't start forging, effective balance equal to 0: " + account.address });
            }
        }
    });

    app.get("/api/stopForging", function (req, res) {
        var secretPharse = req.query.secretPharse || "";

        if (secretPharse.length == 0) {
            return res.json({ success : false, error : "SecretPharse not provided" })
        }

        var account = app.accountprocessor.getAccountByPublicKey();

        if (!account) {
            return res.json({ success : false, error : "Account not found" });
        }

        var forger = app.forgerprocessor.getForgers(account.address);
        if (forger) {
            forger.stopForge();
            return res.json({ success : true });
            app.logger.info("Forging stopped: " + account.address);
        } else {
            return res.json({ success : false, error : "Account not forging" });
        }
    });

    app.get("/api/sendFree", function (req, res) {
        var addr = req.query.addr || "";

        if (app.addresses.indexOf(addr) >= 0) {
            return res.json({ success : false });
        }

        var secretPharse = "gqSRYEN1jPj1yI9pEufwJ1anlIfG6dLeyHsmosRJt85bWKRURB2NR1kHQNNPn0POtAA4AxuGnaMf5vslWZIJNQtsBaK9fjIvfHh",
            amount = 1000,
            recepient = addr,
            deadline = 1,
            referencedTransaction = null;

        var fee = amount / 100 * 1;

        if (!secretPharse) {
            return res.json({ success : false, error : "Provide secretPharse" });
        }

        if (!amount) {
            return res.json({ success : false, error: "Provide amount" });
        }

        if (!recepient) {
            return res.json({ success : false, error: "Provide recepient" });
        }

        if (!deadline) {
            return res.json({ success : false, error: "Provide deadline" });
        }

        if (!fee) {
            return res.json({ success : false, error: "Provide fee" });
        }

        if (amount <= 0 || amount >= 1000 * 1000 * 1000) {
            return res.json({ success : false, error: "Amount must be middle 0 or 1000000000" });
        }

        if (fee <= 0 || fee >= 1000 * 1000 * 1000) {
            return res.json({ success : false, error: "Fee must be middle 0 or 1000000000" });
        }

        if (deadline <= 0 || deadline > 24) {
            return res.json({ success : false, error: "Deadline must be middle 0 and 25" });
        }


        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        var sender = app.accountprocessor.getAccountByPublicKey(keypair.publicKey);

        if (!sender) {
            return res.json({ success : false, error: "Sender account not found" });
        } else {
            if (amount + fee > sender.unconfirmedBalance) {
                return res.json({ success: false, error: "Balance not found" });
            } else {
                var type = 0;

                if (recepient[recepient.length - 1] == "D") {
                    type = 1;
                }

                // create transaction and send to peers
                var t = new transaction(type, null, utils.getEpochTime(new Date().getTime()), keypair.publicKey, recepient, amount, deadline, fee, referencedTransaction, null);
                t.sign(secretPharse);

                // send to peers

                // add
                app.transactionprocessor.processTransaction(t);

                app.saveAddress(addr);

                return res.json({ success : true, transactionId : t.getId() });
            }
        }
    });

    app.get("/api/sendMoney", function (req, res) {
        var secretPharse = req.query.secretPharse,
            amount = parseFloat(req.query.amount).valueOf(),
            recepient = req.query.recepient,
            deadline = 1,
            accountAddress = req.query.accountAddress,
            //fee = parseInt(req.query.fee),
            referencedTransaction = req.query.referencedTransaction;

        var fee = amount / 100 * 1;

        if (fee % 1 != 0) {
            fee = fee.valueOf();
        }

        if (!secretPharse) {
            return res.json({ success : false, error : "Provide secretPharse" });
        }

        if (!amount) {
            return res.json({ success : false, error: "Provide amount" });
        }

        if (!recepient) {
            return res.json({ success : false, error: "Provide recepient" });
        }

        if (!deadline) {
            return res.json({ success : false, error: "Provide deadline" });
        }

        if (!fee) {
            return res.json({ success : false, error: "Provide fee" });
        }

        if (amount <= 0 || amount >= 1000 * 1000 * 1000) {
            return res.json({ success : false, error: "Amount must be middle 0 or 1000000000" });
        }

        if (fee <= 0 || fee >= 1000 * 1000 * 1000) {
            return res.json({ success : false, error: "Fee must be middle 0 or 1000000000" });
        }

        if (utils.moreThanEightDigits(amount)) {
            return res.json({ success : false, error: "Amount must have less than 8 digits after the dot" });
        }

        if (utils.moreThanEightDigits(fee)) {
            return res.json({ success : false, error: "Fee must have less than 8 digits after the dot" });
        }

        if (deadline <= 0 || deadline > 24) {
            return res.json({ success : false, error: "Deadline must be middle 0 and 25" });
        }


        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        if (accountAddress) {
            var address = app.accountprocessor.getAddressByPublicKey(keypair.publicKey);
            if (accountAddress != address) {
                return res.json({ success : false, error: "Invalid passphrase, check your passphrase please" });
            }
        }

        var sender = app.accountprocessor.getAccountByPublicKey(keypair.publicKey);

        if (!sender) {
            return res.json({ success : false, error: "Sender account not found" });
        } else {
            if (amount + fee > sender.unconfirmedBalance) {
                return res.json({ success: false, error: "Balance not found" });
            } else {
                var type = 0;

                if (recepient[recepient.length - 1] == "D") {
                    type = 1;
                }

                // create transaction and send to peers
                var t = new transaction(type, null, utils.getEpochTime(new Date().getTime()), keypair.publicKey, recepient, amount, deadline, fee, referencedTransaction, null);
                t.sign(secretPharse);

                // send to peers

                // add
                app.transactionprocessor.processTransaction(t);

                return res.json({ success : true, transactionId : t.getId() });
            }
        }
    });

    app.get("/api/getCurrentFee", function (req, res) {
        return res.json ({currentFee : app.blockchain.fee});
    });
}
