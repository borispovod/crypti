var utils = require('../utils.js'),
    Forger = require('../forger').forger;

module.exports = function (app) {
    app.get("/panel/forging", app.forgingPanelAuth, function (req, res) {
        var ip = req.connection.remoteAddress;

        if (app.forgingConfig.whiteList.length > 0 && app.forgingConfig.whiteList.indexOf(ip) < 0) {
            return res.send(403);
        }

        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(app.forgingFile);
        res.end();
    });

    app.get("/forgingApi/getForgingInfo", app.forgingPanelAuth, function (req, res) {
        var ip = req.connection.remoteAddress;

        if (app.forgingConfig.whiteList.length > 0 && app.forgingConfig.whiteList.indexOf(ip) < 0) {
            return res.send(403);
        }

        var forgingEnabled = false;
        if (app.forgerAccountId) {
            forgingEnabled = true;
        }

        return res.json({ success : true, forgingEnabled  : forgingEnabled });
    });

    app.post("/forgingApi/startForging", app.forgingPanelAuth, function (req, res) {
        var ip = req.connection.remoteAddress;

        if (app.forgingConfig.whiteList.length > 0 && app.forgingConfig.whiteList.indexOf(ip) < 0) {
            return res.send(403);
        }

        if (app.forgerKey) {
            return res.json({ success : false, error : "Forging already enabled on another account" });
        }

        var passphrase = req.body.secret;
        var keypair = app.accountprocessor.getKeyPair(passphrase);
        app.forgerKey = keypair;
        app.mytime = utils.getEpochTime(new Date().getTime());
        app.forgerAccountId = app.accountprocessor.getAddressByPublicKey(app.forgerKey.publicKey);

        var acc = app.accountprocessor.getAccountById(app.forgerAccountId);

        if (!acc || acc.getEffectiveBalance() < 1000) {
            app.forgerKey = null;
            app.mytime = null;

            delete app.forgerKey;
            delete app.mytime;
            var addr = app.forgerAccountId;

            app.forgerAccountId = null;
            delete app.forgerAccountId;

            return res.json({ success : false, error : "Not enough balance on account: " + addr + ". Min balance for forging: 1000 XCR."});
        }


        app.logger.info("Forger public key: " + keypair.publicKey.toString('hex'));
        app.logger.info("Forger account: " + app.forgerAccountId);
        app.logger.info("Forging enabled...");
        console.log("Forging enabled...");

        var forger = new Forger(app.forgerAccountId, keypair.publicKey, passphrase);
        forger.setApp(app);
        var result = app.forgerprocessor.startForger(forger);


        if (result) {
            if (req.body.saveToConfig == true) {
                app.writePassphrase(passphrase);
            }

            return res.json({ success: true, account : app.forgerAccountId });
        } else {
            return res.json({ success : false, error : "See logs, something wrong" });
        }
    });

    app.post("/forgingApi/stopForging", app.forgingPanelAuth, function (req, res) {
        var ip = req.connection.remoteAddress;

        if (app.forgingConfig.whiteList.length > 0 && app.forgingConfig.whiteList.indexOf(ip) < 0) {
            return res.send(403);
        }

        if (!app.forgerKey) {
            return res.json({ success : false, error : "Forging not enabled" });
        }

        var passphrase = req.body.secret;
        var keypair = app.accountprocessor.getKeyPair(passphrase);

        if (app.forgerKey.publicKey.toString('hex') != keypair.publicKey.toString('hex')) {
            return res.json({ success : false, error : "Invalid passphrase, account not valid" });
        }

        app.forgerKey = null;
        app.mytime = null;

        delete app.forgerKey;
        delete app.mytime;

        app.forgerprocessor.stopForger(app.forgerAccountId);
        var acc = app.forgerAccountId;
        app.forgerAccountId = null;
        delete app.forgerAccountId;
        app.logger.info("Forging stopped...");
        console.log("Forging stopped...");

        return res.json({ success : true, account : acc });
    });
}