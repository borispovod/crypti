var ed  = require('ed25519'),
    bignum = require('bignum'),
    Account = require("../account").account,
    crypto = require("crypto"),
    /*getSECCurveByName = require('../ec').sec,
    ripemd160 = require("../ec").ripemd160,*/
    Address = require("../address").address,
    utils = require("../utils.js");

module.exports = function (app) {
    app.get("/api/newAddress", function (req, res) {
        return res.json({ success : false });
        var secretPharse = req.query.secretPharse || "";
        var accountAddress = req.query.accountAddress || "";

        if (secretPharse.length == 0) {
            return res.json({ success : false, error: "Provide secretPharse" });
        }

        var hash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
        var keypair = ed.MakeKeypair(hash);

        if (accountAddress) {
            var address = app.accountprocessor.getAddressByPublicKey(keypair.publicKey);
            if (accountAddress != address) {
                return res.json({ success : false, error: "Invalid passphrase, check your passphrase please" });
            }
        }

        var account = app.accountprocessor.getAccountByPublicKey(keypair.publicKey);

        if (!account) {
            return res.json({ success : false, error : "Account not found" });
        }

        if (account.getEffectiveBalance() <= 0) {
            return res.json({ success : false, error : "Effective balance equal 0, for add new address please add founds on your account." });
        }

        var params = app.addressprocessor.newAddress();
        var generatorKeypair = params.keypair;
        var address = new Address(1, params.address, keypair.publicKey, generatorKeypair.publicKey, utils.getEpochTime(new Date().getTime()));
        address.sign(generatorKeypair);
        address.signAccount(keypair);

        if (address.verify() && address.accountVerify()) {
            var added = app.addressprocessor.processAddress(address, true);
            if (added) {
                return res.json({ success: true, address: params.address });
            } else {
                return res.json({ success : false, error: "Can't add new address, already exists" });
            }
        } else {
            return res.json({ success : false, error: "Can't verify new address" });
        }
    });
}