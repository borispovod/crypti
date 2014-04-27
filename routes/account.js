var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum');

module.exports = function (app) {
    app.get("/unlock", function (req, res) {
        var username = req.query.username || "",
            password = req.query.password || "";

        if (password.length == 0 || username.length == 0) {
            return res.json({ success : false, error : "Username or password not provided" })
        }

        var hash = crypto.createHash('sha256').update(username + password, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);


        var publicKeyHash = crypto.createHash('sha256').update(keypair.publicKey).digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = publicKeyHash[7-i];
        }

        var address = bignum.fromBuffer(temp).toString() + "C";
        var accountprocessor = req.accountprocessor;

        accountprocessor.getBalance(address, function (err, balance) {
            if (err) {
                console.log(err);
                return res.json({ success : false, error : err });
            } else {
                return res.json({ success : true, address : address, publicKey : keypair.publicKey.toString('hex'), balance : balance });
            }
        });

    });

    app.get("/getPublicKey", function (req, res) {
        var username = req.query.username || "",
            password = req.query.password || "";

        if (password.length == 0 || username.length == 0) {
            return res.json({ success : false, error : "Username or password not provided" })
        }

        var hash = crypto.createHash('sha256').update(username + password, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        res.json({ success : true, publicKey : keypair.publicKey.toString('hex') });
    });

    app.get("/getAddress", function (req, res) {
        var username = req.query.username || "",
            password = req.query.password || "";

        if (password.length == 0 || username.length == 0) {
            return res.json({ success : false, error : "Username or password not provided" })
        }

        var hash = crypto.createHash('sha256').update(username + password, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        var publicKeyHash = crypto.createHash('sha256').update(keypair.publicKey).digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = publicKeyHash[7-i];
        }

        var address = bignum.fromBuffer(temp).toString() + "C";
        res.json({ success : true, address : address });
    });

}
